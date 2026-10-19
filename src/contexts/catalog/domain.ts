import { conflict, notFound, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'

// Catálogo: organizaciones (empresas mineras, entidades) y localidades (municipio + departamento).
// Nunca se borran: se deshabilitan para conservar el histórico de los jugadores.

export type Organization = {
  readonly id: string
  readonly name: string
  readonly type: string | null
  readonly isActive: boolean
  readonly createdAt: Date
}

export type OrganizationMember = {
  readonly id: string
  readonly userId: string
  readonly organizationId: string | null
  readonly locationId: string | null
}

export type OrganizationDetail = Organization & { readonly members: readonly OrganizationMember[] }

export type Location = {
  readonly id: string
  readonly municipality: string | null
  readonly department: string | null
  readonly country: string | null
  readonly isActive: boolean
}

export type OrganizationDraft = { readonly name: string; readonly type?: string }
export type OrganizationPatch = { readonly name?: string; readonly type?: string | null }
export type LocationDraft = { readonly municipality: string; readonly department: string; readonly country?: string }
export type LocationPatch = Partial<Omit<Location, 'id' | 'isActive'>>

export const organizationNotFound = (): DomainError => notFound('ORGANIZATION_NOT_FOUND', 'Organización no encontrada')
export const organizationNameTaken = (): DomainError =>
  conflict('ORGANIZATION_NAME_TAKEN', 'Ya existe una organización con ese nombre')
export const locationNotFound = (): DomainError => notFound('LOCATION_NOT_FOUND', 'Localidad no encontrada')
export const locationTaken = (): DomainError => conflict('LOCATION_TAKEN', 'Ya existe esa localidad')

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

export const toOrganizationDraft = (input: Readonly<Record<string, unknown>>): Result<OrganizationDraft, DomainError> => {
  const name = text(input.name)
  const type = text(input.type)
  if (name === undefined) return err(validation('ORGANIZATION_NAME_REQUIRED', 'El nombre es requerido'))
  return ok(type === undefined ? { name } : { name, type })
}

export const toLocationDraft = (input: Readonly<Record<string, unknown>>): Result<LocationDraft, DomainError> => {
  const [municipality, department, country] = [text(input.municipality), text(input.department), text(input.country)]
  if (municipality === undefined || department === undefined) {
    return err(validation('LOCATION_FIELDS_REQUIRED', 'Municipio y departamento son requeridos'))
  }
  return ok(country === undefined ? { municipality, department } : { municipality, department, country })
}

// Solo los campos editables: antes el cuerpo del PUT llegaba entero al modelo (podía cambiar is_active o id)
const pick = <K extends string>(input: Readonly<Record<string, unknown>>, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => k in input).map((k) => [k, input[k]])) as Partial<Record<K, unknown>>

export const toOrganizationPatch = (input: Readonly<Record<string, unknown>>): OrganizationPatch =>
  pick(input, ['name', 'type']) as OrganizationPatch

export const toLocationPatch = (input: Readonly<Record<string, unknown>>): LocationPatch =>
  pick(input, ['municipality', 'department', 'country']) as LocationPatch
