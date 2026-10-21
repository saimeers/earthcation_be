// Las lecturas del panel (usuarios, resultados VARK, salas, telemetría) llegan como filas con claves snake_case y
// fechas Date, tal como las arma la consulta. La API v1 las responde en camelCase y con fechas ISO 8601, a cualquier
// profundidad.

const camelKey = (key: string): string => key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

// Propiedades cuyo objeto es un diccionario: sus claves son datos (un motivo de fallo, una etapa, un nivel), no nombres
// de campo, y se conservan tal cual; solo se convierten sus valores.
const DICTIONARIES: ReadonlySet<string> = new Set(['fail_reasons', 'fail_stages', 'journeys'])

const convert = (key: string, value: unknown): unknown =>
  (DICTIONARIES.has(key) && isPlainObject(value)
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, camelize(v)]))
    : camelize(value))

/** Convierte las claves a camelCase y las fechas a texto ISO; el resto de valores queda igual. */
export const camelize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(camelize)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [camelKey(k), convert(k, v)]))
}
