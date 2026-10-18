const crypto = require('crypto');
const path = require('path');
const AdmZip = require('adm-zip');
const sequelize = require('../config/database');
const { GameVersion, GameSetting, User } = require('../models');
const { getOriginals, getPublished } = require('../config/deployStorage');

/**
 * Despliegue del juego WebGL (rol developer/admin).
 * 1. createVersion → fila 'uploading' + URL prefirmada de S3 (o subida local en desarrollo).
 * 2. El panel sube el ZIP y llama completeUpload → 'processing' y se encola la publicación.
 * 3. publish (en segundo plano, de a una): descarga el ZIP, lo valida y sube cada archivo a
 *    builds/<id>/ con sus headers → 'ready' (o 'failed' con el motivo).
 * 4. activate escribe current.json, el puntero que lee el Worker. Rollback = activar otra versión.
 */

const ACTIVE_KEY = 'active_version_id';
const MAX_MB = () => Number(process.env.DEPLOY_MAX_MB) || 500;
const PLAY_URL = () => (process.env.PLAY_URL || 'https://play.earthcation.saimers.dev').replace(/\/+$/, '');
const UPLOAD_CONCURRENCY = 8;

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ── Inspección del build ─────────────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

const ENCODINGS = { '.br': 'br', '.gz': 'gzip' };

/** Headers de un archivo del build: "x.wasm.br" es application/wasm con Content-Encoding br. */
const headersFor = (file) => {
  const ext = path.extname(file).toLowerCase();
  const contentEncoding = ENCODINGS[ext];
  const inner = contentEncoding ? file.slice(0, -ext.length) : file;
  // .unityweb (compresión con "Decompression Fallback"): el loader la descomprime en JS
  const contentType = MIME_TYPES[path.extname(inner).toLowerCase()] ?? 'application/octet-stream';
  return {
    contentType,
    contentEncoding,
    // Cada versión vive en su propia carpeta, así que todo es inmutable salvo el index
    cacheControl: file === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  };
};

/** Carpeta del build dentro del ZIP: la del index.html menos anidado (ZIP de la carpeta o de su contenido). */
const findRoot = (names) => {
  const index = names
    .filter(n => n.toLowerCase() === 'index.html' || n.toLowerCase().endsWith('/index.html'))
    .sort((a, b) => a.length - b.length)[0];
  return index ? index.slice(0, -'index.html'.length) : null;
};

/**
 * Abre el ZIP y valida que sea un build WebGL de Unity.
 * @returns {{ files: {path, data}[], manifest: object }}
 */
