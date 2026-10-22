import { AsyncLocalStorage } from 'node:async_hooks'
import type { AuditActor, AuditOrigin, RequestContext, RequestScope } from '@earthcation/model'

// El ámbito es mutable a propósito: la entrada lo abre al llegar la petición y `authenticate` le pone el actor
// más tarde, dentro de la misma cadena asíncrona.
interface MutableScope {
  origin: AuditOrigin | null
  actor: AuditActor | null
}

/** RequestContext sobre AsyncLocalStorage de Node: cada petición ve solo su propio ámbito. */
export class AsyncRequestContext implements RequestContext {
  private readonly storage = new AsyncLocalStorage<MutableScope>()

  run<T>(origin: AuditOrigin | null, work: () => T): T {
    return this.storage.run({ origin, actor: null }, work)
  }

  setActor(actor: AuditActor): void {
    const scope = this.storage.getStore()
    if (scope) scope.actor = actor
  }

  current(): RequestScope | null {
    const scope = this.storage.getStore()
    return scope ? { origin: scope.origin, actor: scope.actor } : null
  }
}
