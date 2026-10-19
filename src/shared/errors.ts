// Errores de dominio: un `code` estable en mayúsculas (USER_NOT_FOUND, VALIDATION_ERROR...) para la API v2,
// un `message` en español para el usuario y un `kind` que decide el estado HTTP en el borde.
export type ErrorKind = 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'business_rule'

export type DomainError = {
  readonly kind: ErrorKind
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

const make = (kind: ErrorKind) => (code: string, message: string, details?: unknown): DomainError =>
  details === undefined ? { kind, code, message } : { kind, code, message, details }

export const validation = make('validation')
export const unauthorized = make('unauthorized')
export const forbidden = make('forbidden')
export const notFound = make('not_found')
export const conflict = make('conflict')
export const businessRule = make('business_rule')

// v1 respondía 400 también a las reglas de negocio; v2 usa 422 (ver adapters/http/v1 y v2)
const STATUS: Readonly<Record<ErrorKind, number>> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
}

export const httpStatusOf = (e: DomainError): number => STATUS[e.kind]