const inspectBuild = (zipBuffer) => {
  let entries;
  try {
    entries = new AdmZip(zipBuffer).getEntries()
      // __MACOSX/ son metadatos del compresor de macOS, no parte del build
      .filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX/'));
  } catch {
    throw new Error('El archivo no es un ZIP válido');
  }

  const root = findRoot(entries.map(e => e.entryName));
  if (root === null) throw new Error('El ZIP no tiene index.html: comprime la carpeta del build WebGL');

  const files = entries
    .filter(e => e.entryName.startsWith(root))
    .map(e => ({ path: e.entryName.slice(root.length), data: e.getData() }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const build = files.filter(f => f.path.startsWith('Build/')).map(f => f.path);
  const has = (re) => build.some(p => re.test(p));
  const missing = [
    [/\.loader\.js$/i, 'loader (.loader.js)'],
    [/\.framework\.js(\.br|\.gz|\.unityweb)?$/i, 'framework'],
    [/\.wasm(\.br|\.gz|\.unityweb)?$/i, 'wasm'],
    [/\.data(\.br|\.gz|\.unityweb)?$/i, 'data'],
  ].filter(([re]) => !has(re)).map(([, name]) => name);
  if (missing.length) throw new Error(`Al build le falta: ${missing.join(', ')} en la carpeta Build/`);

  const compression = has(/\.br$/i) ? 'brotli' : has(/\.gz$/i) ? 'gzip' : has(/\.unityweb$/i) ? 'fallback' : 'none';
  const index = files.find(f => f.path === 'index.html').data.toString('utf8');
  const productVersion = index.match(/productVersion:\s*["']([^"']+)["']/)?.[1] ?? null;

  const warnings = [];
  if (compression === 'none') warnings.push('Build sin compresión: los jugadores descargan unas 3 veces más. Usa Brotli.');
  if (compression === 'fallback') warnings.push('Build con "Decompression Fallback": el navegador descomprime en JavaScript, más lento. Desactívalo y usa Brotli.');
  if (files.some(f => f.path === 'ServiceWorker.js' || f.path === 'manifest.webmanifest')) {
    warnings.push('Build con plantilla PWA: su Service Worker puede dejar a los jugadores en una versión vieja. Usa la plantilla Earthcation.');
  }

  return {
    files,
    manifest: {
      root,
      compression,
      product_version: productVersion,
      total_bytes: files.reduce((s, f) => s + f.data.length, 0),
      files: files.map(f => ({ path: f.path, size: f.data.length })),
      warnings,
    },
  };
};

// ── Publicación en segundo plano ────────────────────────────────────────────

let queue = Promise.resolve();

/** Ejecuta `fn` sobre cada elemento con hasta `limit` en paralelo. */
const eachLimit = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

const publish = async (id) => {
  const version = await GameVersion.findByPk(id);
  if (!version || version.status !== 'processing') return;
  const started = Date.now();
  try {
    const { files, manifest } = inspectBuild(await getOriginals().getBuffer(version.s3_key));
    const published = getPublished();
    const prefix = `builds/${id}/`;
    await published.removePrefix(prefix); // por si es un reintento
    await eachLimit(files, UPLOAD_CONCURRENCY, f => published.put(prefix + f.path, f.data, headersFor(f.path)));
    await version.update({
      status: 'ready', r2_prefix: prefix, error: null, published_at: new Date(),
      manifest: { ...manifest, publish_ms: Date.now() - started },
    });
    console.log(`[deploy] versión ${version.label} publicada (${files.length} archivos, ${Date.now() - started} ms)`);
  } catch (err) {
    console.error(`[deploy] falló la versión ${version.label}:`, err.message);
    await version.update({ status: 'failed', error: err.message });
  }
};

const enqueuePublish = (id) => {
  queue = queue.then(() => publish(id)).catch(() => {});
};

/** Al arrancar: una publicación que se cortó por un reinicio queda como fallida (se puede reintentar). */
const recoverInterrupted = () => GameVersion.update(
  { status: 'failed', error: 'La publicación se interrumpió porque la API se reinició. Reintenta.' },
  { where: { status: 'processing' } },
);

// ── Versiones ───────────────────────────────────────────────────────────────

const getActiveId = async () => (await GameSetting.findByPk(ACTIVE_KEY))?.value ?? null;

const listVersions = async () => {
  const [versions, activeId] = await Promise.all([
    GameVersion.findAll({
      include: [{ model: User, as: 'uploader', attributes: ['id', 'first_name', 'last_name'] }],
      order: [['created_at', 'DESC']],
    }),
    getActiveId(),
  ]);
  return versions.map(v => ({ ...v.toJSON(), is_active: v.id === activeId }));
};

const createVersion = async (userId, { label, notes, size_bytes }) => {
  if (size_bytes > MAX_MB() * 1024 * 1024) throw httpError(413, `El ZIP supera el máximo de ${MAX_MB()} MB`);
  const id = crypto.randomUUID();
  const s3Key = `originals/${id}.zip`;
  const version = await GameVersion.create({
    id, label, notes: notes || null, size_bytes, s3_key: s3Key, uploaded_by: userId,
  });

  const originals = getOriginals();
  const upload = originals.driver === 's3'
    ? { mode: 'presigned', method: 'PUT', url: await originals.presignPut(s3Key, size_bytes), headers: { 'Content-Type': 'application/zip' } }
    : { mode: 'api', method: 'PUT', url: `/api/deploy/versions/${id}/upload`, headers: { 'Content-Type': 'application/zip' } };
  return { version, upload };
};

/** Solo en desarrollo (sin S3): el ZIP llega a la API en el cuerpo del PUT. */
const saveLocalUpload = async (id, buffer) => {
  const originals = getOriginals();
  if (originals.driver !== 'local') throw httpError(400, 'Con S3 el ZIP se sube a la URL prefirmada');
  const version = await GameVersion.findByPk(id);
  if (!version) throw httpError(404, 'Versión no encontrada');
  if (version.status !== 'uploading') throw httpError(409, 'La versión ya no espera el ZIP');
  await originals.put(version.s3_key, buffer);
};

const completeUpload = async (id) => {
  const version = await GameVersion.findByPk(id);
  if (!version) throw httpError(404, 'Versión no encontrada');
  if (!['uploading', 'failed'].includes(version.status)) throw httpError(409, 'La versión ya se está publicando o está lista');

  const size = await getOriginals().size(version.s3_key);
  if (size == null) throw httpError(400, 'El ZIP no llegó al almacenamiento. Vuelve a subirlo.');

  // Cambio atómico: dos clics (o dos instancias) no publican la misma versión dos veces
  const [changed] = await GameVersion.update(
    { status: 'processing', error: null, size_bytes: size },
    { where: { id, status: version.status } },
  );
  if (!changed) throw httpError(409, 'La versión cambió de estado; recarga la lista');
  enqueuePublish(id);
  return GameVersion.findByPk(id);
};

const activate = async (id) => {
  const version = await GameVersion.findByPk(id);
  if (!version) throw httpError(404, 'Versión no encontrada');
  if (version.status !== 'ready') throw httpError(409, 'Solo se puede activar una versión lista');

  const activatedAt = new Date();
  await sequelize.transaction(async (transaction) => {
    await GameSetting.upsert({ key: ACTIVE_KEY, value: id }, { transaction });
    await version.update({ activated_at: activatedAt }, { transaction });
    // Si escribir el puntero falla, la transacción se revierte y nada cambia
    await getPublished().put('current.json', JSON.stringify({
      version_id: id, label: version.label, prefix: version.r2_prefix, activated_at: activatedAt,
    }), { contentType: 'application/json', cacheControl: 'no-cache' });
  });
  return version;
};

const removeVersion = async (id) => {
  const version = await GameVersion.findByPk(id);
  if (!version) throw httpError(404, 'Versión no encontrada');
  if (version.id === await getActiveId()) throw httpError(409, 'No se puede borrar la versión activa: activa otra primero');
  if (version.status === 'processing') throw httpError(409, 'Espera a que termine de publicarse');

  await Promise.all([
    version.s3_key && getOriginals().remove(version.s3_key),
    getPublished().removePrefix(`builds/${id}/`),
  ]);
  await version.destroy();
};

// ── Vista previa ────────────────────────────────────────────────────────────
// Token corto que valida el Worker: /v/<id>/?t=<exp>.<firma>. HMAC con PLAY_SIGNING_SECRET (compartido).

const signingSecret = () => process.env.PLAY_SIGNING_SECRET || (getPublished().driver === 'local' ? 'local-dev' : null);

const previewToken = (id, ttlSeconds = 2 * 3600) => {
  const secret = signingSecret();
  if (!secret) throw httpError(503, 'Falta PLAY_SIGNING_SECRET en la API');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac('sha256', secret).update(`preview:${id}:${exp}`).digest('base64url');
  return `${exp}.${sig}`;
};

/** @param {string} apiBase origen de la API, para la vista previa local (/play-local) */
const previewUrl = async (id, apiBase) => {
  const version = await GameVersion.findByPk(id);
  if (!version) throw httpError(404, 'Versión no encontrada');
  if (version.status !== 'ready') throw httpError(409, 'La versión aún no está lista');
  const base = getPublished().driver === 'local' ? `${apiBase}/play-local` : PLAY_URL();
  return { url: `${base}/v/${id}/?t=${previewToken(id)}`, expires_in: 2 * 3600 };
};

const getStatus = async () => {
  const activeId = await getActiveId();
  const active = activeId ? await GameVersion.findByPk(activeId, { attributes: ['id', 'label', 'activated_at', 'manifest'] }) : null;
  return {
    play_url: getPublished().driver === 'local' ? null : PLAY_URL(),
    storage: { originals: getOriginals().driver, published: getPublished().driver },
    max_mb: MAX_MB(),
    active: active && { id: active.id, label: active.label, activated_at: active.activated_at, product_version: active.manifest?.product_version ?? null },
  };
};

module.exports = {
  listVersions, createVersion, saveLocalUpload, completeUpload, activate, removeVersion,
  previewUrl, getStatus, recoverInterrupted, getActiveId, headersFor, inspectBuild,
};
