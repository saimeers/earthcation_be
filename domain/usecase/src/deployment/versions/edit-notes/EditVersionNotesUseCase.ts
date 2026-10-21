import { VersionNotFoundError, type GameVersion, type GameVersionRepository } from '@earthcation/model'

export interface EditVersionNotesCommand {
  readonly id: string
  /** Texto libre; vacío o null borra la nota. */
  readonly notes: unknown
}

/** Cambia la nota de una versión (sirve para corregir lo que se escribió al subirla). No toca su estado ni sus archivos. */
export class EditVersionNotesUseCase {
  constructor(private readonly versions: GameVersionRepository) {}

  async execute(command: EditVersionNotesCommand): Promise<GameVersion> {
    const version = await this.versions.findById(command.id)
    if (!version) throw new VersionNotFoundError()
    version.describe(command.notes)
    await this.versions.saveNotes(version)
    return version
  }
}
