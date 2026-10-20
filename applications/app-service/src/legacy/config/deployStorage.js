const fs = require('fs/promises');
const path = require('path');
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Almacenamiento del despliegue del juego, en dos lugares:
 * - originals: el ZIP tal como lo subió el desarrollador (respaldo para republicar). AWS S3 si está
 *   AWS_S3_BUCKET; si no, una carpeta local (desarrollo).
 * - published: los archivos sueltos que sirve el Worker de play.earthcation.saimers.dev. Cloudflare R2
 *   si está R2_BUCKET; si no, una carpeta local que la API sirve en /play-local (desarrollo).
 * Las claves usan siempre "/" (builds/<id>/Build/x.wasm.br), también en disco.
 */

const LOCAL_ROOT = path.resolve(process.env.DEPLOY_LOCAL_DIR || '.deploy');

const localDriver = (folder) => {
  const base = path.join(LOCAL_ROOT, folder);
  const full = (key) => {
    const p = path.join(base, ...key.split('/'));
    if (!p.startsWith(base)) throw new Error('Ruta fuera del almacenamiento local');
    return p;
  };
  return {
    driver: 'local',
    base,
    full,
    async put(key, body) {
      await fs.mkdir(path.dirname(full(key)), { recursive: true });
      await fs.writeFile(full(key), body);
    },
    async getBuffer(key) { return fs.readFile(full(key)); },
    async size(key) {
      try { return (await fs.stat(full(key))).size; } catch { return null; }
    },
    async remove(key) { await fs.rm(full(key), { force: true }); },
    async removePrefix(prefix) { await fs.rm(full(prefix), { recursive: true, force: true }); },
  };
};

const s3Driver = (driver, client, bucket) => ({
  driver,
  async put(key, body, { contentType, contentEncoding, cacheControl } = {}) {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body,
      ContentType: contentType, ContentEncoding: contentEncoding, CacheControl: cacheControl,
    }));
  },
  async getBuffer(key) {
    const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await Body.transformToByteArray());
  },
  async size(key) {
    try {
      return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength;
    } catch (err) {
      if (err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  },
  async remove(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  async removePrefix(prefix) {
    let token;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map(o => ({ Key: o.Key }));
      if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  },
  // Subida directa desde el navegador: el ZIP no pasa por la API
  presignPut(key, contentLength, expiresIn = 900) {
    return getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket, Key: key, ContentType: 'application/zip', ContentLength: contentLength,
    }), { expiresIn });
  },
});

let originals, published;

const getOriginals = () => {
  if (originals) return originals;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return (originals = localDriver('originals'));
  const client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  });
  return (originals = s3Driver('s3', client, bucket));
};

const getPublished = () => {
  if (published) return published;
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return (published = localDriver('published'));
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  return (published = s3Driver('r2', client, bucket));
};

module.exports = { getOriginals, getPublished };
