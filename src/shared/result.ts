// Errores como valores: dominio y aplicación devuelven Result y nunca lanzan; solo el borde HTTP
// convierte un Err en respuesta.
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const map = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r

export const flatMap = <T, U, E>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> =>
  r.ok ? f(r.value) : r

type Async<T> = T | Promise<T>

// Encadena pasos asíncronos que pueden fallar: el primer Err corta la cadena
export const andThen = async <T, U, E>(
  r: Async<Result<T, E>>,
  f: (value: T) => Async<Result<U, E>>,
): Promise<Result<U, E>> => {
  const resolved = await r
  return resolved.ok ? f(resolved.value) : resolved
}

export const fromNullable = <T, E>(value: T | null | undefined, onMissing: () => E): Result<T, E> =>
  value == null ? err(onMissing()) : ok(value)
