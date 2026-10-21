import { beforeEach, describe, expect, it } from 'vitest'
import {
  InvalidBuildError, SigningSecretMissingError, UploadPresignedOnlyError, VersionBusyError, VersionNotFoundError,
  VersionStateChangedError, ZipBodyRequiredError, ZipMissingError, type Clock, type DeploymentLog,
} from '@earthcation/model'
import {
  ActivateVersionUseCase, CompleteUploadUseCase, CreateVersionUseCase, GetDeployStatusUseCase, GetPlayFileUseCase,
  GetPreviewUrlUseCase, ListVersionsUseCase, PublishVersionUseCase, ReceiveLocalZipUseCase,
  RecoverInterruptedPublishesUseCase, RemoveVersionUseCase,
} from '../../src'
import {
  fakeZips, InMemoryGameVersionRepository, InMemoryOriginals, InMemoryPublished, ManualQueue,
} from '../fakes/InMemoryDeployment'

const clock: Clock = { now: () => new Date(1_000_000) }
const settings = { maxMb: 1, playUrl: 'https://play' }
const text = (s: string) => new TextEncoder().encode(s)

const setup = (kinds: { originals?: 's3' | 'local'; published?: 'r2' | 'local' } = {}, secret: string | null = 'local-dev') => {
  const versions = new InMemoryGameVersionRepository()
  const originals = new InMemoryOriginals(kinds.originals)
  const published = new InMemoryPublished(kinds.published)
  const queue = new ManualQueue()
  const logs: string[] = []
  const log: DeploymentLog = { info: (m) => logs.push(m), error: (m) => logs.push(m) }
  const publish = new PublishVersionUseCase({ versions, originals, published, zips: fakeZips, clock, log })
  const ids = { n: 0, newId() { this.n += 1; return `v${this.n}` } }
  return {
    versions, originals, published, queue, logs, run: () => queue.drain((id) => publish.execute(id)),
    create: new CreateVersionUseCase({ versions, originals, ids, settings }),
    receive: new ReceiveLocalZipUseCase({ versions, originals }),
    complete: new CompleteUploadUseCase({ versions, originals, queue }),
    activate: new ActivateVersionUseCase({ versions, published, clock }),
    remove: new RemoveVersionUseCase({ versions, originals, published }),
    preview: new GetPreviewUrlUseCase({ versions, published, clock, settings, signer: { sign: (p) => (secret === null ? null : `${secret}|${p}`) } }),
    status: new GetDeployStatusUseCase({ versions, originals, published, settings }),
    list: new ListVersionsUseCase(versions),
    play: new GetPlayFileUseCase(published),
  }
}

type Setup = ReturnType<typeof setup>
const newVersion = (d: Setup) => d.create.execute({ label: '1.0', notes: null, sizeBytes: 3, uploadedBy: 'u' })

