import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/DomainError'

export class OrganizationNotFoundError extends NotFoundError {
  constructor() { super('ORGANIZATION_NOT_FOUND', 'Organización no encontrada') }
}

export class OrganizationNameTakenError extends ConflictError {
  constructor() { super('ORGANIZATION_NAME_TAKEN', 'Ya existe una organización con ese nombre') }
}

export class OrganizationNameRequiredError extends ValidationError {
  constructor() { super('ORGANIZATION_NAME_REQUIRED', 'El nombre es requerido') }
}

export class LocationNotFoundError extends NotFoundError {
  constructor() { super('LOCATION_NOT_FOUND', 'Localidad no encontrada') }
}

export class LocationTakenError extends ConflictError {
  constructor() { super('LOCATION_TAKEN', 'Ya existe esa localidad') }
}

export class LocationFieldsRequiredError extends ValidationError {
  constructor() { super('LOCATION_FIELDS_REQUIRED', 'Municipio y departamento son requeridos') }
}
