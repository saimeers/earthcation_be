import { describe, expect, it } from 'vitest'
import { LoginEvent, loginPlace, utf8Header } from '../../src'

describe('ubicación del login', () => {
  it('corrige el UTF-8 que Node lee como latin1 y descarta países desconocidos', () => {
    const headers = { 'cf-ipcountry': 'XX', 'cf-region': 'Norte de Santander Department', 'cf-ipcity': Buffer.from('Cúcuta').toString('latin1') }
    expect(loginPlace(headers, true)).toEqual({ country: null, region: 'Norte de Santander', city: 'Cúcuta' })
  })

  it('un texto que ya venía bien no se toca', () => {
    expect(utf8Header('Cúcuta')).toBe('Cúcuta')
    expect(utf8Header(undefined)).toBeUndefined()
  })

  it('sin Cloudflare no se cree ningún header cf-*', () => {
    expect(loginPlace({ 'cf-ipcountry': 'CO' }, false)).toEqual({ country: null, region: null, city: null })
  })

  it('el evento junta usuario, ubicación y dispositivo', () => {
    const event = LoginEvent.fromRequest({
      userId: 'u1', role: 'player', fromCloudflare: true, headers: { 'cf-ipcountry': 'CO', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' },
    })
    expect(event.toProps()).toEqual({
      userId: 'u1', role: 'player', country: 'CO', region: null, city: null, device: 'desktop', os: 'Windows', browser: 'Otro',
    })
  })
})
