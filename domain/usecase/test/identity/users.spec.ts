import { beforeEach, describe, expect, it } from 'vitest'
import {
  CedulaTakenError, UserEditForbiddenError, UsernameTakenError, UserNotFoundError,
} from '@earthcation/model'
import {
  ChangeUserStatusUseCase, CreateUserUseCase, GetUserUseCase, UpdateUserUseCase,
} from '../../src'
import {
  availabilityOf, FakeMailer, fakeGenerator, fakeHasher, fakeResetTokens, InMemoryUserReadModel, InMemoryUserRepository,
} from '../fakes/InMemoryIdentity'

const admin = { id: 'a', role: 'admin' as const, username: null }

describe('alta de usuarios', () => {
  let users: InMemoryUserRepository
  let mailer: FakeMailer
  let errors: string[]
  let create: CreateUserUseCase
  beforeEach(() => {
    users = new InMemoryUserRepository()
    users.add({ id: 'p', cedula: '1', username: '1' })
    mailer = new FakeMailer()
    errors = []
    create = new CreateUserUseCase({
      users, availability: availabilityOf(users), passwords: fakeHasher, generator: fakeGenerator, resetTokens: fakeResetTokens(),
      mailer, errors: { report: (m) => { errors.push(m) } },
    })
  })

  it('jugador: sin correo ni token de restablecimiento', async () => {
    expect(await create.execute({ fields: { cedula: '5' } })).toEqual({ userId: 'n2', notice: 'player' })
    expect(users.rows.get('n2')?.toProps()).toMatchObject({ username: '5', passwordHash: 'h:temporal', resetToken: null })
    expect(mailer.sent).toEqual([])
  })

  it('staff: correo de bienvenida con la contraseña temporal y el token', async () => {
    await create.execute({ fields: { cedula: '6', role: 'instructor', email: 'i@x.co', firstName: 'Ana' } })
    expect(mailer.sent).toEqual([{ to: 'i@x.co', name: 'Ana', temporaryPassword: 'temporal', resetToken: 'crudo' }])
  })

  it('si el correo falla el usuario queda creado y se avisa', async () => {
    expect(await create.execute({ fields: { cedula: '9', role: 'instructor', email: 'cae@x.co' } })).toEqual({ userId: 'n2', notice: 'failed' })
    expect(errors[0]).toContain('Resend caído')
  })

  it('usuario o cédula repetidos', async () => {
    await expect(create.execute({ fields: { cedula: '1' } })).rejects.toThrow(UsernameTakenError)
    await expect(create.execute({ fields: { cedula: '1', username: 'nuevo' } })).rejects.toThrow(CedulaTakenError)
  })
})

describe('edición y estado', () => {
  let users: InMemoryUserRepository
  let update: UpdateUserUseCase
  beforeEach(() => {
    users = new InMemoryUserRepository()
    users.add({ id: 'p', cedula: '1', username: '1' })
    users.add({ id: 's', cedula: '2', username: '2', role: 'instructor' })
    update = new UpdateUserUseCase({ users, availability: availabilityOf(users), readModel: new InMemoryUserReadModel(users) })
  })

  it('editar a otro sin ser admin está prohibido (antes de buscarlo); inexistente 404', async () => {
    await expect(update.execute({ id: 'zz', editor: { id: 'p', role: 'player', username: '1' }, fields: {} })).rejects.toThrow(UserEditForbiddenError)
    await expect(update.execute({ id: 'zz', editor: admin, fields: {} })).rejects.toThrow(UserNotFoundError)
  })

  it('conflictos solo con valores nuevos de otra cuenta', async () => {
    await expect(update.execute({ id: 'p', editor: admin, fields: { cedula: '2' } })).rejects.toThrow(CedulaTakenError)
    await expect(update.execute({ id: 'p', editor: admin, fields: { username: '2' } })).rejects.toThrow(UsernameTakenError)
    expect(await update.execute({ id: 'p', editor: admin, fields: { cedula: '1', lastName: 'Paz' } })).toMatchObject({ lastName: 'Paz' })
  })

  it('el jugador se edita a sí mismo sin cambiar de rol', async () => {
    await update.execute({ id: 'p', editor: { id: 'p', role: 'player', username: '1' }, fields: { firstName: 'Yo', role: 'admin' } })
    expect(users.rows.get('p')?.toProps()).toMatchObject({ firstName: 'Yo', role: 'player' })
  })

  it('deshabilitar, habilitar y detalle', async () => {
    const status = new ChangeUserStatusUseCase(users)
    expect((await status.execute({ id: 'p', active: false })).isActive).toBe(false)
    expect((await status.execute({ id: 'p', active: true })).isActive).toBe(true)
    await expect(status.execute({ id: 'zz', active: true })).rejects.toThrow('Usuario no encontrado')
    await expect(new GetUserUseCase(new InMemoryUserReadModel(users)).execute('zz')).rejects.toThrow(UserNotFoundError)
  })
})
