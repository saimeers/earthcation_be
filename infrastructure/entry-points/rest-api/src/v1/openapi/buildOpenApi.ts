import { z, type ZodType } from 'zod'
import { IDEMPOTENCY_HEADER } from '../http/idempotency'
import type { OperationDoc } from '../http/route'
import { components } from './components'

export interface ApiInfo {
  readonly title: string
  readonly version: string
  readonly description: string
}

type JsonSchema = Record<string, unknown>

// OpenAPI 3.1 usa JSON Schema 2020-12, el mismo que genera zod: no hace falta traducir nada
const toSchema = (schema: ZodType, io: 'input' | 'output'): JsonSchema => {
  const json = { ...(z.toJSONSchema(schema, { target: 'draft-2020-12', io, unrepresentable: 'any' }) as JsonSchema) }
  delete json.$schema
  return json
}

// `/locations/:id` -> `/locations/{id}`
const openApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')

const fieldsOf = (schema: ZodType | undefined, where: 'path' | 'query') => {
  if (!schema) return []
  const json = toSchema(schema, 'input')
  const required = new Set((json.required as string[] | undefined) ?? [])
  const properties = (json.properties as Record<string, JsonSchema> | undefined) ?? {}
  return Object.entries(properties).map(([name, field]) => ({ name, in: where, required: where === 'path' || required.has(name), schema: field }))
}

const errorResponse = (description: string) =>
  ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } })

const successResponse = (doc: OperationDoc) => {
  const { status, description, schema, paginated, contentType } = doc.response
  if (status === 204) return { description }
  if (contentType) return { description, content: { [contentType]: { schema: { type: 'string', format: 'binary' } } } }
  const properties: Record<string, unknown> = { data: schema ? toSchema(schema, 'output') : {} }
  if (paginated) properties.meta = { $ref: '#/components/schemas/PageMeta' }
  return { description, content: { 'application/json': { schema: { type: 'object', required: ['data'], properties } } } }
}

const hasInput = (doc: OperationDoc): boolean => Boolean(doc.params ?? doc.query ?? doc.body ?? doc.upload)

const errorResponses = (doc: OperationDoc) => ({
  ...(hasInput(doc) && { 400: errorResponse('La solicitud no es válida (VALIDATION_ERROR)') }),
  ...(doc.roles && { 401: errorResponse('Falta el token o no es válido'), 403: errorResponse('Sin permiso para esta acción') }),
  ...(doc.params && { 404: errorResponse('El recurso no existe') }),
  500: errorResponse('Error interno del servidor'),
})

const security = (doc: OperationDoc) => (!doc.roles ? {} : {
  security: [{ bearerAuth: [] }],
  description: doc.roles.length > 0 ? `Roles: ${doc.roles.join(', ')}.` : 'Requiere autenticación.',
})

const uploadSchema = (u: NonNullable<OperationDoc['upload']>) =>
  (u.field ? { type: 'object', required: [u.field], properties: { [u.field]: { type: 'string', format: 'binary' } } } : { type: 'string', format: 'binary' })

const requestBody = (doc: OperationDoc) => {
  if (doc.upload) return { requestBody: { required: true, description: doc.upload.description, content: { [doc.upload.contentType]: { schema: uploadSchema(doc.upload) } } } }
  return doc.body ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(doc.body, 'input') } } } } : {}
}

const idempotencyParameter = {
  name: IDEMPOTENCY_HEADER, in: 'header', required: false,
  description: 'Identifica el intento: si la red falla y el cliente reintenta con la misma clave (y el mismo cuerpo) recibe la respuesta de la primera vez, con la cabecera Idempotent-Replayed, sin repetir la acción. Un UUID basta; se recuerda un día.',
  schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
}

const operation = (doc: OperationDoc) => ({
  tags: [doc.tag],
  summary: doc.summary,
  ...security(doc),
  parameters: [...fieldsOf(doc.params, 'path'), ...fieldsOf(doc.query, 'query'), ...(doc.idempotent ? [idempotencyParameter] : [])],
  ...requestBody(doc),
  responses: { [doc.response.status]: successResponse(doc), ...errorResponses(doc) },
})

const pathsOf = (docs: readonly OperationDoc[]): Record<string, Record<string, unknown>> => {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const doc of docs) (paths[openApiPath(doc.path)] ??= {})[doc.method] = operation(doc)
  return paths
}

/** Documento OpenAPI 3.1 de la API v1, generado desde las rutas (los esquemas zod son la única fuente). */
export const buildOpenApi = (docs: readonly OperationDoc[], info: ApiInfo): Record<string, unknown> => ({
  openapi: '3.1.0',
  info,
  servers: [{ url: '/api/v1' }],
  tags: [...new Set(docs.map((d) => d.tag))].map((name) => ({ name })),
  paths: pathsOf(docs),
  components,
})
