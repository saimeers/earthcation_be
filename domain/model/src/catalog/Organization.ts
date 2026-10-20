import { OrganizationNameRequiredError } from './errors/CatalogErrors'

export interface OrganizationProps {
  readonly id: string
  name: string
  type: string | null
  isActive: boolean
  readonly createdAt: Date
}

/** Datos validados para crear una organización (el id lo asigna la persistencia). */
export interface NewOrganization {
  readonly name: string
  readonly type: string | null
}

/** Campos editables; los que no vienen no cambian. */
export interface OrganizationChanges {
  readonly name?: unknown
  readonly type?: unknown
}

const requiredName = (name: unknown): string => {
  if (typeof name !== 'string' || name === '') throw new OrganizationNameRequiredError()
  return name
}

const optionalText = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * Empresa minera o entidad a la que pertenecen los jugadores. Nunca se borra: se deshabilita para conservar el
 * histórico de quienes estuvieron en ella.
 */
export class Organization {
  private constructor(private readonly props: OrganizationProps) {}

  static restore(props: OrganizationProps): Organization {
    return new Organization({ ...props })
  }

  static prepare(name: unknown, type?: unknown): NewOrganization {
    return { name: requiredName(name), type: optionalText(type) }
  }

  get id(): string { return this.props.id }
  get name(): string { return this.props.name }
  get type(): string | null { return this.props.type }
  get isActive(): boolean { return this.props.isActive }
  get createdAt(): Date { return this.props.createdAt }

  /** Aplica solo los campos editables (antes el cuerpo entero llegaba al modelo y podía cambiar is_active o id). */
  change(changes: OrganizationChanges): void {
    if (changes.name !== undefined) this.props.name = requiredName(changes.name)
    if (changes.type !== undefined) this.props.type = optionalText(changes.type)
  }

  disable(): void { this.props.isActive = false }
  enable(): void { this.props.isActive = true }

  toProps(): Readonly<OrganizationProps> { return { ...this.props } }
}
