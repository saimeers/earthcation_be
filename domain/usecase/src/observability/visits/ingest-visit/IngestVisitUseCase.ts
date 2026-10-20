import { Visit, type Cache, type VisitRepository } from '@earthcation/model'
import type { IngestVisitCommand } from './IngestVisitCommand'

export interface IngestVisitDeps {
  readonly visits: VisitRepository
  /** Recuerda qué visitantes ya abrieron el juego en la ventana de 30 min. */
  readonly cache: Cache
}

/** Guarda una apertura del juego publicado; solo la primera de cada visitante en 30 min cuenta como única. */
export class IngestVisitUseCase {
  constructor(private readonly deps: IngestVisitDeps) {}

  async execute(cmd: IngestVisitCommand): Promise<void> {
    const visit = Visit.fromWorker(cmd.fields)
    const key = visit.uniqueKey
    visit.markUnique(key === null ? undefined : await this.deps.cache.setIfAbsent(key, Visit.UNIQUE_WINDOW_SECONDS))
    await this.deps.visits.save(visit)
  }
}
