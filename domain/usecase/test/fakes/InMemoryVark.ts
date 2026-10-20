import {
  VarkResult,
  type VarkListingRow, type VarkPlaceFilter, type VarkRepository, type VarkSaveOutcome, type VarkScores, type VarkStyle,
} from '@earthcation/model'

/** Repositorio en memoria de resultados VARK (uno por usuario), para probar los casos de uso sin base de datos. */
export class InMemoryVarkRepository implements VarkRepository {
  readonly rows = new Map<string, VarkResult>()
  /** Localidad de cada usuario, para el listado por lugar. */
  readonly places = new Map<string, { department: string; municipality: string }>()

  save(userId: string, scores: VarkScores): Promise<VarkSaveOutcome> {
    const created = !this.rows.has(userId)
    this.rows.set(userId, VarkResult.restore({ id: `vark-${userId}`, userId, ...scores }))
    return Promise.resolve({ created })
  }

  findByUser(userId: string) { return Promise.resolve(this.rows.get(userId) ?? null) }

  listAll() { return Promise.resolve(this.listing(() => true)) }

  listByStyle(style: VarkStyle) { return Promise.resolve(this.listing((r) => r.dominantStyle === style)) }

  listByPlace(f: VarkPlaceFilter) {
    const matches = (r: VarkResult) => {
      const p = this.places.get(r.userId)
      return p !== undefined && (!f.department || p.department === f.department) && (!f.municipality || p.municipality === f.municipality)
    }
    return Promise.resolve(this.listing(matches))
  }

  private listing(keep: (r: VarkResult) => boolean): VarkListingRow[] {
    return [...this.rows.values()].filter(keep).map((r) => ({ ...r.toProps() }))
  }
}
