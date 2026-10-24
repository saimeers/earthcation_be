import { describe, expect, it } from 'vitest'
import { dialectOptions } from '../src/database'

const base = { port: 5432, ssl: true, poolMax: 20, poolMin: 2 }

describe('TLS de la conexión a Postgres', () => {
  it('sin TLS no pone opciones', () => {
    expect(dialectOptions({ ...base, ssl: false })).toEqual({})
  })

  it('sin CA cifra pero no verifica, que es lo que permite el certificado propio de Railway', () => {
    expect(dialectOptions(base)).toEqual({ ssl: { require: true, rejectUnauthorized: false } })
  })

  it('con CA verifica la cadena', () => {
    const ssl = dialectOptions({ ...base, sslCa: '-----BEGIN CERTIFICATE-----' }).ssl as Record<string, unknown>
    expect(ssl.require).toBe(true)
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toBe('-----BEGIN CERTIFICATE-----')
  })

  // El certificado de Railway dice CN=localhost y el host real es otro: comprobar el nombre tumbaría la conexión
  it('con CA no comprueba el nombre del servidor', () => {
    const ssl = dialectOptions({ ...base, sslCa: 'x' }).ssl as { checkServerIdentity?: () => unknown }
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity?.()).toBeUndefined()
  })
})
