import { z } from 'zod'

// Cuerpos y respuestas v1 de visitas y salud. Los objetos del dominio ya salen en camelCase: solo se documentan.

/** Lo que reporta el Worker de Cloudflare al servir el juego; lo que no tenga la forma esperada se guarda como nulo. */
export const visitBody = z.looseObject({
  visitor: z.string().nullable().optional().describe('Hash del visitante (IP + navegador); nunca la IP'),
  versionId: z.string().nullable().optional(),
  sessionCode: z.string().nullable().optional().describe('Código de sala si entró por el QR'),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  colo: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  asOrganization: z.string().nullable().optional(),
  asn: z.number().int().nullable().optional(),
  userAgent: z.string().nullable().optional(),
})

export const visitsQuery = z.object({ days: z.coerce.number().int().optional().describe('Ventana en días: 7, 30 o 90 (por defecto 7)') })

export const visitStatsDto = z.looseObject({
  days: z.number(),
  since: z.string(),
  totals: z.looseObject({ visits: z.number(), unique: z.number(), viaQr: z.number(), visitors: z.number(), bots: z.number() }),
}).describe('Visitas al juego por día, región, ciudad, dispositivo, sistema, navegador y versión, más los inicios de sesión por rol')

export const publicHealthDto = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeS: z.number(),
})

export const healthDetailsDto = publicHealthDto.extend({
  memoryMb: z.number(),
  database: z.looseObject({}),
  redis: z.looseObject({}),
  metrics: z.looseObject({}).optional().describe('Peticiones, errores y latencias p50 y p95 de los últimos 15 minutos, por ruta'),
})
