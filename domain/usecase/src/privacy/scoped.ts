import { ForbiddenError, UserOutOfScopeError, type ReadScope, type RequestContext } from '@earthcation/model'

// Lecturas acotadas por propiedad: un instructor solo lee a los jugadores de sus salas. Como la auditoría, se aplica
// envolviendo casos de uso en el contenedor (la API anterior y la v1 quedan acotadas por igual) y quien pide sale del
// ámbito de la petición. Un jugador, un admin y un desarrollador no pasan por aquí.

export interface ScopeDeps {
  readonly scope: ReadScope
  readonly context: RequestContext
}

type Executable = { readonly execute: (...args: never[]) => Promise<unknown> }
type ArgsOf<U extends Executable> = Parameters<U['execute']>
type ResultOf<U extends Executable> = Awaited<ReturnType<U['execute']>>

export interface ScopeSpec<U extends Executable> {
  /** A quién se pide, antes de ejecutar (p. ej. el id del usuario que se consulta). */
  readonly target?: (args: ArgsOf<U>) => string | undefined
  /** De quién es cada fila del resultado, para dejar solo las de su alcance. */
  readonly rowOwner?: (row: Record<string, unknown>) => string | undefined
  /** De quién es un resultado único, para negarlo después de leerlo. */
  readonly resultOwner?: (result: ResultOf<U>) => string | undefined
}

/** El instructor que pide y con qué se decide lo que puede leer. */
interface Viewer {
  readonly id: string
  readonly scope: ReadScope
}

const instructorOf = (context: RequestContext): string | null => {
  const actor = context.current()?.actor
  return actor?.role === 'instructor' ? actor.id : null
}

// Un instructor se lee a sí mismo; a los demás, solo si están en su alcance
const canRead = async (viewer: Viewer, ownerId: string | undefined): Promise<boolean> =>
  ownerId === undefined || ownerId === viewer.id || (await viewer.scope.visiblePlayerIds(viewer.id)).has(ownerId)

const filterRows = async (viewer: Viewer, rows: unknown[], owner: (row: Record<string, unknown>) => string | undefined): Promise<unknown[]> => {
  const visible = await viewer.scope.visiblePlayerIds(viewer.id)
  return rows.filter((row) => {
    const id = owner(row as Record<string, unknown>)
    return id === undefined || id === viewer.id || visible.has(id)
  })
}

const checkTarget = async <U extends Executable>(viewer: Viewer, spec: ScopeSpec<U>, args: ArgsOf<U>): Promise<void> => {
  if (!(await canRead(viewer, spec.target?.(args)))) throw new UserOutOfScopeError()
}

const limitResult = async <U extends Executable>(viewer: Viewer, spec: ScopeSpec<U>, result: ResultOf<U>): Promise<ResultOf<U>> => {
  if (spec.resultOwner && !(await canRead(viewer, spec.resultOwner(result)))) throw new UserOutOfScopeError()
  return (spec.rowOwner && Array.isArray(result) ? await filterRows(viewer, result, spec.rowOwner) : result) as ResultOf<U>
}

/** Lo que hace falta para leer con alcance: el caso de uso original (ya ligado), su especificación y las dependencias. */
interface ReadCall<U extends Executable> {
  readonly run: (...args: ArgsOf<U>) => Promise<ResultOf<U>>
  readonly spec: ScopeSpec<U>
  readonly deps: ScopeDeps
}

const read = async <U extends Executable>(call: ReadCall<U>, args: ArgsOf<U>): Promise<ResultOf<U>> => {
  const id = instructorOf(call.deps.context)
  if (id === null) return call.run(...args)
  const viewer = { id, scope: call.deps.scope }
  await checkTarget(viewer, call.spec, args)
  return limitResult(viewer, call.spec, await call.run(...args))
}

/**
 * Envuelve un caso de uso de lectura. Para un instructor: niega si el objetivo no está en su alcance (antes de ejecutar o,
 * para un resultado único, después) y, si el resultado es una lista, deja solo las filas que sí lo están.
 */
export const scoped = <U extends Executable>(inner: U, spec: ScopeSpec<U>, deps: ScopeDeps): U => {
  const wrapped = Object.create(inner) as U
  const original = inner.execute as (...a: ArgsOf<U>) => Promise<ResultOf<U>>
  const call: ReadCall<U> = { run: (...args) => original.apply(inner, args), spec, deps }
  Object.defineProperty(wrapped, 'execute', { value: (...args: ArgsOf<U>) => read(call, args) })
  return wrapped
}

class RoleDeniedError extends ForbiddenError {
  constructor(message: string) { super('DATA_NOT_AVAILABLE_TO_ROLE', message) }
}

export interface RoleDenial {
  readonly roles: readonly string[]
  readonly message: string
}

/** Envuelve un caso de uso que un rol no puede ejecutar (p. ej. un Excel con nombres y cédulas para soporte). */
export const deniedTo = <U extends Executable>(inner: U, denial: RoleDenial, context: RequestContext): U => {
  const wrapped = Object.create(inner) as U
  const run = inner.execute as (...a: ArgsOf<U>) => Promise<ResultOf<U>>
  const denied = (): boolean => denial.roles.includes(context.current()?.actor?.role ?? '')
  const execute = (...args: ArgsOf<U>): Promise<ResultOf<U>> => (denied() ? Promise.reject(new RoleDeniedError(denial.message)) : run.apply(inner, args))
  Object.defineProperty(wrapped, 'execute', { value: execute })
  return wrapped
}
