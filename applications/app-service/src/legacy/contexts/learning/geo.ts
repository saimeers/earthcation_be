import MUNICIPIOS from '../../data/colombia-municipios-coords.json'
import { levenshtein } from '../identity/places'
import { groupBy, maxBy } from '../../shared/collections'

// Coordenadas de municipios (DIVIPOLA del DANE, datos.gov.co dataset gdxc-w37w) para el mapa de minas. Los
// nombres de la BD vienen del catálogo propio y no siempre coinciden letra a letra con DIVIPOLA ("Bogotá D.C."
// vs "BOGOTÁ, D.C.", "Tumaco" vs "SAN ANDRÉS DE TUMACO"): se compara normalizado y con tolerancia.

export type Coords = { readonly lat: number; readonly lng: number; readonly code: string; readonly exact: boolean }
type Municipio = { readonly municipality: string; readonly department: string; readonly code: string; readonly lat: number; readonly lng: number; readonly norm: string }

export const normalize = (v: unknown): string => (typeof v === 'string' ? v : '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()

const DEPT_ALIASES: Readonly<Record<string, string>> = {
  'BOGOTA D C': 'BOGOTA D C', BOGOTA: 'BOGOTA D C',
  'SAN ANDRES Y PROVIDENCIA': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  'SAN ANDRES': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  VALLE: 'VALLE DEL CAUCA', 'NORTE SANTANDER': 'NORTE DE SANTANDER',
}
// Nombres que no se resuelven solos (el catálogo usa el nombre popular, DIVIPOLA el oficial)
const MUNI_ALIASES: Readonly<Record<string, string>> = { 'TOLU VIEJO': 'SAN JOSE DE TOLUVIEJO', 'SAN ANTONIO DE PALMITO': 'PALMITO' }

const stripArticles = (n: string): string =>
  n.replace(/\(.*?\)/g, ' ').replace(/\b(EL|LA|LOS|LAS)\b/g, ' ').replace(/\s+/g, ' ').trim()

const STOPWORDS = new Set(['EL', 'LA', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'SAN', 'SANTA', 'SANTO', 'ISLAS', 'ISLA'])
const keyTokens = (n: string): readonly string[] =>
  [...new Set(stripArticles(n).split(' ').filter((t) => t.length > 2 && !STOPWORDS.has(t)))]

// Índice por departamento normalizado
const BY_DEPT: ReadonlyMap<string, readonly Municipio[]> =
  groupBy(MUNICIPIOS.map((m) => ({ ...m, norm: normalize(m.municipality) })), (m) => normalize(m.department))

const closestKey = (target: string, keys: readonly string[], maxDistance: number): string | null => {
  const best = keys.map((key) => ({ key, distance: levenshtein(target, key) }))
    .reduce<{ key: string; distance: number } | null>((acc, c) => (acc === null || c.distance < acc.distance ? c : acc), null)
  return best !== null && best.distance <= maxDistance ? best.key : null
}

const resolveDept = (department: string): string | null => {
  const d = normalize(department)
  const aliased = DEPT_ALIASES[d] ?? d
  return BY_DEPT.has(aliased) ? aliased : closestKey(aliased, [...BY_DEPT.keys()], 3)
}

// "Tumaco" ↔ "SAN ANDRÉS DE TUMACO", "Cartagena" ↔ "CARTAGENA DE INDIAS"
const byAffix = (list: readonly Municipio[], m: string) => list.find((x) => x.norm.endsWith(` ${m}`) || x.norm.startsWith(`${m} `))

// Sin artículos ni paréntesis: "El Peñol" ↔ "PEÑOL", "La Gloria (Cesar)" ↔ "LA GLORIA"
const byBareName = (list: readonly Municipio[], m: string) =>
  list.find((x) => stripArticles(x.norm) === stripArticles(m) || x.norm.replace(/ /g, '') === m.replace(/ /g, ''))

const tokenScore = (mine: readonly string[], theirs: readonly string[]): number =>
  mine.filter((t) => theirs.some((u) => u === t || levenshtein(t, u) <= 1)).length / Math.max(1, Math.min(mine.length, theirs.length))

// Palabras distintivas en común: "Santo Domingo de Silos" ↔ "SILOS", "Mompós" ↔ "SANTA CRUZ DE MOMPOX". Sin empates.
const byTokens = (list: readonly Municipio[], m: string): Municipio | undefined => {
  const scored = list.map((x) => ({ x, score: tokenScore(keyTokens(m), keyTokens(x.norm)) }))
  const best = maxBy(scored, (s) => s.score)
  const tied = scored.filter((s) => s.score === best?.score).length > 1
  return best !== undefined && best.score >= 1 && !tied ? best.x : undefined
}

const byDistance = (list: readonly Municipio[], m: string): Municipio | undefined => {
  const key = closestKey(m, list.map((x) => x.norm), 2)
  return key === null ? undefined : list.find((x) => x.norm === key)
}

type Strategy = (list: readonly Municipio[], m: string) => Municipio | undefined

// De la coincidencia más estricta a la más tolerante; la primera que encuentre gana
const STRATEGIES: readonly Strategy[] = [(list, m) => list.find((x) => x.norm === m), byAffix, byBareName, byTokens, byDistance]

const findMunicipio = (list: readonly Municipio[], m: string): Municipio | undefined =>
  m === '' ? undefined : STRATEGIES.reduce<Municipio | undefined>((hit, strategy) => hit ?? strategy(list, m), undefined)

// Capital del departamento: el código DIVIPOLA termina en 001
const capitalOf = (list: readonly Municipio[]) => list.find((x) => x.code.endsWith('001')) ?? list[0]

const municipiosOf = (department: string): readonly Municipio[] => {
  const dept = resolveDept(department)
  return dept === null ? [] : (BY_DEPT.get(dept) ?? [])
}

const aliased = (municipality: string): string => {
  const m = normalize(municipality)
  return MUNI_ALIASES[m] ?? m
}

const locate = (municipality: string, department: string): Coords | null => {
  const list = municipiosOf(department)
  const hit = findMunicipio(list, aliased(municipality))
  const place = hit ?? capitalOf(list)
  return place ? { lat: place.lat, lng: place.lng, code: place.code, exact: hit !== undefined } : null
}

// Memo de las búsquedas (el catálogo es fijo): único estado del módulo
const memo = new Map<string, Coords | null>()

/** Coordenadas de un municipio; sin coincidencia, la capital del departamento con exact = false; sin departamento, null. */
export const coordsFor = (municipality: string, department: string): Coords | null => {
  const key = `${municipality}|${department}`
  const known = memo.get(key)
  if (known !== undefined) return known
  const found = locate(municipality, department)
  // eslint-disable-next-line functional/immutable-data -- memo en memoria del catálogo fijo
  memo.set(key, found)
  return found
}
