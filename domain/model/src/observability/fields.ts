// Lectura tolerante de lo que llega de afuera (cuerpo del Worker, cabeceras de Cloudflare): un dato inválido
// queda en null, nunca rechaza la visita ni el login.

export type Fields = Readonly<Record<string, unknown>>

/** Texto recortado a `max` caracteres; vacío o no texto es null. */
export const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null

export const numberOrNull = (v: unknown): number | null =>
  v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)

// Cloudflare llama "Norte de Santander Department" a los departamentos de Colombia
export const place = (v: unknown, max: number): string | null => text(v, max)?.replace(/\s+Department$/i, '') ?? null

export const matching = (v: unknown, pattern: RegExp): string | null => (typeof v === 'string' && pattern.test(v) ? v : null)
