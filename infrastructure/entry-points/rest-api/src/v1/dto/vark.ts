import { z } from 'zod'
import { VARK_STYLES, type VarkResult } from '@earthcation/model'
import type { VarkSubmission } from '@earthcation/usecase'
import { locationDto, organizationDto } from './catalog'

// Respuestas v1 del test VARK: camelCase y los mismos nombres de campo en el resultado propio y en los listados.

export const varkStyle = z.enum(VARK_STYLES)

export const varkResultDto = z.object({
  id: z.string(),
  userId: z.string(),
  visualScore: z.number().int(),
  auditoryScore: z.number().int(),
  readingScore: z.number().int(),
  dominantStyle: varkStyle,
})

export const toVarkResultDto = (r: VarkResult): z.infer<typeof varkResultDto> => ({
  id: r.id, userId: r.userId, visualScore: r.visual, auditoryScore: r.auditory, readingScore: r.reading, dominantStyle: r.dominantStyle,
})

export const varkSubmissionDto = z.object({
  created: z.boolean().describe('true si es el primer resultado del jugador; false si reemplazó el anterior'),
  visualScore: z.number().int(),
  auditoryScore: z.number().int(),
  readingScore: z.number().int(),
  dominantStyle: varkStyle,
})

export const toVarkSubmissionDto = (s: VarkSubmission): z.infer<typeof varkSubmissionDto> => ({
  created: s.created, visualScore: s.scores.visual, auditoryScore: s.scores.auditory, readingScore: s.scores.reading,
  dominantStyle: s.scores.dominantStyle,
})

const profileDto = z.object({
  id: z.string(), userId: z.string(), organizationId: z.string().nullable(), locationId: z.string().nullable(),
  organization: organizationDto.nullable().optional(), location: locationDto.nullable().optional(),
})

/** Un resultado de los listados del panel, con el jugador y su perfil. */
export const varkListingDto = varkResultDto.extend({
  user: z.object({
    id: z.string(), cedula: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable(), role: z.string(),
    profile: profileDto.nullable().optional(),
  }),
})
