import type { GameVersion, NewGameVersion, VersionStatus } from '../GameVersion'

/** Quién subió una versión (para el listado del panel). */
export interface VersionUploader {
  readonly id: string
  readonly firstName: string | null
  readonly lastName: string | null
}

export interface GameVersionListing {
  readonly version: GameVersion
  readonly uploader: VersionUploader | null
}

/** Puerto de salida: persistencia de las versiones del juego y del puntero a la activa. */
export interface GameVersionRepository {
  findById(id: string): Promise<GameVersion | null>
  /** Todas, de la más nueva a la más vieja, con quien la subió. */
  list(): Promise<GameVersionListing[]>
  /** Id de la versión activa (game_settings.active_version_id) o null. */
  activeId(): Promise<string | null>
  create(version: NewGameVersion): Promise<GameVersion>
  /** Guarda el paso a 'processing' solo si la fila sigue en `from`: false si otro clic (u otra instancia) se adelantó. */
  startProcessing(version: GameVersion, from: VersionStatus): Promise<boolean>
  save(version: GameVersion): Promise<void>
  /** Guarda solo la nota, sin tocar el estado (otra publicación en curso no se pisa). */
  saveNotes(version: GameVersion): Promise<void>
  /** Al arrancar: las que quedaron en 'processing' pasan a 'failed' con el motivo dado. */
  failInterrupted(reason: string): Promise<void>
  remove(id: string): Promise<void>
  /** Puntero + fecha de activación en una transacción; si writePointer falla, nada cambia. */
  activate(version: GameVersion, writePointer: () => Promise<void>): Promise<void>
}
