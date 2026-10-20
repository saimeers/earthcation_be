import type { RequestHandler } from 'express'
import { IngestSecretInvalidError } from '@earthcation/model'
import { sameSecret } from './cloudflare'

/**
 * Sin token: la ingesta la protege `x-ingest-secret` (VISITS_INGEST_SECRET, compartido con el Worker). Sin
 * secreto configurado nadie puede ingerir.
 */
export const requireIngestSecret = (secret: string | undefined): RequestHandler => (req, _res, next) => {
  if (secret === undefined || secret === '' || !sameSecret(req.headers['x-ingest-secret'], secret)) {
    throw new IngestSecretInvalidError()
  }
  next()
}
