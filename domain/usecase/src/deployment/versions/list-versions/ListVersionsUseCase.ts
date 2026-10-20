import type { GameVersionListing, GameVersionRepository } from '@earthcation/model'

export interface ListedVersion extends GameVersionListing {
  readonly isActive: boolean
}

/** Todas las versiones (la más nueva primero), marcando la activa. */
export class ListVersionsUseCase {
  constructor(private readonly versions: GameVersionRepository) {}

  async execute(): Promise<ListedVersion[]> {
    const [listing, activeId] = await Promise.all([this.versions.list(), this.versions.activeId()])
    return listing.map((l) => ({ ...l, isActive: l.version.id === activeId }))
  }
}
