import type { ZodType } from 'zod'
import { ValidationError } from '@earthcation/model'

/** Un campo de la solicitud que no cumple su esquema. */
export interface FieldIssue {
  readonly field: string
  readonly message: string
}

/** La solicitud no cumple el esquema de v1 (400 `VALIDATION_ERROR`, con el detalle por campo). */
export class InvalidRequestError extends ValidationError {
  constructor(readonly issues: readonly FieldIssue[]) {
    super('VALIDATION_ERROR', 'La solicitud no es válida', issues)
  }
}

/** Valida `value` contra `schema` y devuelve el valor ya convertido (números, valores por defecto). */
export const parseWith = <T>(schema: ZodType<T> | undefined, value: unknown, where: string): T => {
  if (!schema) return undefined as T
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new InvalidRequestError(result.error.issues.map((i) => ({ field: [where, ...i.path].join('.'), message: i.message })))
}
