import { describe, it, expect } from 'vitest'
import { preview, readAnm, sectionTitles, splitFullName } from '../../src/legacy/contexts/identity/anm'
import { levenshtein, matchPlace, placeQuery } from '../../src/legacy/contexts/identity/places'
import { canEdit, toNewUser, toUserPatch } from '../../src/legacy/contexts/identity/domain'
import { makeIdentity } from '../../src/legacy/contexts/identity/application'

describe('Excel ANM', () => {
  it('títulos de sección combinados se arrastran a la derecha', () => {
    expect(sectionTitles(['Documento', '', 'Empresa', ''])).toEqual(['DOCUMENTO', 'DOCUMENTO', 'EMPRESA', 'EMPRESA'])
  })

  it('nombre completo: el último término es el apellido', () => {
    expect(splitFullName('Ana María López')).toEqual({ firstName: 'Ana María', lastName: 'López' })
    expect(splitFullName('Ana')).toEqual({ firstName: 'Ana', lastName: '' })
    expect(splitFullName('')).toEqual({ firstName: '', lastName: '' })
  })

  const sheet = [
    ['título'],
    ['DOCUMENTO DE\r\nIDENTIDAD', '', 'NOMBRE(S) Y APELLIDOS', 'EMPRESA', '', 'SOCORREDOR', ''],
    ['TIPO', 'Número', '', 'NOMBRE', 'CORREO ELECTRÓNICO', 'MUNICIPIO DE RESIDENCIA', 'CORREO ELECTRÓNICO'],
    ['CC', ' 1001 ', 'Luis Peña', 'Mina A', 'empresa@x.co', 'Tibú', 'luis@x.co'],
    ['CC', '', 'Relleno', '', '', '', ''],
    ['CC', 1001, 'Otro Luis', '', '', '', ''],
  ]

  it('lee filas con el correo del socorredor, no el de la empresa', () => {
    const rows = readAnm(sheet)
    expect(rows.ok).toBe(true)
    expect(rows.value).toHaveLength(2)
    expect(rows.value[0]).toMatchObject({ cedula: '1001', firstName: 'Luis', lastName: 'Peña', email: 'luis@x.co', organizationName: 'Mina A', age: null })
  })

  it('sin encabezado o sin columna de cédula', () => {
    expect(readAnm([['hola']])).toMatchObject({ ok: false, error: { code: 'ANM_HEADER_MISSING' } })
    expect(readAnm([['DOCUMENTO DE IDENTIDAD'], ['NOMBRE(S) Y APELLIDOS']]).error.message)
      .toBe('No se encontraron las columnas requeridas en el Excel: número de documento')
  })

  it('estados de la vista previa', () => {
    const base = { lastName: '', age: null, email: '', organizationName: '', locationMunicipality: '', locationDepartment: '' }
    const rows = [
      { ...base, cedula: '1', firstName: 'A' }, { ...base, cedula: '1', firstName: 'B' },
      { ...base, cedula: '2', firstName: '' }, { ...base, cedula: '3', firstName: 'C' }, { ...base, cedula: '4', firstName: 'D' },
    ]
    expect(preview(rows, new Set(['3'])).map((r) => r.status)).toEqual(['ok', 'duplicate_in_file', 'missing_required', 'duplicate_in_db', 'ok'])
  })
})

describe('catálogo de municipios', () => {
  it('distancia de edición', () => {
    expect(levenshtein('SANTANDER', 'SANTENDER')).toBe(1)
    expect(levenshtein('', 'ABC')).toBe(3)
    expect(levenshtein('KITTEN', 'SITTING')).toBe(3)
  })

  it('tolera mayúsculas, tildes, typos y alias', () => {
    expect(matchPlace('cucuta', 'NORTE DE SANTENDER')).toEqual({ municipality: 'Cúcuta', department: 'Norte de Santander' })
    expect(matchPlace('Bogota', 'Bogota')).toEqual({ municipality: 'Bogotá', department: 'Bogotá D.C.' })
    expect(matchPlace('Ciudad Gótica', 'Norte de Santander')).toBeNull()
  })

  it('sin coincidencia se usa el texto del Excel marcado', () => {
    expect(placeQuery(' Gótica ', ' Nowhere ')).toEqual({ municipality: 'Gótica', department: 'Nowhere', noMatch: true })
    expect(placeQuery('', 'Norte de Santander')).toBeNull()
  })
})

describe('reglas de usuario', () => {
  it('alta: usuario por defecto = cédula; staff necesita correo', () => {
    expect(toNewUser({ cedula: 123, first_name: ' Ana ', email: '' })).toMatchObject({
      ok: true, value: { username: '123', cedula: '123', role: 'player', email: null, details: { first_name: 'Ana' } },
    })
    expect(toNewUser({ first_name: 'X' })).toMatchObject({ ok: false, error: { code: 'USER_IDENTIFIER_REQUIRED' } })
    expect(toNewUser({ cedula: '1', role: 'admin' })).toMatchObject({ ok: false, error: { code: 'STAFF_EMAIL_REQUIRED' } })
  })

  it('un no admin solo edita sus datos personales', () => {
    const data = { first_name: 'A', role: 'admin', cedula: '9', organization_id: 'x', username: '' }
    expect(toUserPatch(data, { id: 'u1', role: 'player' })).toEqual({ user: { first_name: 'A' }, profile: {} })
    expect(toUserPatch(data, { id: 'a', role: 'admin' })).toEqual({
      user: { first_name: 'A', role: 'admin', cedula: '9' }, profile: { organization_id: 'x' },
    })
    expect([canEdit('u1', { id: 'u1', role: 'player' }), canEdit('u2', { id: 'u1', role: 'instructor' })]).toEqual([true, false])
  })
})

