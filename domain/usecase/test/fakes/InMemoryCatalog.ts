import {
  Location, Organization,
  type LocationFilter, type LocationRepository, type NewLocation, type NewOrganization, type OrganizationDetail,
  type OrganizationFilter, type OrganizationRepository,
} from '@earthcation/model'

const includes = (value: string | null, part?: string) => !part || (value ?? '').toLowerCase().includes(part.toLowerCase())

/** Repositorio en memoria de organizaciones, para probar los casos de uso sin base de datos. */
export class InMemoryOrganizationRepository implements OrganizationRepository {
  readonly rows = new Map<string, Organization>()

  findAll() { return Promise.resolve([...this.rows.values()]) }

  search(f: OrganizationFilter) {
    return Promise.resolve([...this.rows.values()].filter((o) => o.isActive && includes(o.name, f.name) && includes(o.type, f.type)))
  }

  findTypes() {
    const types = [...this.rows.values()].filter((o) => o.isActive).map((o) => o.type).filter((t): t is string => t !== null)
    return Promise.resolve([...new Set(types)].sort())
  }

  findById(id: string) { return Promise.resolve(this.rows.get(id) ?? null) }

  findDetail(id: string): Promise<OrganizationDetail | null> {
    const organization = this.rows.get(id)
    return Promise.resolve(organization ? { organization, members: [] } : null)
  }

  findByName(name: string) { return Promise.resolve([...this.rows.values()].find((o) => o.name === name) ?? null) }

  create(o: NewOrganization) {
    const created = Organization.restore({ id: `o${this.rows.size + 1}`, ...o, isActive: true, createdAt: new Date(0) })
    this.rows.set(created.id, created)
    return Promise.resolve(created)
  }

  save(o: Organization) { this.rows.set(o.id, o); return Promise.resolve() }
}

/** Repositorio en memoria de localidades. */
export class InMemoryLocationRepository implements LocationRepository {
  readonly rows = new Map<string, Location>()

  findAll() { return Promise.resolve([...this.rows.values()]) }

  search(f: LocationFilter) {
    return Promise.resolve([...this.rows.values()].filter((l) => l.isActive && includes(l.municipality, f.municipality)))
  }

  findById(id: string) { return Promise.resolve(this.rows.get(id) ?? null) }

  findActiveById(id: string) { const l = this.rows.get(id); return Promise.resolve(l?.isActive ? l : null) }

  findByPlace(municipality: string, department: string) {
    return Promise.resolve([...this.rows.values()].find((l) => l.municipality === municipality && l.department === department) ?? null)
  }

  create(l: NewLocation) {
    const created = Location.restore({ id: `l${this.rows.size + 1}`, country: 'Colombia', ...l, isActive: true })
    this.rows.set(created.id, created)
    return Promise.resolve(created)
  }

  async createMany(locations: readonly NewLocation[]) {
    for (const l of locations) await this.create(l)
  }

  save(l: Location) { this.rows.set(l.id, l); return Promise.resolve() }
}
