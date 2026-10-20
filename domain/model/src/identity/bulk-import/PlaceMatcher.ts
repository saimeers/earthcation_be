import type { PlaceCatalog } from '../gateways/BulkImport'
import { normalize } from './normalize'

// Municipio y departamento libres (como vienen del Excel, con typos y mayúsculas inconsistentes) contra el catálogo
// cerrado de municipios: evita filas nuevas por variaciones del mismo lugar ("Norte de Santander" /
// "NORTE DE SANTANDER" / "Santender").

export interface Place {
  readonly municipality: string
  readonly department: string
}

/** noMatch: no hubo nada parecido en el catálogo; se crea igual pero el admin lo revisa en la vista previa. */
export type PlaceQuery = Place & { readonly noMatch: boolean }

const MAX_TYPOS = 2

/** Distancia de Levenshtein (sin dependencia externa), fila por fila de la tabla de programación dinámica. */
export const levenshtein = (a: string, b: string): number => {
  const first: readonly number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  const last = Array.from(a).reduce<readonly number[]>((prev, ca, i) => Array.from(b).reduce<readonly number[]>(
    (row, cb, j) => [...row, Math.min((prev[j + 1] ?? 0) + 1, (row[j] ?? 0) + 1, (prev[j] ?? 0) + (ca === cb ? 0 : 1))],
    [i + 1]), first)
  return last[b.length] ?? 0
}

interface Named { readonly name: string; readonly norm: string }
interface Department extends Named { readonly municipalities: readonly Named[] }

const named = (name: string): Named => ({ name, norm: normalize(name) })

// Alias que el Excel escribe abreviados y que la distancia con umbral bajo no perdona ("Bogotá" sin "D.C.")
const DEPT_ALIASES: ReadonlyMap<string, string> = new Map([
  ['Bogota', 'Bogotá D.C.'], ['Bogota DC', 'Bogotá D.C.'], ['San Andres', 'San Andrés y Providencia'],
  ['San Andres y Providencia y Santa Catalina', 'San Andrés y Providencia'],
].map(([alias, name]) => [normalize(alias), normalize(name)]))

interface Scored<T> { readonly item: T; readonly distance: number }

const nearest = <T extends Named>(target: string, candidates: readonly T[]): Scored<T> | undefined =>
  candidates.reduce<Scored<T> | undefined>((acc, item) => {
    const distance = levenshtein(target, item.norm)
    return acc === undefined || distance < acc.distance ? { item, distance } : acc
  }, undefined)

// Exacto primero; si no, el más cercano (el primero en empate) dentro del umbral
const closest = <T extends Named>(target: string, candidates: readonly T[]): T | undefined => {
  const exact = candidates.find((c) => c.norm === target)
  if (exact) return exact
  const best = nearest(target, candidates)
  return best !== undefined && best.distance <= MAX_TYPOS ? best.item : undefined
}

/** Servicio de dominio: ubica un lugar escrito a mano en el catálogo de municipios. */
export class PlaceMatcher {
  private index: readonly Department[] | undefined

  constructor(private readonly catalog: PlaceCatalog) {}

  /** El nombre canónico del catálogo, o null si nada se parece lo suficiente. */
  match(municipality: string, department: string): Place | null {
    const wanted = normalize(department)
    const dept = closest(DEPT_ALIASES.get(wanted) ?? wanted, this.departments())
    const muni = dept && closest(normalize(municipality), dept.municipalities)
    return dept && muni ? { municipality: muni.name, department: dept.name } : null
  }

  /** Lugar a buscar o crear: el del catálogo, o el texto del Excel marcado sin coincidencia; null si falta alguno. */
  query(municipality: string, department: string): PlaceQuery | null {
    if (municipality === '' || department === '') return null
    const match = this.match(municipality, department)
    return match ? { ...match, noMatch: false } : { municipality: municipality.trim(), department: department.trim(), noMatch: true }
  }

  // Normalizado una sola vez, al primer uso
  private departments(): readonly Department[] {
    this.index ??= this.catalog.departments().map((d) => ({ ...named(d.name), municipalities: d.municipalities.map(named) }))
    return this.index
  }
}
