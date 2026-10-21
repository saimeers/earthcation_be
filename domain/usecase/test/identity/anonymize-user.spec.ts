import { describe, expect, it } from 'vitest'
import { UserAlreadyAnonymizedError, UserAnonymizationSelfError, UserNotFoundError } from '@earthcation/model'
import { AnonymizeUserUseCase } from '../../src'
import { InMemoryUserRepository } from '../fakes/InMemoryIdentity'

const setup = () => {
  const users = new InMemoryUserRepository()
  users.add({
    id: '11111111-1111-4111-8111-111111111111', username: '1234567890', cedula: '1234567890', email: 'ana@mina.co', firstName: 'Ana', lastName: 'Pérez',
    age: 41, role: 'player', passwordHash: 'hash-viejo',
    resetToken: { hash: 'h', expires: new Date('2099-01-01') },
  })
  const hashed: string[] = []
  const passwords = { hash: (plain: string) => { hashed.push(plain); return Promise.resolve(`hash(${plain})`) }, matches: () => Promise.resolve(false) }
  const anonymize = new AnonymizeUserUseCase({ users, passwords, generator: { generate: () => 'secreto-aleatorio' } })
  return { users, anonymize, hashed }
}

const admin = { id: 'admin-1', role: 'admin' as const, username: null }
const ID = '11111111-1111-4111-8111-111111111111'

describe('AnonymizeUserUseCase', () => {
  it('quita lo que identifica a la persona, deshabilita la cuenta y la deja sin contraseña utilizable', async () => {
    const { users, anonymize, hashed } = setup()
    await anonymize.execute({ id: ID, requester: admin })
    const saved = users.rows.get(ID)?.toProps()
    expect(saved).toMatchObject({
      firstName: 'Anonimizado', lastName: null, age: null, email: null, cedula: 'anon-11111111', username: 'anon-11111111',
      isActive: false, resetToken: null, role: 'player', id: ID,
    })
    expect(saved?.passwordHash).toBe('hash(secreto-aleatorio)')
    expect(JSON.stringify(saved)).not.toMatch(/1234567890|ana@mina|Pérez/)
    expect(hashed).toEqual(['secreto-aleatorio'])
  })

  it('no se puede anonimizar la propia cuenta, ni una que no existe, ni dos veces', async () => {
    const { anonymize } = setup()
    await expect(anonymize.execute({ id: ID, requester: { ...admin, id: ID } })).rejects.toThrow(UserAnonymizationSelfError)
    await expect(anonymize.execute({ id: 'no-existe', requester: admin })).rejects.toThrow(UserNotFoundError)
    await anonymize.execute({ id: ID, requester: admin })
    await expect(anonymize.execute({ id: ID, requester: admin })).rejects.toThrow(UserAlreadyAnonymizedError)
  })
})
