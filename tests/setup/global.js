import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Una sola semilla por corrida: esquema limpio en la BD de pruebas y datos por la API. Los archivos de
// prueba reciben los ids con inject('seed').
export default async function setup(project) {
  const { seed } = require('../support/seed.cjs')
  project.provide('seed', JSON.parse(JSON.stringify(await seed())))
  return async () => {
    await require('../../dist/src/config/database').close()
  }
}
