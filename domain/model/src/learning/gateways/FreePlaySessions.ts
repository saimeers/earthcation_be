/**
 * Puerto de salida hacia el contexto de sesiones: la sala "Juego libre" del jugador cuando el resultado o el
 * intento llega sin sala. `sessionId` es la que mandó el juego (si vino); `null`/`undefined` cae en libre.
 */
export interface FreePlaySessions {
  resolve(userId: string, sessionId: unknown): Promise<unknown>
}
