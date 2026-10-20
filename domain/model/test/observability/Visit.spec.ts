import { describe, expect, it } from 'vitest'
import { BotDetector, labelVersions, UserAgent, Visit, VisitWindow } from '../../src'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0'

describe('UserAgent', () => {
  it('dispositivo, sistema y navegador', () => {
    expect(UserAgent.of(CHROME_ANDROID).deviceInfo()).toEqual({ device: 'mobile', os: 'Android', browser: 'Chrome' })
    expect(UserAgent.of(EDGE_WINDOWS).deviceInfo()).toEqual({ device: 'desktop', os: 'Windows', browser: 'Edge' })
    expect(UserAgent.of('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1').deviceInfo()).toEqual({ device: 'tablet', os: 'iOS', browser: 'Safari' })
    expect(UserAgent.of('algo raro').deviceInfo()).toEqual({ device: 'desktop', os: 'Otro', browser: 'Otro' })
  })

  it('sin user-agent no se adivina nada', () => {
    expect(UserAgent.of(undefined).deviceInfo()).toEqual({ device: null, os: null, browser: null })
  })
})

describe('BotDetector', () => {
  it('robots por user-agent o por red de centro de datos', () => {
    expect(BotDetector.isBot('curl/8.0', null)).toBe(true)
    expect(BotDetector.isBot(undefined, null)).toBe(true)
    expect(BotDetector.isBot(CHROME_ANDROID, 'Hetzner Online GmbH')).toBe(true)
    expect(BotDetector.isBot(CHROME_ANDROID, 'Media Commerce Partners')).toBe(false)
  })
})

describe('Visit', () => {
  it('normaliza lo que manda el Worker', () => {
    const v = Visit.fromWorker({
      visitor: '  abc  ', version_id: 'no-es-uuid', session_code: '1234', country: 'COL', region: 'Norte de Santander Department',
      latitude: '7.5', longitude: '', asn: 1.5, user_agent: CHROME_ANDROID,
    })
    expect(v.toProps()).toMatchObject({
      visitor: 'abc', versionId: null, sessionCode: null, country: 'CO', region: 'Norte de Santander',
      latitude: 7.5, longitude: null, asn: null, isBot: false, device: 'mobile',
    })
  })

  it('acepta versión UUID, sala de 3 dígitos y ASN entero', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(Visit.fromWorker({ version_id: id, session_code: '042', asn: 27951, user_agent: CHROME_ANDROID }).toProps())
      .toMatchObject({ versionId: id, sessionCode: '042', asn: 27951 })
  })

  it('única: un robot nunca, sin visitante siempre, y si no lo decide la ventana', () => {
    const bot = Visit.fromWorker({ visitor: 'v', user_agent: 'curl/8' })
    expect(bot.uniqueKey).toBeNull()
    bot.markUnique()
    expect(bot.isUnique).toBe(false)
    const anonymous = Visit.fromWorker({ user_agent: CHROME_ANDROID })
    anonymous.markUnique()
    expect([anonymous.uniqueKey, anonymous.isUnique]).toEqual([null, true])
    const person = Visit.fromWorker({ visitor: 'v', user_agent: CHROME_ANDROID })
    person.markUnique(false)
    expect([person.uniqueKey, person.isUnique]).toEqual(['visit:v', false])
  })
})

describe('estadísticas de visitas', () => {
  it('ventana de días del panel', () => {
    expect([VisitWindow.of('7'), VisitWindow.of(90), VisitWindow.of('15'), VisitWindow.of(undefined)].map((w) => w.days))
      .toEqual([7, 90, 30, 30])
    expect(VisitWindow.of(7).since(new Date(7 * 86400000)).toISOString()).toBe('1970-01-01T00:00:00.000Z')
  })

  it('versiones borradas', () => {
    expect(labelVersions([{ key: 'a', count: 2 }, { key: 'b', count: 1 }], new Map([['a', 'v1.0']])))
      .toEqual([{ id: 'a', label: 'v1.0', count: 2 }, { id: 'b', label: 'Borrada', count: 1 }])
  })
})
