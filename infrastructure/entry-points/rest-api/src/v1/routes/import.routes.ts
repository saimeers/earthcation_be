import multer from 'multer'
import { z } from 'zod'
import { InvalidRequestError } from '../http/validate'
import { created, ok } from '../http/reply'
import { route, type Route } from '../http/route'
import type { BulkImportUseCases } from '../../controllers/identity/BulkImportController'
import { importBody, importReportDto, previewRowDto } from '../dto/import'

// Importar jugadores: admin e instructor
const IMPORTERS = ['admin', 'instructor'] as const

// En memoria: el archivo solo se lee, no se guarda en disco
const MAX_FILE_BYTES = 10 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } }).single('file')

/** Rutas de v1 de la importación masiva de jugadores desde la planilla de la ANM. */
export const importRoutesV1 = (uc: BulkImportUseCases): Route[] => [
  route({
    method: 'post', path: '/user-imports/previews', tag: 'Importación', summary: 'Lee la planilla y devuelve la vista previa (no guarda nada)', roles: IMPORTERS,
    middlewares: [upload], upload: { contentType: 'multipart/form-data', description: 'Planilla Excel (.xlsx o .xls) de la ANM, hasta 10 MB', field: 'file' },
    response: { status: 200, description: 'Una fila por persona, con su estado', schema: z.array(previewRowDto) },
    handler: async ({ req }) => {
      if (!req.file) throw new InvalidRequestError([{ field: 'body.file', message: 'Falta el archivo de la planilla' }])
      return ok(await uc.preview.execute({ file: req.file.buffer }))
    },
  }),
  route({
    method: 'post', path: '/user-imports', tag: 'Importación', summary: 'Confirma la importación: crea los usuarios, organizaciones y localidades', roles: IMPORTERS,
    body: importBody,
    response: { status: 201, description: 'Qué se creó, qué se omitió y qué falló', schema: importReportDto },
    handler: async ({ body }) => created('/api/v1/users', await uc.confirm.execute({ rows: body.rows })),
  }),
]
