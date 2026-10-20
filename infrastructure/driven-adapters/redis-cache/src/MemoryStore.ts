interface Entry { readonly value: string; readonly expires: number }

// Tope burdo: es solo una caché, se vacía entera antes de crecer sin límite
const MAX_ENTRIES = 5000

/** Respaldo en memoria (desarrollo, pruebas o sin Redis): texto con vencimiento. */
export class MemoryStore {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly nowMs: () => number = Date.now) {}

  get(key: string): string | null {
    const hit = this.entries.get(key)
    if (!hit) return null
    if (hit.expires > this.nowMs()) return hit.value
    this.entries.delete(key)
    return null
  }

  set(key: string, value: string, ttlSeconds: number): void {
    if (this.entries.size > MAX_ENTRIES) this.entries.clear()
    this.entries.set(key, { value, expires: this.nowMs() + ttlSeconds * 1000 })
  }
}
