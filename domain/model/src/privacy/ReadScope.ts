import { ForbiddenError } from '../shared/errors/DomainError'

/**
 * Puerto de salida: qué jugadores puede ver un instructor. Son los que están inscritos en sus salas y los que juegan en el
 * Juego libre de su localidad; el resto de los datos personales no son suyos para leer.
 */
export interface ReadScope {
  visiblePlayerIds(instructorId: string): Promise<ReadonlySet<string>>
}

export class UserOutOfScopeError extends ForbiddenError {
  constructor() { super('USER_OUT_OF_SCOPE', 'Ese usuario no está en tus salas') }
}
