import type { AuditAction, AuditActor, AuditDraft, AuditEntry, AuditLog, Clock, RequestContext, RequestScope } from '@earthcation/model'

// Auditoría como decorador de casos de uso: el caso de uso no sabe que se audita. El actor y el origen no viajan en
// los comandos: salen del ámbito de la petición (RequestContext), que abre la entrada HTTP.

export interface AuditDeps {
  readonly audit: AuditLog
  readonly context: RequestContext
  readonly clock: Clock
  /** Una falla al auditar no revierte la acción: queda en el log del servicio. */
  readonly report: (message: string) => void
}

type Executable = { readonly execute: (...args: never[]) => Promise<unknown> }
type ArgsOf<U extends Executable> = Parameters<U['execute']>
type ResultOf<U extends Executable> = Awaited<ReturnType<U['execute']>>

export interface AuditSpec<U extends Executable> {
  /** Fija, o según los argumentos (habilitar y deshabilitar comparten caso de uso). */
  readonly action: AuditAction | ((args: ArgsOf<U>, result: ResultOf<U>) => AuditAction)
  /** Qué pasó, a partir de los argumentos y el resultado; null si esta vez no hay nada que auditar. */
  readonly describe: (args: ArgsOf<U>, result: ResultOf<U>) => AuditDraft | null
  /** Para lo que también se audita cuando falla (un inicio de sesión rechazado). */
  readonly failure?: { readonly action: AuditAction, readonly describe: (args: ArgsOf<U>, error: unknown) => AuditDraft | null }
}

// El actor que trae la acción (un login) manda sobre el de la petición, que aún no tiene sesión
const actorOf = (draft: AuditDraft, scope: RequestScope | null): AuditActor | undefined => draft.actor ?? scope?.actor ?? undefined

const entryOf = (action: AuditAction, draft: AuditDraft, deps: AuditDeps): AuditEntry => {
  const scope = deps.context.current()
  return { ...draft, action, actor: actorOf(draft, scope), origin: scope?.origin ?? null, occurredAt: deps.clock.now() }
}

const write = async (action: AuditAction, draft: AuditDraft | null, deps: AuditDeps): Promise<void> => {
  if (!draft) return
  try {
    await deps.audit.record(entryOf(action, draft, deps))
  } catch (error) {
    deps.report(`[AUDITORIA] no se pudo registrar ${action}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Lo que se sabe de una llamada: el caso de uso decorado, sus argumentos y con qué se audita
interface Call<U extends Executable> {
  readonly spec: AuditSpec<U>
  readonly args: ArgsOf<U>
  readonly deps: AuditDeps
}

const succeeded = async <U extends Executable>(call: Call<U>, result: ResultOf<U>): Promise<void> => {
  const { spec, args } = call
  const action = typeof spec.action === 'function' ? spec.action(args, result) : spec.action
  await write(action, spec.describe(args, result), call.deps)
}

const failed = async <U extends Executable>(call: Call<U>, error: unknown): Promise<void> => {
  const { spec, args } = call
  if (spec.failure) await write(spec.failure.action, spec.failure.describe(args, error), call.deps)
}

const settle = async <U extends Executable>(call: Call<U>, attempt: Promise<ResultOf<U>>): Promise<ResultOf<U>> => {
  const result = await attempt.catch(async (error: unknown) => {
    await failed(call, error)
    throw error
  })
  await succeeded(call, result)
  return result
}

/**
 * Envuelve un caso de uso: ejecuta el original y registra lo que describe `spec`, tanto si salió bien como (si se
 * declaró) si falló. Devuelve un objeto que hereda del original (sigue siendo del mismo tipo para quien lo usa) con
 * `execute` reemplazado.
 */
export const audited = <U extends Executable>(inner: U, spec: AuditSpec<U>, deps: AuditDeps): U => {
  const wrapped = Object.create(inner) as U
  const run = inner.execute as (...a: ArgsOf<U>) => Promise<ResultOf<U>>
  const execute = (...args: ArgsOf<U>): Promise<ResultOf<U>> => settle({ spec, args, deps }, run.apply(inner, args))
  Object.defineProperty(wrapped, 'execute', { value: execute })
  return wrapped
}