describe('casos de uso del despliegue', () => {
  let d: Setup
  beforeEach(() => { d = setup() })

  it('subir, publicar, previsualizar y activar', async () => {
    expect((await newVersion(d)).upload).toEqual({ mode: 'api' })
    await d.receive.execute({ id: 'v1', zip: text('zip') })
    expect((await d.complete.execute('v1')).status).toBe('processing')
    await expect(d.complete.execute('v1')).rejects.toThrow(VersionBusyError)
    await d.run()
    expect((await d.versions.findById('v1'))?.toProps()).toMatchObject({ status: 'ready', publishedPrefix: 'builds/v1/', manifest: { productVersion: '1.0' } })
    expect([...d.published.files.keys()].filter((k) => k.startsWith('builds/v1/'))).toHaveLength(5)
    expect(d.published.files.get('builds/v1/Build/x.wasm.br')?.headers).toMatchObject({ contentType: 'application/wasm', contentEncoding: 'br' })
    expect((await d.preview.execute({ id: 'v1', apiBase: 'http://api' })).url).toBe('http://api/play-local/v/v1/?t=8200.local-dev|preview:v1:8200')
    expect((await d.activate.execute('v1')).activatedAt).toEqual(new Date(1_000_000))
    expect(JSON.parse(String(d.published.files.get('current.json')?.body))).toMatchObject({ version_id: 'v1', prefix: 'builds/v1/' })
    expect((await d.status.execute()).active?.productVersion).toBe('1.0')
    expect((await d.list.execute()).map((l) => [l.version.id, l.isActive])).toEqual([['v1', true]])
  })

  it('/play-local: versión activa, vista previa y archivo que falta', async () => {
    expect(await d.play.execute('')).toBeNull()
    await newVersion(d)
    await d.receive.execute({ id: 'v1', zip: text('zip') })
    await d.complete.execute('v1')
    await d.run()
    await d.activate.execute('v1')
    expect((await d.play.execute(''))?.file?.headers.cacheControl).toBe('no-cache')
    const preview = await d.play.execute('v/00000000-0000-0000-0000-000000000000/Build/x.js')
    expect(preview).toEqual({ rest: 'Build/x.js', file: null })
  })

  it('ZIP que no es ZIP o build incompleto queda fallido con el motivo; se reintenta', async () => {
    await newVersion(d)
    await d.receive.execute({ id: 'v1', zip: text('nope') })
    await d.complete.execute('v1')
    await d.run()
    expect((await d.versions.findById('v1'))?.toProps()).toMatchObject({ status: 'failed', error: 'El archivo no es un ZIP válido' })
    await d.originals.put('originals/v1.zip', text('sin-wasm'))
    await d.complete.execute('v1')
    await d.run()
    expect((await d.versions.findById('v1'))?.toProps().error).toBe(new InvalidBuildError('Al build le falta: wasm en la carpeta Build/').message)
    expect(d.logs.at(-1)).toContain('falló la versión 1.0')
  })

  it('errores al subir y completar', async () => {
    await expect(d.receive.execute({ id: 'nada', zip: null })).rejects.toThrow(ZipBodyRequiredError)
    await expect(d.receive.execute({ id: 'nada', zip: text('zip') })).rejects.toThrow(VersionNotFoundError)
    await newVersion(d)
    await expect(d.complete.execute('v1')).rejects.toThrow(ZipMissingError)
    await d.receive.execute({ id: 'v1', zip: text('zip') })
    const stale = await d.versions.findById('v1')
    d.versions.startProcessing = () => Promise.resolve(false)
    await expect(d.complete.execute(stale?.id ?? '')).rejects.toThrow(VersionStateChangedError)
  })

  it('borra la versión y sus archivos; recupera publicaciones cortadas', async () => {
    await newVersion(d)
    await d.receive.execute({ id: 'v1', zip: text('zip') })
    await d.complete.execute('v1')
    await new RecoverInterruptedPublishesUseCase(d.versions).execute()
    expect((await d.versions.findById('v1'))?.toProps().error).toContain('se reinició')
    await d.remove.execute('v1')
    expect([await d.versions.findById('v1'), d.originals.files.size]).toEqual([null, 0])
    await expect(d.remove.execute('v1')).rejects.toThrow(VersionNotFoundError)
  })

  it('con S3/R2: URL prefirmada, sin subida por la API, y sin secreto no hay vista previa', async () => {
    const cloud = setup({ originals: 's3', published: 'r2' }, null)
    expect((await newVersion(cloud)).upload).toEqual({ mode: 'presigned', url: 'https://s3/originals/v1.zip?len=3' })
    await expect(cloud.receive.execute({ id: 'v1', zip: text('zip') })).rejects.toThrow(UploadPresignedOnlyError)
    await cloud.originals.put('originals/v1.zip', text('zip'))
    await cloud.complete.execute('v1')
    await cloud.run()
    await expect(cloud.preview.execute({ id: 'v1', apiBase: 'x' })).rejects.toThrow(SigningSecretMissingError)
    expect(await cloud.status.execute()).toMatchObject({ playUrl: 'https://play', storage: { originals: 's3', published: 'r2' }, active: null })
  })
})
