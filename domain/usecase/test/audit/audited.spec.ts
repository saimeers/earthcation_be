import { describe, expect, it } from 'vitest'
import type { AuditEntry, AuditFilter, AuditLog, AuditPage, AuditActor, AuditOrigin, RequestContext, RequestScope } from '@earthcation/model'
import { DomainError, ValidationError } from '@earthcation/model'
import { audited, fieldChanges } from '../../src'

class MemoryAudit implements AuditLog {
  readonly entries: AuditEntry[] = []
  failing = false

  record(entry: AuditEntry): Promise<void> {
    if (this.failing) return Promise.reject(new Error('BD caída'))
    this.entries.push(entry)
    return Promise.resolve()
  }

  list(_filter: AuditFilter): Promise<AuditPage> { return Promise.resolve({ rows: [], total: 0 }) }
}

class FakeContext implements RequestContext {
  scope: RequestScope | null = { origin: { ipHash: 'huella', userAgent: 'curl' }, actor: { id: 'admin-1', role: 'admin' } }

  run<T>(_origin: AuditOrigin | null, work: () => T): T { return work() }
  setActor(actor: AuditActor): void { if (this.scope) this.scope = { ...this.scope, actor } }
  current(): RequestScope | null { return this.scope }
}

// Un caso de uso de verdad: usa `this` y es una clase (los controladores lo tipan por su clase)
class RenameUseCase {
  calls = 0
  execute(cmd: { id: string, name: string }): Promise<{ id: string }> {
    this.calls += 1
    if (cmd.name === '') return Promise.reject(new ValidationError('NAME_REQUIRED', 'Falta el nombre'))
    return Promise.resolve({ id: cmd.id })
  }
}

const setup = () => {
  const audit = new MemoryAudit()
  const context = new FakeContext()
  const reports: string[] = []
  const deps = { audit, context, clock: { now: () => new Date('2026-10-21T10:00:00Z') }, report: (m: string) => reports.push(m) }
  return { audit, context, reports, deps }
}

describe('audited', () => {
  it('registra lo que describe el caso de uso con el actor y el origen de la petición', async () => {
    const { audit, deps } = setup()
    const rename = audited(new RenameUseCase(), {
      action: 'user.updated', describe: ([cmd], result) => ({ targetType: 'user', targetId: result.id, changes: fieldChanges({ name: cmd.name }) }),
    }, deps)
    expect(await rename.execute({ id: 'u1', name: 'Ana' })).toEqual({ id: 'u1' })
    expect(audit.entries).toEqual([{
      action: 'user.updated', targetType: 'user', targetId: 'u1', changes: { fields: ['name'] },
      actor: { id: 'admin-1', role: 'admin' }, origin: { ipHash: 'huella', userAgent: 'curl' }, occurredAt: new Date('2026-10-21T10:00:00Z'),
    }])
  })

  it('sigue siendo del mismo tipo y conserva su estado interno', async () => {
    const { deps } = setup()
    const inner = new RenameUseCase()
    const rename = audited(inner, { action: 'user.updated', describe: () => ({ targetType: 'user', targetId: null }) }, deps)
    expect(rename).toBeInstanceOf(RenameUseCase)
    await rename.execute({ id: 'u1', name: 'Ana' })
    expect(inner.calls).toBe(1)
  })

  it('la acción puede depender de los argumentos', async () => {
    const { audit, deps } = setup()
    const toggle = audited({ execute: (cmd: { active: boolean }) => Promise.resolve(cmd) }, {
      action: ([cmd]) => (cmd.active ? 'user.enabled' : 'user.disabled'), describe: () => ({ targetType: 'user', targetId: 'u1' }),
    }, deps)
    await toggle.execute({ active: false })
    await toggle.execute({ active: true })
    expect(audit.entries.map((e) => e.action)).toEqual(['user.disabled', 'user.enabled'])
  })

  it('el actor que trae la acción manda sobre el de la petición (un inicio de sesión)', async () => {
    const { audit, context, deps } = setup()
    context.scope = { origin: null, actor: null }
    const login = audited({ execute: () => Promise.resolve({ id: 'p1' }) }, {
      action: 'auth.login_succeeded', describe: (_a, r) => ({ targetType: 'user', targetId: r.id, actor: { id: r.id, role: 'instructor' } }),
    }, deps)
    await login.execute()
    expect(audit.entries[0]?.actor).toEqual({ id: 'p1', role: 'instructor' })
  })

  it('describe null: no hay nada que auditar', async () => {
    const { audit, deps } = setup()
    await audited(new RenameUseCase(), { action: 'user.updated', describe: () => null }, deps).execute({ id: 'u1', name: 'x' })
    expect(audit.entries).toEqual([])
  })

  it('lo que falla se audita solo si se declaró, y el error original sigue llegando', async () => {
    const { audit, deps } = setup()
    const withFailure = audited(new RenameUseCase(), {
      action: 'user.updated', describe: () => ({ targetType: 'user', targetId: null }),
      failure: { action: 'auth.login_failed', describe: (_a, error) => ({ targetType: 'account', targetId: null, changes: { reason: error instanceof DomainError ? error.code : 'ERROR' } }) },
    }, deps)
    await expect(withFailure.execute({ id: 'u1', name: '' })).rejects.toThrow('Falta el nombre')
    expect(audit.entries).toMatchObject([{ action: 'auth.login_failed', changes: { reason: 'NAME_REQUIRED' } }])
    const without = audited(new RenameUseCase(), { action: 'user.updated', describe: () => ({ targetType: 'user', targetId: null }) }, deps)
    await expect(without.execute({ id: 'u1', name: '' })).rejects.toThrow('Falta el nombre')
    expect(audit.entries).toHaveLength(1)
  })

  it('una falla al auditar no revierte la acción: queda en el log del servicio', async () => {
    const { audit, reports, deps } = setup()
    audit.failing = true
    const rename = audited(new RenameUseCase(), { action: 'user.updated', describe: () => ({ targetType: 'user', targetId: 'u1' }) }, deps)
    expect(await rename.execute({ id: 'u1', name: 'Ana' })).toEqual({ id: 'u1' })
    expect(reports).toEqual(['[AUDITORIA] no se pudo registrar user.updated: BD caída'])
  })

  it('fuera de una petición se audita sin actor ni origen', async () => {
    const { audit, context, deps } = setup()
    context.scope = null
    await audited(new RenameUseCase(), { action: 'user.updated', describe: () => ({ targetType: 'user', targetId: 'u1' }) }, deps).execute({ id: 'u1', name: 'x' })
    expect(audit.entries[0]).toMatchObject({ actor: undefined, origin: null })
  })
})

describe('fieldChanges', () => {
  it('guarda los nombres de los campos que vinieron y el rol, nunca los valores personales', () => {
    expect(fieldChanges({ cedula: '123', firstName: 'Ana', email: '', age: undefined, role: 'admin' })).toEqual({ fields: ['cedula', 'firstName', 'role'], role: 'admin' })
    expect(fieldChanges({ firstName: 'Ana' })).toEqual({ fields: ['firstName'] })
    expect(JSON.stringify(fieldChanges({ cedula: '123', firstName: 'Ana' }))).not.toMatch(/123|Ana/)
  })
})
