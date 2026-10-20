// Agrupar y contar conservando el orden de primera aparición (como hacían los objetos/Map de v1).
// La mutación queda dentro del Map recién creado y nunca se ve desde afuera: para quien llama son puras,
// y evitan copiar el Map en cada paso (con miles de filas, un reduce inmutable sería cuadrático).

/* eslint-disable functional/immutable-data -- mutación local de un Map recién creado, ver arriba */
export const groupBy = <T, K>(items: readonly T[], keyOf: (item: T) => K): ReadonlyMap<K, readonly T[]> => {
  const groups = new Map<K, T[]>()
  items.forEach((item) => {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  })
  return groups
}
/* eslint-enable functional/immutable-data */

/** Cuántos hay de cada clave, como objeto (las claves en orden de aparición). */
export const countBy = <T>(items: readonly T[], keyOf: (item: T) => string): Readonly<Record<string, number>> =>
  Object.fromEntries([...groupBy(items, keyOf)].map(([key, group]) => [key, group.length]))

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

/** Texto de un valor que se usa como clave o etiqueta (como lo haría `${valor}` sin el "undefined"). */
export const keyOf = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' ? String(v) : ''

/** El de mayor clave (el primero en empate), o undefined si no hay ninguno. */
export const maxBy = <T>(items: readonly T[], score: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, item) => (best === undefined || score(item) > score(best) ? item : best), undefined)
