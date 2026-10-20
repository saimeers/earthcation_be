import type { DomainError } from '../../shared/errors'
import { unavailable } from '../../shared/errors'
import { andThen, err, flatMap, fromNullable, map, ok, type Result } from '../../shared/result'
import { headersFor, inspectBuild, type Build, type BuildFile } from './build'
import {
  canActivate, canComplete, canPreview, canReceiveZip, canRemove, INTERRUPTED, originalKey, pointerFor, PREVIEW_TTL_S,
  presignedOnly, publishedPrefix, stateChanged, toNewVersion, versionNotFound, withinLimit, zipMissing,
  type NewVersion, type Version,
} from './domain'
import type { DeploymentDeps, VersionView } from './ports'

type Outcome<T> = Promise<Result<T, DomainError>>
type Body = Readonly<Record<string, unknown>>

export type Upload = { readonly mode: 'presigned' | 'api'; readonly method: 'PUT'; readonly url: string; readonly headers: Readonly<Record<string, string>> }
export type Created = { readonly version: VersionView; readonly upload: Upload }
export type Preview = { readonly url: string; readonly expiresIn: number }
export type DeployStatus = {
  readonly playUrl: string | null
  readonly storage: { readonly originals: string; readonly published: string }
  readonly maxMb: number
  readonly active: { readonly id: string; readonly label: string; readonly activatedAt: Date | null; readonly productVersion: string | null } | null
}

const UPLOAD_CONCURRENCY = 8
const ZIP_HEADERS = { 'Content-Type': 'application/zip' }

const found = async (d: DeploymentDeps, id: string): Outcome<Version> => fromNullable(await d.versions.find(id), versionNotFound)
const viewOf = async (d: DeploymentDeps, id: string): Outcome<VersionView> => fromNullable(await d.versions.view(id), versionNotFound)
const isLocal = (d: DeploymentDeps) => d.storage.published().driver === 'local'

// ── Estado y listado ──────────────────────────────────────────────────────────

const activeOf = (v: Version) => ({
  id: v.id, label: v.label, activatedAt: v.activatedAt,
  productVersion: typeof v.manifest?.product_version === 'string' ? v.manifest.product_version : null,
})

const status = (d: DeploymentDeps) => async (): Promise<DeployStatus> => {
  const activeId = await d.versions.activeId()
  const active = activeId === null ? null : await d.versions.find(activeId)
  return {
    playUrl: isLocal(d) ? null : d.config.playUrl(),
    storage: { originals: d.storage.originals().driver, published: d.storage.published().driver },
    maxMb: d.config.maxMb(), active: active && activeOf(active),
  }
}

const list = (d: DeploymentDeps) => async (): Promise<readonly VersionView[]> => {
  const [versions, activeId] = await Promise.all([d.versions.list(), d.versions.activeId()])
  return versions.map((v) => ({ ...v, is_active: v.id === activeId }))
}

// ── Crear y subir ─────────────────────────────────────────────────────────────

const uploadFor = async (d: DeploymentDeps, id: string, v: NewVersion): Promise<Upload> => {
  const originals = d.storage.originals()
  return originals.driver === 's3'
    ? { mode: 'presigned', method: 'PUT', url: await originals.presignPut(originalKey(id), v.sizeBytes), headers: ZIP_HEADERS }
    : { mode: 'api', method: 'PUT', url: `/api/deploy/versions/${id}/upload`, headers: ZIP_HEADERS }
}

const register = (d: DeploymentDeps, userId: string) => async (v: NewVersion): Outcome<Created> => {
  const id = d.newId()
  const version = await d.versions.create(id, { ...v, s3Key: originalKey(id), uploadedBy: userId })
  return ok({ version, upload: await uploadFor(d, id, v) })
}

const create = (d: DeploymentDeps) => (userId: string, body: Body): Outcome<Created> =>
  andThen(flatMap(toNewVersion(body), (v) => map(withinLimit(v.sizeBytes, d.config.maxMb()), () => v)), register(d, userId))

/** Solo en desarrollo (sin S3): el ZIP llega a la API en el cuerpo del PUT. */
const receiveZip = (d: DeploymentDeps) => async (id: string, zip: Buffer): Outcome<null> => {
  const originals = d.storage.originals()
  if (originals.driver !== 'local') return err(presignedOnly())
  return andThen(found(d, id), async (v) => andThen(canReceiveZip(v), async () => {
    await originals.put(v.s3Key ?? originalKey(id), zip)
    return ok(null)
  }))
}

// ── Publicar en segundo plano ─────────────────────────────────────────────────

const chunks = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

const uploadFiles = async (d: DeploymentDeps, prefix: string, files: readonly BuildFile[]) => {
  const published = d.storage.published()
  await published.removePrefix(prefix) // por si es un reintento
  await chunks(files, UPLOAD_CONCURRENCY).reduce(async (prev, batch) => {
    await prev
    await Promise.all(batch.map((f) => published.put(prefix + f.path, f.data, headersFor(f.path))))
  }, Promise.resolve())
}

