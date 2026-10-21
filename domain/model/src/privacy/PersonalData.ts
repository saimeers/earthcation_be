// Enmascarado de datos personales para quien no necesita verlos (soporte técnico): lo que identifica a una persona
// (cédula, correo, nombre, edad) se oculta, lo demás (ids, puntajes, estados, tiempos) queda para poder diagnosticar.

const KEEP = 3

const maskedId = (value: string): string => `***${value.slice(-KEEP)}`

const maskedEmail = (value: string): string => {
  const at = value.lastIndexOf('@')
  return at < 0 ? '***' : `***${value.slice(at)}`
}

const initial = (value: string): string => `${value.trim().charAt(0).toUpperCase()}.`

type Masker = (value: unknown) => unknown

const text = (fn: (v: string) => string): Masker => (v) => (typeof v === 'string' && v !== '' ? fn(v) : v)

// Claves que identifican a una persona, en snake_case (filas de la API anterior) y en camelCase (la v1)
const MASKERS: Readonly<Record<string, Masker>> = {
  cedula: text(maskedId), username: text(maskedId), email: text(maskedEmail),
  first_name: text(initial), firstName: text(initial), last_name: text(initial), lastName: text(initial),
  age: (v) => (v === null || v === undefined ? v : null),
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

/** Copia del valor con los datos personales enmascarados, a cualquier profundidad. */
export const maskPersonalData = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(maskPersonalData)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, Object.hasOwn(MASKERS, key) ? MASKERS[key]?.(v) : maskPersonalData(v)]))
}
