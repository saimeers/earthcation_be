// Dispositivo, sistema y navegador a partir del user-agent. Aproximado a propósito (sin librería):
// alcanza para ver si los mineros juegan en celular o en PC.
export type Agent = { readonly device: string | null; readonly os: string | null; readonly browser: string | null }

type Rule = readonly [RegExp, string]

const DEVICES: readonly Rule[] = [
  [/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i, 'tablet'],
  [/Mobi|iPhone|iPod|Android|Windows Phone/i, 'mobile'],
]
const SYSTEMS: readonly Rule[] = [
  [/Windows/i, 'Windows'], [/Android/i, 'Android'], [/iPhone|iPad|iPod/i, 'iOS'],
  [/CrOS/i, 'ChromeOS'], [/Mac OS X|Macintosh/i, 'macOS'], [/Linux/i, 'Linux'],
]
// El orden importa: Edge y Opera también dicen "Chrome", y Chrome también dice "Safari"
const BROWSERS: readonly Rule[] = [
  [/Edg\//i, 'Edge'], [/OPR\/|Opera/i, 'Opera'], [/SamsungBrowser/i, 'Samsung'],
  [/Firefox|FxiOS/i, 'Firefox'], [/Chrome|CriOS/i, 'Chrome'], [/Safari/i, 'Safari'],
]

const classify = (rules: readonly Rule[], ua: string, fallback: string): string | null =>
  ua === '' ? null : (rules.find(([pattern]) => pattern.test(ua))?.[1] ?? fallback)

export const parseUserAgent = (ua: unknown): Agent => {
  const s = typeof ua === 'string' ? ua : ''
  return { device: classify(DEVICES, s, 'desktop'), os: classify(SYSTEMS, s, 'Otro'), browser: classify(BROWSERS, s, 'Otro') }
}
