import { describe, it, expect } from 'vitest'
import { InvalidEnvError, allowedOrigins, parseEnv } from '../../src/config/env'

describe('parseEnv', () => {
  const secret = 'a'.repeat(32)

  it('valores por defecto', () => {
    expect(parseEnv({ JWT_SECRET: secret })).toEqual({
      JWT_SECRET: secret, PORT: 3000, NODE_ENV: 'development', DB_PORT: 5432, DB_POOL_MAX: 20, DB_POOL_MIN: 2,
      DEPLOY_MAX_MB: 500, DEPLOY_LOCAL_DIR: '.deploy', PLAY_URL: 'https://play.earthcation.saimers.dev', AWS_REGION: 'us-east-1',
      EMAIL_FROM: 'noreply@saimers.dev', ALLOWED_ORIGINS: [], DOCS_ACCESS: 'public',
      RATE_LIMIT_USER_MAX: 1500, RATE_LIMIT_IP_MAX: 3000, RATE_LIMIT_AUTH_MAX: 300,
      RATE_LIMIT_LOGIN_CEDULA_MAX: 10, RATE_LIMIT_LOGIN_IP_FAIL_MAX: 60, RATE_LIMIT_JOIN_MAX: 20,
    })
  })

  it('despliegue: vacío cuenta como ausente, PLAY_URL sin barra final y un máximo inválido vuelve a 500', () => {
    const parsed = parseEnv({ JWT_SECRET: secret, AWS_S3_BUCKET: '', PLAY_URL: 'https://x.dev//', DEPLOY_MAX_MB: 'mucho' })
    expect(parsed).toMatchObject({ AWS_S3_BUCKET: undefined, PLAY_URL: 'https://x.dev', DEPLOY_MAX_MB: 500 })
    expect(parseEnv({ JWT_SECRET: secret, DEPLOY_MAX_MB: '50' })).toMatchObject({ DEPLOY_MAX_MB: 50 })
  })

  it('límites de peticiones: inválido o 0 vuelve al valor por defecto', () => {
    expect(parseEnv({ JWT_SECRET: secret, RATE_LIMIT_USER_MAX: '20', RATE_LIMIT_IP_MAX: '0', RATE_LIMIT_AUTH_MAX: 'x' }))
      .toMatchObject({ RATE_LIMIT_USER_MAX: 20, RATE_LIMIT_IP_MAX: 3000, RATE_LIMIT_AUTH_MAX: 300 })
  })

  it('ALLOWED_ORIGINS: lista separada por coma, sin vacíos ni comodín', () => {
    expect(parseEnv({ JWT_SECRET: secret, ALLOWED_ORIGINS: 'https://a.dev, ,*,https://b.dev ' }).ALLOWED_ORIGINS)
      .toEqual(['https://a.dev', 'https://b.dev'])
    expect(parseEnv({ JWT_SECRET: secret, ALLOWED_ORIGINS: '*' }).ALLOWED_ORIGINS).toEqual([])
  })

  it('DOCS_ACCESS: solo public o staff; cualquier otro valor vuelve a public', () => {
    expect(parseEnv({ JWT_SECRET: secret, DOCS_ACCESS: 'staff' }).DOCS_ACCESS).toBe('staff')
    expect(parseEnv({ JWT_SECRET: secret, DOCS_ACCESS: 'nadie' }).DOCS_ACCESS).toBe('public')
  })

  it('CORS: en producción nunca cualquiera; sin lista se aceptan solo el panel y el juego', () => {
    const base = { JWT_SECRET: secret, FRONTEND_URL: 'https://panel.dev/login', PLAY_URL: 'https://play.dev/' }
    expect(allowedOrigins(parseEnv({ ...base, NODE_ENV: 'production' }))).toEqual(['https://panel.dev', 'https://play.dev'])
    expect(allowedOrigins(parseEnv({ ...base, NODE_ENV: 'production', ALLOWED_ORIGINS: '*' }))).toEqual(['https://panel.dev', 'https://play.dev'])
    expect(allowedOrigins(parseEnv({ ...base, NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://otro.dev' }))).toEqual(['https://otro.dev'])
    expect(allowedOrigins(parseEnv({ ...base, NODE_ENV: 'development' }))).toEqual([])
    expect(allowedOrigins(parseEnv({ JWT_SECRET: secret, NODE_ENV: 'production', PLAY_URL: 'no es una url' }))).toEqual([])
  })

  it('JWT_SECRET corto o ausente impide arrancar, con todos los problemas juntos', () => {
    expect(() => parseEnv({ JWT_SECRET: 'corto' })).toThrow(InvalidEnvError)
    expect(() => parseEnv({ JWT_SECRET: 'corto' })).toThrow(expect.objectContaining({
      problems: ['JWT_SECRET: debe tener al menos 32 caracteres'],
    }))
    expect(() => parseEnv({})).toThrow(expect.objectContaining({ problems: ['JWT_SECRET: falta'] }))
  })

  it('PORT se convierte a número', () => {
    expect(parseEnv({ JWT_SECRET: secret, PORT: '8080' })).toMatchObject({ PORT: 8080 })
  })
})
