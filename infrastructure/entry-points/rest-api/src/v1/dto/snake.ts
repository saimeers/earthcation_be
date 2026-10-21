// Los casos de uso de aprendizaje leen los cuerpos con las claves de siempre (snake_case: `level_key`, `t_ms`…). La API
// v1 recibe camelCase y lo convierte aquí, a cualquier profundidad, sin tocar el contenido libre que manda el juego.

const snakeKey = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

// El `payload` de un evento es JSON libre del juego: se guarda tal cual (sus claves son datos, no nombres de campo)
const FREE_FORM: ReadonlySet<string> = new Set(['payload'])

/** Convierte las claves de un cuerpo a snake_case; el `payload` de los eventos no se toca. */
export const snakeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snakeKeys)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [snakeKey(k), FREE_FORM.has(k) ? v : snakeKeys(v)]))
}

/** Un cuerpo ya validado como objeto, en snake_case, listo para un caso de uso. */
export const snakeBody = (body: object): Readonly<Record<string, unknown>> => snakeKeys(body) as Record<string, unknown>
