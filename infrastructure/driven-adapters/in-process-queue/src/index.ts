import type { PublishQueue } from '@earthcation/model'

/**
 * Publicaciones de a una, en el orden en que se completaron, dentro de este proceso. Un fallo no corta la cola (el
 * caso de uso ya deja la versión fallida). Lo pendiente se pierde al reiniciar: por eso, al arrancar, las versiones
 * en 'processing' pasan a fallidas.
 */
export class InProcessPublishQueue implements PublishQueue {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly run: (versionId: string) => Promise<void>) {}

  enqueue(versionId: string): void {
    this.tail = this.tail.then(() => this.run(versionId)).catch(() => undefined)
  }

  /** Se resuelve cuando termina lo encolado hasta ahora (pruebas y apagado ordenado). */
  idle(): Promise<void> {
    return this.tail
  }
}
