import { canSee, SessionForbiddenError, seesEverything, type Requester, type SessionRepository } from '@earthcation/model'

/**
 * Admin y desarrollador ven cualquier sala; el instructor, las suyas y el Juego libre de su localidad (403 si
 * no). Compartido por el detalle, el análisis por participante y el Excel (no es un caso de uso: no hace más
 * que decidir visibilidad antes de que cada uno pida su propio dato).
 */
export const assertCanView = async (repo: SessionRepository, id: string, r: Requester): Promise<void> => {
  if (seesEverything(r)) return
  const room = await repo.find(id)
  const visible = room !== null && canSee(room, r.id, await repo.profileLocation(r.id))
  if (!visible) throw new SessionForbiddenError()
}
