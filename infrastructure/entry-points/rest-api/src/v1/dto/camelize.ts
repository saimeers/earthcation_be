// Las lecturas del panel (usuarios, resultados VARK) llegan como filas con claves snake_case y fechas Date, tal
// como las arma la consulta. La API v1 las responde en camelCase y con fechas ISO 8601, a cualquier profundidad.

const camelKey = (key: string): string => key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

/** Convierte las claves a camelCase y las fechas a texto ISO; el resto de valores queda igual. */
export const camelize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(camelize)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [camelKey(k), camelize(v)]))
}
