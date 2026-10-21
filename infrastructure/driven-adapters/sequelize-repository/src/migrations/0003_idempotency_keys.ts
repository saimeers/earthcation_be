import type { Sequelize } from 'sequelize'

// Tabla de claves de idempotencia (Idempotency-Key): un reintento de red no duplica intentos, eventos ni progreso.
export const name = '0003_idempotency_keys'

export const up = async ({ context }: { readonly context: Sequelize }): Promise<void> => {
  await context.model('IdempotencyKey').sync()
}
