import { LocationFieldsRequiredError } from './errors/CatalogErrors'

export interface LocationProps {
  readonly id: string
  municipality: string | null
  department: string | null
  country: string | null
  isActive: boolean
}

/** Datos validados para crear una localidad; sin país, la persistencia pone Colombia. */
export interface NewLocation {
  readonly municipality: string
  readonly department: string
  readonly country?: string
}

export interface LocationChanges {
  readonly municipality?: unknown
  readonly department?: unknown
  readonly country?: unknown
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const textOrNull = (v: unknown): string | null => text(v) ?? null

/** Municipio + departamento (+ país) de residencia de los jugadores y sede de las salas. Se deshabilita, no se borra. */
export class Location {
  private constructor(private readonly props: LocationProps) {}

  static restore(props: LocationProps): Location {
    return new Location({ ...props })
  }

  static prepare(input: LocationChanges): NewLocation {
    const [municipality, department, country] = [text(input.municipality), text(input.department), text(input.country)]
    if (municipality === undefined || department === undefined) throw new LocationFieldsRequiredError()
    return country === undefined ? { municipality, department } : { municipality, department, country }
  }

  get id(): string { return this.props.id }
  get municipality(): string | null { return this.props.municipality }
  get department(): string | null { return this.props.department }
  get country(): string | null { return this.props.country }
  get isActive(): boolean { return this.props.isActive }

  /** Solo municipio, departamento y país; lo demás del cuerpo se ignora. */
  change(changes: LocationChanges): void {
    if (changes.municipality !== undefined) this.props.municipality = textOrNull(changes.municipality)
    if (changes.department !== undefined) this.props.department = textOrNull(changes.department)
    if (changes.country !== undefined) this.props.country = textOrNull(changes.country)
  }

  disable(): void { this.props.isActive = false }
  enable(): void { this.props.isActive = true }

  toProps(): Readonly<LocationProps> { return { ...this.props } }
}