describe('casos de uso de identidad', () => {
  const memory = () => {
    const users = new Map([
      ['p', { id: 'p', username: '1', cedula: '1', role: 'player', isActive: true, passwordHash: 'h:x', email: null }],
      ['s', { id: 's', username: '2', cedula: '2', role: 'instructor', isActive: false, passwordHash: 'h:secreta', email: 's@x.co' }],
    ])
    const sent = []
    const errors = []
    const deps = {
      accounts: {
        findForLogin: async (cedula) => [...users.values()].find((u) => u.cedula === cedula) ?? null,
        findByEmail: async (email) => { const u = [...users.values()].find((x) => x.email === email); return u ? { id: u.id, email, name: u.username } : null },
        findByResetToken: async (hash, now) => [...users.values()].find((u) => u.reset?.hash === hash && u.reset.expires > now)?.id ?? null,
        saveResetToken: async (id, reset) => { users.get(id).reset = reset },
        savePassword: async (id, hash) => { Object.assign(users.get(id), { passwordHash: hash, reset: null }) },
        findIdentity: async (id) => users.get(id) ?? null,
        usernameExists: async (username) => [...users.values()].some((u) => u.username === username),
        cedulaExists: async (cedula) => [...users.values()].some((u) => u.cedula === cedula),
        registeredCedulas: async () => new Set(),
        create: async (u) => { users.set('n', { id: 'n', ...u }); return 'n' },
        createImported: async (u) => { if (u.cedula === 'roto') throw new Error('valor inválido'); return `i${u.cedula}` },
        update: async () => {}, updateProfile: async () => {}, setActive: async (id) => users.has(id),
      },
      users: { list: async () => [], get: async (id) => (users.has(id) ? { id } : null), sessions: async () => [] },
      directory: { organization: async () => ({ id: 'o', created: true }), location: async () => ({ id: 'l', created: false }) },
      passwords: { hash: async (p) => `h:${p}`, matches: async (p, h) => h === `h:${p}`, generate: () => 'temporal' },
      resetTokens: { generate: () => 'crudo', hash: (raw) => `sha:${raw}` },
      tokens: { issue: (c) => `jwt:${c.id}` },
      mailer: { welcome: async (m) => { if (m.to === 'cae@x.co') throw new Error('Resend caído'); sent.push(m) }, passwordReset: async (m) => { sent.push(m) } },
      spreadsheets: { firstSheet: () => [] },
      now: () => 1000,
      logError: (m) => { errors.push(m) },
    }
    return { id: makeIdentity(deps), users, sent, errors }
  }

  it('jugador entra sin contraseña; staff inactivo con contraseña errada no revela que está inactivo', async () => {
    const { id } = memory()
    expect(await id.login('1')).toMatchObject({ ok: true, value: { token: 'jwt:p' } })
    expect(await id.login(2, 'mala')).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } })
    expect(await id.login('2', 'secreta')).toMatchObject({ ok: false, error: { code: 'USER_INACTIVE' } })
    expect(await id.login('')).toMatchObject({ ok: false, error: { code: 'CEDULA_REQUIRED' } })
  })

  it('restablecer: el token sirve una vez y vence', async () => {
    const { id, sent } = memory()
    expect(await id.forgotPassword('nadie@x.co')).toEqual({ ok: true, value: null })
    await id.forgotPassword('s@x.co')
    expect(sent.at(-1)).toEqual({ to: 's@x.co', username: '2', resetToken: 'crudo' })
    expect(await id.resetPassword('crudo', 'nueva')).toEqual({ ok: true, value: null })
    expect(await id.resetPassword('crudo', 'otra')).toMatchObject({ ok: false, error: { code: 'RESET_TOKEN_INVALID' } })
  })

  it('alta de staff: si el correo falla el usuario queda creado y se avisa', async () => {
    const { id, errors } = memory()
    expect(await id.create({ cedula: '1' })).toMatchObject({ ok: false, error: { code: 'USERNAME_TAKEN' } })
    expect(await id.create({ cedula: '9', role: 'instructor', email: 'cae@x.co' }))
      .toEqual({ ok: true, value: { userId: 'n', emailSent: false, notified: 'failed' } })
    expect(errors[0]).toContain('Resend caído')
  })

  it('editar a otro sin ser admin está prohibido; usuario inexistente 404', async () => {
    const { id } = memory()
    expect(await id.update('s', { id: 'p', role: 'player' }, {})).toMatchObject({ ok: false, error: { kind: 'forbidden' } })
    expect(await id.update('zz', { id: 'a', role: 'admin' }, {})).toMatchObject({ ok: false, error: { kind: 'not_found' } })
    expect(await id.update('p', { id: 'a', role: 'admin' }, { cedula: '2' })).toMatchObject({ ok: false, error: { code: 'CEDULA_TAKEN' } })
  })

  it('confirmar importación: una fila que falla no detiene las demás', async () => {
    const { id } = memory()
    const r = await id.confirmImport([{ cedula: 'roto', first_name: 'A' }, { cedula: '1', first_name: 'B' }, { cedula: '7', first_name: 'C', organization_name: 'Mina' }])
    expect(r.value.errors).toEqual([{ cedula: 'roto', reason: 'valor inválido' }])
    expect(r.value.skipped).toEqual([{ cedula: '1', reason: 'Cédula ya registrada' }])
    expect(r.value.created).toEqual([{ cedula: '7', userId: 'i7', organizationCreated: 'Mina', locationCreated: null, locationNoMatch: null }])
    expect(await id.confirmImport([])).toMatchObject({ ok: false, error: { code: 'IMPORT_ROWS_REQUIRED' } })
  })
})
