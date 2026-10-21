import { z } from 'zod'
import type { Location, Organization, OrganizationDetail } from '@earthcation/model'

// Respuestas v1 del catálogo: camelCase y fechas ISO 8601 en UTC. Cada esquema documenta y tipa lo que se responde.

export const locationDto = z.object({
  id: z.string(),
  municipality: z.string().nullable(),
  department: z.string().nullable(),
  country: z.string().nullable(),
  isActive: z.boolean(),
})

export const toLocationDto = (l: Location): z.infer<typeof locationDto> =>
  ({ id: l.id, municipality: l.municipality, department: l.department, country: l.country, isActive: l.isActive })

export const organizationDto = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
})

export const toOrganizationDto = (o: Organization): z.infer<typeof organizationDto> =>
  ({ id: o.id, name: o.name, type: o.type, isActive: o.isActive, createdAt: o.createdAt.toISOString() })

export const organizationDetailDto = organizationDto.extend({
  members: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    organizationId: z.string().nullable(),
    locationId: z.string().nullable(),
  })),
})

export const toOrganizationDetailDto = (d: OrganizationDetail): z.infer<typeof organizationDetailDto> => ({
  ...toOrganizationDto(d.organization),
  members: d.members.map((m) => ({ id: m.id, userId: m.userId, organizationId: m.organizationId, locationId: m.locationId })),
})
