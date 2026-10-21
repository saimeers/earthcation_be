import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { BusinessRuleError, NotFoundError, TooLargeError } from '@earthcation/model'
import { errorHandlerLegacy, notFoundLegacy } from '../src'

const appThrowing = (error: unknown, logs: string[] = []) => {
  const app = express()
  app.get('/x', () => { throw error })
  app.use(express.json())
  app.post('/json', (_req, res) => { res.json({}) })
  app.use(notFoundLegacy)
  app.use(errorHandlerLegacy((m) => logs.push(m)))
  return app
}

describe('errorHandlerLegacy', () => {
  it('traduce errores de dominio al estado y mensaje de legacy', async () => {
    const res = await request(appThrowing(new NotFoundError('SESSION_NOT_FOUND', 'Sesión no encontrada'))).get('/x')
    expect([res.status, res.body]).toEqual([404, { error: 'Sesión no encontrada' }])
    expect((await request(appThrowing(new TooLargeError('ZIP_TOO_LARGE', 'Grande'))).get('/x')).status).toBe(413)
    expect((await request(appThrowing(new BusinessRuleError('R', 'Regla'))).get('/x')).status).toBe(400)
  })

  it('un 5xx no expone el detalle y queda en el log', async () => {
    const logs: string[] = []
    const res = await request(appThrowing(new Error('relation "x" does not exist'), logs)).get('/x')
    expect([res.status, res.body]).toEqual([500, { error: 'Error interno del servidor' }])
    expect(logs[0]).toContain('relation "x" does not exist')
  })

  it('JSON mal formado es 400 y una ruta desconocida 404', async () => {
    const app = appThrowing(new Error('x'))
    expect((await request(app).post('/json').set('content-type', 'application/json').send('{mal')).status).toBe(400)
    expect((await request(app).get('/nada')).body).toEqual({ error: 'Ruta no encontrada' })
  })
})
