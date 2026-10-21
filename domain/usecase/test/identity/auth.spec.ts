import { beforeEach, describe, expect, it } from 'vitest'
import {
  CedulaRequiredError, InvalidCredentialsError, InvalidResetTokenError, ResetFieldsRequiredError, UserInactiveError,
  type LoginRecord,
} from '@earthcation/model'
import { LoginUseCase, RequestPasswordResetUseCase, ResetPasswordUseCase } from '../../src'
import { FakeMailer, fakeHasher, fakeResetTokens, fixedClock, InMemoryUserReadModel, InMemoryUserRepository } from '../fakes/InMemoryIdentity'

const origin = { ip: '1.1.1.1', headers: {} }

describe('inicio de sesión', () => {
  let users: InMemoryUserRepository
  let recorded: LoginRecord[]
  let login: LoginUseCase
  beforeEach(() => {
    users = new InMemoryUserRepository()
    users.add({ id: 'p', cedula: '1' })
    users.add({ id: 's', cedula: '2', role: 'instructor', isActive: false, passwordHash: 'h:secreta' })
    recorded = []
    login = new LoginUseCase({
      users, profiles: new InMemoryUserReadModel(users), passwords: fakeHasher,
      tokens: { issue: (c) => `jwt:${c.id}:${c.username ?? ''}` }, logins: { record: (l) => { recorded.push(l) } },
    })
  })

  it('el jugador entra solo con la cédula (aunque mande contraseña) y queda registrado', async () => {
    expect((await login.execute({ cedula: 1, password: 'lo-que-sea', origin })).token).toBe('jwt:p:1')
    expect(recorded).toEqual([{ userId: 'p', role: 'player', origin }])
  })

  it('staff inactivo con contraseña errada no revela que está inactivo', async () => {
    await expect(login.execute({ cedula: '2', password: 'mala', origin })).rejects.toThrow(InvalidCredentialsError)
    await expect(login.execute({ cedula: '2', password: undefined, origin })).rejects.toThrow(InvalidCredentialsError)
    await expect(login.execute({ cedula: '2', password: 'secreta', origin })).rejects.toThrow(UserInactiveError)
    await expect(login.execute({ cedula: '9', password: undefined, origin })).rejects.toThrow('Credenciales inválidas')
    await expect(login.execute({ cedula: '', password: undefined, origin })).rejects.toThrow(CedulaRequiredError)
    expect(recorded).toEqual([])
  })
})

describe('restablecer contraseña', () => {
  it('responde igual exista o no el correo; el token sirve una vez', async () => {
    const users = new InMemoryUserRepository()
    users.add({ id: 's', username: '2', email: 's@x.co' })
    const mailer = new FakeMailer()
    const resetTokens = fakeResetTokens()
    const request = new RequestPasswordResetUseCase({ users, resetTokens, mailer })
    const reset = new ResetPasswordUseCase({ users, resetTokens, passwords: fakeHasher, clock: fixedClock })
    await request.execute({ email: 'nadie@x.co' })
    await request.execute({ email: 's@x.co' })
    expect(mailer.sent).toEqual([{ to: 's@x.co', name: '2', resetToken: 'crudo' }])
    await reset.execute({ token: 'crudo', password: ' con espacios ' })
    expect(users.rows.get('s')?.passwordHash).toBe('h: con espacios ')
    await expect(reset.execute({ token: 'crudo', password: 'otra' })).rejects.toThrow(InvalidResetTokenError)
    await expect(reset.execute({ token: 'x', password: '' })).rejects.toThrow(ResetFieldsRequiredError)
  })

  it('el token vence a los 15 minutos', async () => {
    const users = new InMemoryUserRepository()
    users.add({ id: 's', email: 's@x.co' })
    await new RequestPasswordResetUseCase({ users, resetTokens: fakeResetTokens(), mailer: new FakeMailer() }).execute({ email: 's@x.co' })
    const later = { now: () => new Date(1000 + 15 * 60 * 1000 + 1) }
    const reset = new ResetPasswordUseCase({ users, resetTokens: fakeResetTokens(), passwords: fakeHasher, clock: later })
    await expect(reset.execute({ token: 'crudo', password: 'nueva' })).rejects.toThrow('Token inválido o expirado')
  })
})
