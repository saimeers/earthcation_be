import type { BuildManifest } from './BuildInspection'
import {
  VersionActiveError, VersionBusyError, VersionNotReadyError, VersionNotUploadingError, VersionPublishingError,
} from './errors/DeploymentErrors'
import { VersionLabel } from './VersionLabel'
import { ZipSize } from './ZipSize'

// Despliegue del juego WebGL (desarrollador y admin):
// 1. crear versión → 'uploading' + adónde subir el ZIP (URL prefirmada de S3, o la API en desarrollo);
// 2. completar → 'processing' y se encola la publicación;
// 3. publicar en segundo plano (de a una): validar el ZIP y subir cada archivo a builds/<id>/ → 'ready' o 'failed';
// 4. activar escribe current.json, el puntero que lee el Worker. Rollback = activar otra versión.

export type VersionStatus = 'uploading' | 'processing' | 'ready' | 'failed'

/** Lo que guarda la versión al quedar lista: el manifiesto del build más cuánto tardó en publicarse. */
export interface VersionManifest extends BuildManifest {
  readonly publishMs: number
}

export interface GameVersionProps {
  readonly id: string
  readonly label: string
  notes: string | null
  status: VersionStatus
  /** Clave del ZIP original (S3 o disco). */
  readonly originalKey: string | null
  /** Carpeta de los archivos publicados (builds/<id>/). */
  publishedPrefix: string | null
  manifest: VersionManifest | null
  sizeBytes: number | null
  error: string | null
  readonly uploadedBy: string | null
  publishedAt: Date | null
  activatedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Datos ya validados de una versión nueva (queda en 'uploading'). */
export interface NewGameVersion {
  readonly id: string
  readonly label: string
  readonly notes: string | null
  readonly sizeBytes: number
  readonly originalKey: string
  /** null: la subió el CI con el token de despliegue, sin cuenta. */
  readonly uploadedBy: string | null
}

/** Lo que manda el panel para crear una versión; el dominio valida cada campo. */
export interface GameVersionInput {
  readonly label: unknown
  readonly notes: unknown
  readonly sizeBytes: unknown
  readonly uploadedBy: string | null
}

const notesOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 2000) : null)

/** Una versión del build WebGL: máquina de estados uploading → processing → ready | failed. */
export class GameVersion {
  private constructor(private readonly props: GameVersionProps) {}

  static restore(props: GameVersionProps): GameVersion {
    return new GameVersion({ ...props })
  }

  /** Valida etiqueta, tamaño y límite (en ese orden, como v1) y arma la versión nueva. */
  static prepare(id: string, input: GameVersionInput, maxMb: number): NewGameVersion {
    const label = VersionLabel.of(input.label).value
    const sizeBytes = ZipSize.of(input.sizeBytes, maxMb).bytes
    return { id, label, notes: notesOf(input.notes), sizeBytes, originalKey: GameVersion.originalKeyFor(id), uploadedBy: input.uploadedBy }
  }

  static originalKeyFor(id: string): string { return `originals/${id}.zip` }
  static publishedPrefixFor(id: string): string { return `builds/${id}/` }

  get id(): string { return this.props.id }
  get label(): string { return this.props.label }
  get status(): VersionStatus { return this.props.status }
  get activatedAt(): Date | null { return this.props.activatedAt }
  get notes(): string | null { return this.props.notes }
  get publishedPrefix(): string | null { return this.props.publishedPrefix }
  get originalKey(): string | null { return this.props.originalKey }
  /** Dónde está el ZIP original (las filas viejas sin clave usan la de siempre). */
  get storedOriginalKey(): string { return this.props.originalKey ?? GameVersion.originalKeyFor(this.props.id) }
  get productVersion(): string | null { return this.props.manifest?.productVersion ?? null }

  /** Cambia la nota (se recorta y un texto vacío la borra). */
  describe(notes: unknown): void {
    this.props.notes = notesOf(notes)
  }

  /** El ZIP solo se recibe mientras la versión lo espera. */
  assertAwaitingZip(): void {
    if (this.props.status !== 'uploading') throw new VersionNotUploadingError()
  }

  /** Se completa al subir y también para reintentar una publicación fallida. */
  assertCanComplete(): void {
    if (this.props.status !== 'uploading' && this.props.status !== 'failed') throw new VersionBusyError()
  }

  /** Pasa a 'processing' con el tamaño real del ZIP; devuelve el estado de partida (para el cambio atómico). */
  startProcessing(sizeBytes: number): VersionStatus {
    this.assertCanComplete()
    const from = this.props.status
    this.props.status = 'processing'
    this.props.error = null
    this.props.sizeBytes = sizeBytes
    return from
  }

  markReady(manifest: BuildManifest, publishMs: number, at: Date): void {
    this.props.status = 'ready'
    this.props.publishedPrefix = GameVersion.publishedPrefixFor(this.props.id)
    this.props.error = null
    this.props.publishedAt = at
    this.props.manifest = { ...manifest, publishMs }
  }

  markFailed(reason: string): void {
    this.props.status = 'failed'
    this.props.error = reason
  }

  activate(at: Date): void {
    if (this.props.status !== 'ready') throw new VersionNotReadyError('Solo se puede activar una versión lista')
    this.props.activatedAt = at
  }

  assertCanPreview(): void {
    if (this.props.status !== 'ready') throw new VersionNotReadyError('La versión aún no está lista')
  }

  /** No se borra la versión activa ni la que se está publicando. */
  assertCanRemove(activeId: string | null): void {
    if (this.props.id === activeId) throw new VersionActiveError()
    if (this.props.status === 'processing') throw new VersionPublishingError()
  }

  toProps(): Readonly<GameVersionProps> { return { ...this.props } }
}
