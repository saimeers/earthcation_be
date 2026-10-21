import { describe, expect, it } from 'vitest'
import {
  Cedula, CedulaRequiredError, Email, InvalidAgeError, InvalidRoleError, StaffEmailRequiredError, User, UserEditForbiddenError,
  UserIdentifierRequiredError, UserInactiveError, UserRole, type UserProps,
} from '../../src'

const props = (over: Partial<UserProps> = {}): UserProps => ({
  id: 'u1', username: '100', cedula: '100', email: null, firstName: 'Ana', lastName: 'Paz', age: 30, role: 'player',
  isActive: true, passwordHash: 'h', resetToken: null, placement: null, ...over,
})
const admin = { id: 'a', role: 'admin' as const, username: null }
const self = { id: 'u1', role: 'player' as const, username: '100' }

describe('value objects de identidad', () => {
  it('cédula y correo: número cuenta como texto, se recortan, vacío es null', () => {
    expect(Cedula.from(123)?.value).toBe('123')
    expect(Cedula.from('  ')).toBeNull()
    expect(() => Cedula.required('')).toThrow(CedulaRequiredError)
    expect(Email.from(' a@b.co ')?.value).toBe('a@b.co')
    expect(() => Email.required(undefined)).toThrow('El email es requerido')
  })

  it('rol: vacío es null, uno inexistente es error; solo el jugador entra sin contraseña', () => {
    expect(UserRole.from('')).toBeNull()
    expect(UserRole.from('developer')).toBe('developer')
    expect(() => UserRole.from('jefe')).toThrow(InvalidRoleError)
    expect([UserRole.needsPassword('player'), UserRole.needsPassword('instructor')]).toEqual([false, true])
  })
})

describe('User', () => {
  it('alta: usuario por defecto = cédula, vacíos → null; staff necesita correo', () => {
    expect(User.register({ cedula: 123, firstName: ' Ana ', email: '', age: '' })).toMatchObject({
      username: '123', cedula: '123', role: 'player', email: null, firstName: 'Ana', age: null,
      placement: { organizationId: null, locationId: null },
    })
    expect(() => User.register({ firstName: 'X' })).toThrow(UserIdentifierRequiredError)
    expect(() => User.register({ cedula: '1', role: 'admin' })).toThrow(StaffEmailRequiredError)
    expect(() => User.register({ cedula: '1', age: 'treinta' })).toThrow(InvalidAgeError)
  })

  it('importado: jugador con usuario = cédula y apellido vacío si no viene', () => {
    const draft = User.imported(Cedula.required('5'), { firstName: 'Luz', age: 41 }, { organizationId: 'o', locationId: null })
    expect(draft).toMatchObject({ username: '5', cedula: '5', role: 'player', lastName: '', age: 41, placement: { organizationId: 'o' } })
  })

  it('un no admin solo edita sus datos personales', () => {
    const u = User.restore(props())
    u.edit({ firstName: 'B', role: 'admin', cedula: '9', organizationId: 'x', username: 'otro' }, self)
    expect(u.toProps()).toMatchObject({ firstName: 'B', role: 'player', cedula: '100', username: '100', placement: null })
  })

  it('el admin edita identificadores, rol y perfil; vacíos → null, el usuario y el rol vacíos no cambian', () => {
    const u = User.restore(props({ placement: { organizationId: 'o1', locationId: 'l1' } }))
    u.edit({ age: '', email: '  ', username: '', role: '', cedula: '200', locationId: 'l2' }, admin)
    expect(u.toProps()).toMatchObject({
      age: null, email: null, username: '100', role: 'player', cedula: '200', placement: { organizationId: 'o1', locationId: 'l2' },
    })
    const sinPerfil = User.restore(props())
    sinPerfil.edit({ organizationId: 'o9' }, admin)
    expect(sinPerfil.toProps().placement).toEqual({ organizationId: 'o9', locationId: null })
  })

  it('cada quien edita su cuenta; el admin, cualquiera', () => {
    expect(() => { User.assertEditableBy('u1', self) }).not.toThrow()
    expect(() => { User.assertEditableBy('u2', admin) }).not.toThrow()
    expect(() => { User.assertEditableBy('u2', { ...self, role: 'instructor' }) }).toThrow(UserEditForbiddenError)
  })

  it('login, contraseña y estado', () => {
    const u = User.restore(props({ role: 'instructor', firstName: null, resetToken: { hash: 'x', expires: new Date(0) } }))
    expect([u.requiresPassword, u.displayName]).toEqual([true, '100'])
    u.changePassword('nuevo')
    expect(u.toProps()).toMatchObject({ passwordHash: 'nuevo', resetToken: null })
    u.disable()
    expect(() => { u.assertCanLogIn() }).toThrow(UserInactiveError)
  })
})
