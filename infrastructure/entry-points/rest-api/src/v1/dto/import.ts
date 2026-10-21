import { z } from 'zod'

// Importación masiva de jugadores desde la planilla de la ANM (vista previa y confirmación).

export const MAX_IMPORT_ROWS = 5000

export const previewRowDto = z.object({
  cedula: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  age: z.number().nullable(),
  email: z.string().nullable(),
  organizationName: z.string().nullable(),
  locationMunicipality: z.string().nullable(),
  locationDepartment: z.string().nullable(),
  status: z.string().describe('Si la fila se puede importar o por qué no (cédula repetida, datos faltantes)'),
  message: z.string().nullable(),
})

const text = z.string().nullable().optional()

export const importBody = z.object({
  rows: z.array(z.object({
    cedula: z.union([z.string(), z.number()]),
    firstName: z.string().min(1),
    lastName: text,
    age: z.union([z.number(), z.string()]).nullable().optional(),
    email: text,
    organizationName: text,
    locationMunicipality: text,
    locationDepartment: text,
  })).min(1).max(MAX_IMPORT_ROWS).describe(`Filas de la vista previa que se confirman (hasta ${MAX_IMPORT_ROWS})`),
})

export const importReportDto = z.object({
  created: z.array(z.object({
    cedula: z.string(),
    userId: z.string(),
    organizationCreated: z.string().nullable(),
    locationCreated: z.string().nullable(),
    locationNoMatch: z.string().nullable(),
  })),
  skipped: z.array(z.looseObject({})),
  errors: z.array(z.looseObject({})),
})
