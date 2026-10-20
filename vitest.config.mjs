import { defineConfig } from 'vitest/config'
import { BaseSequencer } from 'vitest/node'

// Las lecturas fotografían la semilla tal cual: van antes que las escrituras, que agregan filas
// (sesiones terminadas, usuarios, logins) y cambiarían la forma de algunas respuestas
class ReadsFirst extends BaseSequencer {
  async sort(files) {
    const rank = (f) => (f.moduleId.includes('reads') ? 0 : 1)
    return [...files].sort((a, b) => rank(a) - rank(b) || a.moduleId.localeCompare(b.moduleId))
  }
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/setup/global.js'],
    setupFiles: ['tests/setup/worker.js'],
    // Todos los archivos comparten la BD sembrada: uno a la vez y en orden fijo
    fileParallelism: false,
    sequence: { sequencer: ReadsFirst },
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 180000,
  },
})
