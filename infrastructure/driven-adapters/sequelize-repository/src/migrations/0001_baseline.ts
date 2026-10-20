import type { Sequelize } from 'sequelize'
import { ensureEnumValues, runDbMaintenance } from './maintenance'

// Esquema de partida = el que dejaba `sync({ alter: true })` hasta la v1.1.0. En una BD nueva crea todo; en
// producción las tablas ya existen, así que `sync()` (sin alter) no cambia nada y solo queda registrada.
// Desde aquí cada cambio de esquema es una migración nueva (0002_..., 0003_...), nunca un cambio de modelo suelto.
export const name = '0001_baseline'

export const up = async ({ context }: { readonly context: Sequelize }): Promise<void> => {
  await ensureEnumValues(context)
  await context.sync()
  await runDbMaintenance(context)
}
