import { z } from 'zod'
import type { RoomReport } from '@earthcation/usecase'
import { keyOf } from '@earthcation/model'

// Respuestas v1 de salas. Las filas y los cálculos de detalle y análisis salen de camelize (v1/dto/camelize.ts); los
// esquemas documentan lo estable y dejan abierto el resto (`looseObject`), porque el detalle crece con los niveles.

export const roomStatus = z.enum(['waiting', 'active', 'finished'])

export const roomDto = z.looseObject({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  status: roomStatus,
  isFreePlay: z.boolean().optional(),
  locationId: z.string().nullable().optional(),
  instructorId: z.string().nullable().optional(),
  createdAt: z.iso.datetime().optional(),
  startedAt: z.iso.datetime().nullable().optional(),
  endedAt: z.iso.datetime().nullable().optional(),
  instructor: z.looseObject({ firstName: z.string().nullable(), lastName: z.string().nullable() }).optional(),
})

export const joinedRoomDto = z.object({
  session: roomDto,
  joined: z.boolean().describe('false si el jugador ya estaba inscrito en la sala'),
})

export const roomProgressDto = z.looseObject({}).describe('Avance por participante de la sala (solo del instructor dueño)')

export const roomDetailDto = z.looseObject({
  participants: z.array(z.looseObject({})),
  levels: z.array(z.looseObject({})),
  failReasons: z.array(z.looseObject({})),
}).describe('Detalle de la sala: participantes con su desempeño, resumen por nivel y motivos de fallo')

export const participantAnalysisDto = z.looseObject({}).describe('Análisis individual de un participante: intentos, recorridos y tiempos de lectura')

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Nombre del Excel: sesion-<código>-<AAAA-MM-DD>.xlsx */
export const exportFilename = (report: RoomReport): string => `sesion-${keyOf(report.code)}-${new Date().toISOString().slice(0, 10)}.xlsx`
