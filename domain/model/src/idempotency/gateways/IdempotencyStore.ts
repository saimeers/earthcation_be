/** Respuesta guardada de una petición ya ejecutada (solo lo que se vuelve a enviar tal cual). */
export interface StoredReply {
  readonly status: number
  readonly data: unknown
  readonly location?: string
}

/** Qué se reclama: la clave de un usuario y la huella de la petición (método, ruta y cuerpo). */
export interface IdempotencyClaim {
  readonly userId: string
  readonly key: string
  readonly fingerprint: string
}

export type ClaimResult =
  | { readonly kind: 'new' }
  | { readonly kind: 'replay', readonly reply: StoredReply }
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'reused' }

/** Puerto de salida: dónde se recuerda qué claves ya se ejecutaron y con qué resultado. */
export interface IdempotencyStore {
  /** Reclama la clave de forma atómica: solo una petición recibe `new`. */
  claim(claim: IdempotencyClaim): Promise<ClaimResult>
  /** Guarda la respuesta de quien reclamó la clave. */
  complete(claim: IdempotencyClaim, reply: StoredReply): Promise<void>
  /** Suelta la clave de una petición que falló, para que el reintento se ejecute de nuevo. */
  release(claim: IdempotencyClaim): Promise<void>
  /** Borra las claves vencidas; devuelve cuántas. */
  purgeExpired(): Promise<number>
}
