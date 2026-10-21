import {
  ActivationPointer, BuildInspection, GameVersion, type FileHeaders, type PublishedStorage,
} from '@earthcation/model'

export interface PlayFile {
  readonly body: Uint8Array
  readonly headers: FileHeaders
}

/** Lo pedido dentro de una versión: `rest` es la ruta relativa a su carpeta ('' = la raíz de la versión). */
export interface PlayTarget {
  readonly rest: string
  /** null si el archivo no existe. */
  readonly file: PlayFile | null
}

const PREVIEW = /^v\/([0-9a-f-]{36})\/?(.*)$/i

const fileOf = (rest: string): string => (rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest)

/**
 * Solo en desarrollo (sin R2): imita al Worker de play.earthcation.saimers.dev sobre el almacenamiento publicado.
 * `v/<id>/...` → vista previa de esa versión (sin validar el token); lo demás → la versión activa (current.json).
 * null si no hay versión activa.
 */
export class GetPlayFileUseCase {
  constructor(private readonly published: PublishedStorage) {}

  async execute(path: string): Promise<PlayTarget | null> {
    const target = await this.targetOf(path)
    if (target === null) return null
    const name = fileOf(target.rest)
    const body = await this.published.read(target.prefix + name)
    return { rest: target.rest, file: body && { body, headers: BuildInspection.headersFor(name) } }
  }

  private async targetOf(path: string): Promise<{ prefix: string; rest: string } | null> {
    const [, id, rest] = PREVIEW.exec(path) ?? []
    if (id !== undefined) return { prefix: GameVersion.publishedPrefixFor(id), rest: rest ?? '' }
    const prefix = await this.activePrefix()
    return prefix === null ? null : { prefix, rest: path }
  }

  private async activePrefix(): Promise<string | null> {
    const pointer = await this.published.read(ActivationPointer.key)
    return pointer === null ? null : ActivationPointer.prefixOf(new TextDecoder().decode(pointer))
  }
}
