/** Hora actual: los casos de uso no llaman a `new Date()` para que las pruebas fijen el tiempo. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }
