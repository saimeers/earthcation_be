import { describe, it, expect } from 'vitest'
import { ok, err, map, flatMap, andThen, fromNullable } from '../../src/legacy/shared/result'
import { parseEnv } from '../../src/config/env'

describe('Result', () => {
  it('map y flatMap solo tocan el Ok', () => {
    expect(map(ok(2), x => x * 3)).toEqual(ok(6))
    expect(map(err('x'), x => x * 3)).toEqual(err('x'))
    expect(flatMap(ok(2), x => (x > 1 ? ok(x) : err('chico')))).toEqual(ok(2))
    expect(flatMap(ok(0), x => (x > 1 ? ok(x) : err('chico')))).toEqual(err('chico'))
  })

  it('andThen corta en el primer error', async () => {
    const calls = []
    const step = (v) => { calls.push(v); return ok(v + 1) }
    expect(await andThen(andThen(Promise.resolve(ok(1)), step), step)).toEqual(ok(3))
    expect(await andThen(err('falló'), step)).toEqual(err('falló'))
    expect(calls).toEqual([1, 2])
  })

  it('fromNullable', () => {
    expect(fromNullable(0, () => 'falta')).toEqual(ok(0))
    expect(fromNullable(null, () => 'falta')).toEqual(err('falta'))
  })
})

describe('parseEnv', () => {
  const secret = 'a'.repeat(32)

  it('valores por defecto', () => {
    expect(parseEnv({ JWT_SECRET: secret })).toEqual(ok({
      JWT_SECRET: secret, PORT: 3000, NODE_ENV: 'development', DB_PORT: 5432, DB_POOL_MAX: 20, DB_POOL_MIN: 2,
      DEPLOY_MAX_MB: 500, DEPLOY_LOCAL_DIR: '.deploy', PLAY_URL: 'https://play.earthcation.saimers.dev', AWS_REGION: 'us-east-1',
      EMAIL_FROM: 'noreply@saimers.dev',
    }))
  })

  it('despliegue: vacío cuenta como ausente, PLAY_URL sin barra final y un máximo inválido vuelve a 500', () => {
    const parsed = parseEnv({ JWT_SECRET: secret, AWS_S3_BUCKET: '', PLAY_URL: 'https://x.dev//', DEPLOY_MAX_MB: 'mucho' })
    expect(parsed).toMatchObject({ ok: true, value: { AWS_S3_BUCKET: undefined, PLAY_URL: 'https://x.dev', DEPLOY_MAX_MB: 500 } })
    expect(parseEnv({ JWT_SECRET: secret, DEPLOY_MAX_MB: '50' })).toMatchObject({ value: { DEPLOY_MAX_MB: 50 } })
  })

  it('JWT_SECRET corto o ausente impide arrancar', () => {
    expect(parseEnv({ JWT_SECRET: 'corto' })).toEqual(err(['JWT_SECRET: debe tener al menos 32 caracteres']))
    expect(parseEnv({})).toEqual(err(['JWT_SECRET: falta']))
  })

  it('PORT se convierte a número', () => {
    expect(parseEnv({ JWT_SECRET: secret, PORT: '8080' })).toMatchObject({ ok: true, value: { PORT: 8080 } })
  })
})
