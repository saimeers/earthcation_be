import { createRequire } from 'node:module'
import { afterAll } from 'vitest'

const require = createRequire(import.meta.url)

// Entorno de pruebas (BD, sin correos) antes de que cualquier prueba cargue src/
require('../support/env.cjs')

afterAll(async () => {
  await require('../../dist/src/config/database').close()
})
