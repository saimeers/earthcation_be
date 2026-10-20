/** Ids nuevos: la versión necesita el suyo antes de guardarse, porque con él se nombra el ZIP original. */
export interface IdGenerator {
  newId(): string
}

export const randomIds: IdGenerator = { newId: () => crypto.randomUUID() }
