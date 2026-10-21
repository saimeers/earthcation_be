import { InvalidBuildError } from './errors/DeploymentErrors'

// Inspección pura de un build WebGL de Unity a partir de las entradas del ZIP: carpeta raíz, archivos que no
// pueden faltar, compresión, versión del producto y avisos. Mismas reglas que buildCheck.js del panel.

/** Una entrada del ZIP; el contenido se lee solo si hace falta. */
export interface ZipEntry {
  readonly name: string
  readonly isDirectory: boolean
  /** Tamaño descomprimido que declara el ZIP, en bytes. */
  readonly size: number
  read(): Uint8Array
}

export interface BuildFile {
  readonly path: string
  readonly data: Uint8Array
}

export type Compression = 'brotli' | 'gzip' | 'fallback' | 'none'

export interface BuildManifest {
  readonly root: string
  readonly compression: Compression
  readonly productVersion: string | null
  readonly totalBytes: number
  readonly files: readonly { readonly path: string; readonly size: number }[]
  readonly warnings: readonly string[]
}

export interface InspectedBuild {
  readonly files: readonly BuildFile[]
  readonly manifest: BuildManifest
}

/** Headers con que se publica (y se sirve) cada archivo del build. */
export interface FileHeaders {
  readonly contentType: string
  readonly contentEncoding?: string
  readonly cacheControl: string
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4',
}
const ENCODINGS: Readonly<Record<string, string>> = { '.br': 'br', '.gz': 'gzip' }

const IMMUTABLE = 'public, max-age=31536000, immutable'

