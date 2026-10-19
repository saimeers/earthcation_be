import fs from 'node:fs'
import { Router, type Request, type Response } from 'express'
import { getPublished } from '../../config/deployStorage'
import { headersFor } from './build'

// Solo en desarrollo (sin R2): imita al Worker de play.earthcation.saimers.dev sobre la carpeta local.
// /play-local/ → versión activa (current.json), /play-local/v/<id>/ → vista previa (sin validar token).

type LocalStore = { readonly full: (key: string) => string; readonly getBuffer: (key: string) => Promise<Buffer> }
type Target = { readonly prefix: string; readonly rest: string }

const PREVIEW = /^v\/([0-9a-f-]{36})\/?(.*)$/i

const activePrefix = async (store: LocalStore): Promise<string | null> => {
  const pointer = await store.getBuffer('current.json').then((b) => JSON.parse(b.toString('utf8')) as { prefix?: unknown }, () => null)
  return typeof pointer?.prefix === 'string' ? pointer.prefix : null
}

const targetOf = async (store: LocalStore, path: string): Promise<Target | null> => {
  const preview = PREVIEW.exec(path)
  if (preview) return { prefix: `builds/${preview[1] ?? ''}/`, rest: preview[2] ?? '' }
  const prefix = await activePrefix(store)
  return prefix === null ? null : { prefix, rest: path }
}

// Sin la barra final las rutas relativas del index (Build/...) apuntarían fuera de la versión
const missingSlash = (req: Request, rest: string): string | null => {
  const [pathname = '', query] = req.originalUrl.split('?')
  return rest === '' && !pathname.endsWith('/') ? `${pathname}/${query ? `?${query}` : ''}` : null
}

const serve = (res: Response, file: string, name: string) => {
  const { contentType, contentEncoding, cacheControl } = headersFor(name)
  res.set({ 'Content-Type': contentType, 'Cache-Control': cacheControl })
  if (contentEncoding) res.set('Content-Encoding', contentEncoding)
  fs.createReadStream(file).pipe(res)
}

const fileOf = (rest: string) => (rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest)

const respond = (res: Response, store: LocalStore, target: Target) => {
  const name = fileOf(target.rest)
  const file = store.full(target.prefix + name)
  if (fs.existsSync(file)) serve(res, file, name)
  else res.status(404).send('Archivo no encontrado')
}

const handle = async (req: Request, res: Response) => {
  const store = getPublished() as LocalStore
  const target = await targetOf(store, req.path.slice(1))
  if (target === null) { res.status(404).send('No hay una versión activa del juego'); return }
  const redirect = missingSlash(req, target.rest)
  if (redirect !== null) res.redirect(redirect)
  else respond(res, store, target)
}

export const playLocalRouter = (): Router => Router().get(/^\/(.*)$/, handle)