const readBuild = async (d: DeploymentDeps, v: Version): Promise<Result<Build, string>> => {
  const entries = d.readZip(await d.storage.originals().getBuffer(v.s3Key ?? originalKey(v.id)))
  return entries === null ? err('El archivo no es un ZIP válido') : inspectBuild(entries)
}

const publishBuild = async (d: DeploymentDeps, v: Version, started: number): Promise<string | null> => {
  const build = await readBuild(d, v)
  if (!build.ok) return build.error
  const prefix = publishedPrefix(v.id)
  await uploadFiles(d, prefix, build.value.files)
  await d.versions.markReady(v.id, { prefix, manifest: build.value.manifest, publishMs: d.now() - started, at: new Date(d.now()) })
  d.log.info(`[deploy] versión ${v.label} publicada (${build.value.files.length} archivos, ${d.now() - started} ms)`)
  return null
}

const failed = async (d: DeploymentDeps, v: Version, reason: string) => {
  d.log.error(`[deploy] falló la versión ${v.label}: ${reason}`)
  await d.versions.markFailed(v.id, reason)
}

const publish = (d: DeploymentDeps) => async (id: string): Promise<void> => {
  const v = await d.versions.find(id)
  if (v?.status !== 'processing') return
  const reason = await publishBuild(d, v, d.now()).catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
  if (reason !== null) await failed(d, v, reason)
}

const startPublishing = (d: DeploymentDeps, v: Version) => async (size: number): Outcome<VersionView> => {
  if (!(await d.versions.startProcessing(v.id, v.status, size))) return err(stateChanged())
  d.enqueue(() => publish(d)(v.id))
  return viewOf(d, v.id)
}

const complete = (d: DeploymentDeps) => (id: string): Outcome<VersionView> =>
  andThen(found(d, id), (v) => andThen(canComplete(v), async () => {
    const size = await d.storage.originals().size(v.s3Key ?? originalKey(id))
    return size === null ? err(zipMissing()) : startPublishing(d, v)(size)
  }))

// ── Activar, borrar y vista previa ────────────────────────────────────────────

const activateReady = (d: DeploymentDeps) => async (v: Version): Outcome<VersionView> => {
  const at = new Date(d.now())
  await d.versions.activate(v.id, at, () => d.storage.published().put('current.json', pointerFor(v, at),
    { contentType: 'application/json', cacheControl: 'no-cache' }))
  return viewOf(d, v.id)
}

const activate = (d: DeploymentDeps) => (id: string): Outcome<VersionView> =>
  andThen(found(d, id), (v) => andThen(canActivate(v), () => activateReady(d)(v)))

const removeVersion = async (d: DeploymentDeps, v: Version): Outcome<null> => {
  await Promise.all([v.s3Key && d.storage.originals().remove(v.s3Key), d.storage.published().removePrefix(publishedPrefix(v.id))])
  await d.versions.remove(v.id)
  return ok(null)
}

const remove = (d: DeploymentDeps) => async (id: string): Outcome<null> => {
  const activeId = await d.versions.activeId()
  return andThen(found(d, id), (v) => andThen(canRemove(v, activeId), () => removeVersion(d, v)))
}

// Token corto que valida el Worker: /v/<id>/?t=<exp>.<firma>, HMAC con PLAY_SIGNING_SECRET (compartido)
const previewToken = (d: DeploymentDeps, id: string): Result<string, DomainError> => {
  const secret = d.config.signingSecret() ?? (isLocal(d) ? 'local-dev' : undefined)
  if (secret === undefined) return err(unavailable('SIGNING_SECRET_MISSING', 'Falta PLAY_SIGNING_SECRET en la API'))
  const exp = Math.floor(d.now() / 1000) + PREVIEW_TTL_S
  return ok(`${exp}.${d.sign(secret, `preview:${id}:${exp}`)}`)
}

/** apiBase: origen de la API, para la vista previa local (/play-local) */
const preview = (d: DeploymentDeps) => (id: string, apiBase: string): Outcome<Preview> =>
  andThen(found(d, id), (v) => andThen(canPreview(v), () => {
    const base = isLocal(d) ? `${apiBase}/play-local` : d.config.playUrl()
    return map(previewToken(d, id), (t) => ({ url: `${base}/v/${id}/?t=${t}`, expiresIn: PREVIEW_TTL_S }))
  }))

export const makeDeployment = (d: DeploymentDeps) => ({
  status: status(d), list: list(d), create: create(d), receiveZip: receiveZip(d), complete: complete(d),
  activate: activate(d), remove: remove(d), preview: preview(d),
  /** Al arrancar: una publicación cortada por un reinicio queda fallida (se puede reintentar). */
  recoverInterrupted: () => d.versions.failInterrupted(INTERRUPTED),
})

export type Deployment = ReturnType<typeof makeDeployment>
