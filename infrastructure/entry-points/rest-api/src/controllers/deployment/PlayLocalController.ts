import type { Request, Response } from 'express'
import type { GetPlayFileUseCase, PlayFile } from '@earthcation/usecase'

// Sin la barra final las rutas relativas del index (Build/...) apuntarían fuera de la versión
const missingSlash = (req: Request, rest: string): string | null => {
  const [pathname = '', query] = req.originalUrl.split('?')
  return rest === '' && !pathname.endsWith('/') ? `${pathname}/${query ? `?${query}` : ''}` : null
}

const send = (res: Response, file: PlayFile): void => {
  const { contentType, contentEncoding, cacheControl } = file.headers
  res.set({ 'Content-Type': contentType, 'Cache-Control': cacheControl })
  if (contentEncoding) res.set('Content-Encoding', contentEncoding)
  res.end(file.body)
}

/** Solo en desarrollo (sin R2): sirve el juego publicado como lo haría el Worker, sin token. */
export class PlayLocalController {
  constructor(private readonly getPlayFile: GetPlayFileUseCase) {}

  serve = async (req: Request, res: Response): Promise<void> => {
    const target = await this.getPlayFile.execute(req.path.slice(1))
    if (target === null) { res.status(404).send('No hay una versión activa del juego'); return }
    const redirect = missingSlash(req, target.rest)
    if (redirect !== null) res.redirect(redirect)
    else if (target.file === null) res.status(404).send('Archivo no encontrado')
    else send(res, target.file)
  }
}