// Extensión del nombre (".br" de "x.wasm.br"); un nombre que empieza con punto no tiene extensión
const extOf = (file: string): string => {
  const base = file.slice(file.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/** Headers de un archivo del build: "x.wasm.br" es application/wasm con Content-Encoding br. */
const headersFor = (file: string): FileHeaders => {
  const ext = extOf(file)
  const contentEncoding = ENCODINGS[ext]
  const inner = contentEncoding ? file.slice(0, -ext.length) : file
  // .unityweb (compresión con "Decompression Fallback"): el loader la descomprime en JS
  const contentType = MIME_TYPES[extOf(inner)] ?? 'application/octet-stream'
  // Cada versión vive en su propia carpeta, así que todo es inmutable salvo el index
  const cacheControl = file === 'index.html' ? 'no-cache' : IMMUTABLE
  return contentEncoding ? { contentType, contentEncoding, cacheControl } : { contentType, cacheControl }
}

/** Carpeta del build dentro del ZIP: la del index.html menos anidado (ZIP de la carpeta o de su contenido). */
const findRoot = (names: readonly string[]): string | null => {
  const index = names.filter((n) => n.toLowerCase() === 'index.html' || n.toLowerCase().endsWith('/index.html'))
    .toSorted((a, b) => a.length - b.length)[0]
  return index === undefined ? null : index.slice(0, -'index.html'.length)
}

const REQUIRED: readonly (readonly [RegExp, string])[] = [
  [/\.loader\.js$/i, 'loader (.loader.js)'],
  [/\.framework\.js(\.br|\.gz|\.unityweb)?$/i, 'framework'],
  [/\.wasm(\.br|\.gz|\.unityweb)?$/i, 'wasm'],
  [/\.data(\.br|\.gz|\.unityweb)?$/i, 'data'],
]

type Has = (re: RegExp) => boolean

const compressionOf = (has: Has): Compression => {
  if (has(/\.br$/i)) return 'brotli'
  if (has(/\.gz$/i)) return 'gzip'
  return has(/\.unityweb$/i) ? 'fallback' : 'none'
}

const WARNINGS = {
  none: 'Build sin compresión: los jugadores descargan unas 3 veces más. Usa Brotli.',
  fallback: 'Build con "Decompression Fallback": el navegador descomprime en JavaScript, más lento. Desactívalo y usa Brotli.',
  pwa: 'Build con plantilla PWA: su Service Worker puede dejar a los jugadores en una versión vieja. Usa la plantilla Earthcation.',
}

const warningsOf = (compression: Compression, files: readonly BuildFile[]): readonly string[] => [
  ...(compression === 'none' || compression === 'fallback' ? [WARNINGS[compression]] : []),
  ...(files.some((f) => f.path === 'ServiceWorker.js' || f.path === 'manifest.webmanifest') ? [WARNINGS.pwa] : []),
]

const productVersionOf = (files: readonly BuildFile[]): string | null => {
  const index = files.find((f) => f.path === 'index.html')
  const html = index ? new TextDecoder().decode(index.data) : ''
  return /productVersion:\s*["']([^"']+)["']/.exec(html)?.[1] ?? null
}

const manifestOf = (root: string, files: readonly BuildFile[], has: Has): BuildManifest => {
  const compression = compressionOf(has)
  return {
    root, compression, productVersion: productVersionOf(files),
    totalBytes: files.reduce((sum, f) => sum + f.data.length, 0),
    files: files.map((f) => ({ path: f.path, size: f.data.length })),
    warnings: warningsOf(compression, files),
  }
}

const buildFrom = (root: string, files: readonly BuildFile[]): InspectedBuild => {
  const build = files.filter((f) => f.path.startsWith('Build/')).map((f) => f.path)
  const has: Has = (re) => build.some((p) => re.test(p))
  const missing = REQUIRED.filter(([re]) => !has(re)).map(([, name]) => name)
  if (missing.length > 0) throw new InvalidBuildError(`Al build le falta: ${missing.join(', ')} en la carpeta Build/`)
  return { files, manifest: manifestOf(root, files, has) }
}

// Un ZIP que dice ser un build puede ser una bomba (miles de archivos o un contenido que explota al descomprimir) o traer
// rutas con `..` que, en el almacenamiento local, escaparían de la carpeta de la versión.
export const MAX_ZIP_ENTRIES = 3000
export const MAX_UNPACKED_BYTES = 800 * 1024 * 1024

const unsafePath = (name: string): boolean =>
  name.startsWith("/") || name.includes(String.fromCharCode(92)) || name.includes(String.fromCharCode(0)) || name.split("/").includes("..")

const guard = (entries: readonly ZipEntry[]): void => {
  if (entries.length > MAX_ZIP_ENTRIES) throw new InvalidBuildError(`El ZIP tiene demasiados archivos (máximo ${MAX_ZIP_ENTRIES})`)
  if (entries.some((e) => unsafePath(e.name))) throw new InvalidBuildError('El ZIP tiene rutas no permitidas: sin .., barras invertidas ni rutas absolutas')
  if (entries.reduce((total, e) => total + e.size, 0) > MAX_UNPACKED_BYTES) {
    throw new InvalidBuildError('El contenido del ZIP descomprimido supera los 800 MB permitidos')
  }
}

// Lo que sale al descomprimir no puede pasar de lo que el ZIP declaró (un tamaño falso escondería una bomba)
const readChecked = (e: ZipEntry): Uint8Array => {
  const data = e.read()
  if (data.byteLength > e.size) throw new InvalidBuildError(`El archivo ${e.name} pesa más de lo que declara el ZIP`)
  return data
}

/** Valida que las entradas del ZIP sean un build WebGL de Unity; si no, InvalidBuildError con el motivo. */
const inspect = (entries: readonly ZipEntry[]): InspectedBuild => {
  guard(entries)
  // __MACOSX/ son metadatos del compresor de macOS, no parte del build
  const usable = entries.filter((e) => !e.isDirectory && !e.name.startsWith('__MACOSX/'))
  const root = findRoot(usable.map((e) => e.name))
  if (root === null) throw new InvalidBuildError('El ZIP no tiene index.html: comprime la carpeta del build WebGL')
  const files = usable.filter((e) => e.name.startsWith(root))
    .map((e) => ({ path: e.name.slice(root.length), data: readChecked(e) }))
    .toSorted((a, b) => a.path.localeCompare(b.path))
  return buildFrom(root, files)
}

/** Servicio de dominio puro del build WebGL (sin estado ni E/S). */
export const BuildInspection = { inspect, findRoot, headersFor } as const
