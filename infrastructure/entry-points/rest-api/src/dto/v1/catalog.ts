import type { Location, Organization, OrganizationDetail } from '@earthcation/model'

// Respuestas v1 del catálogo: la misma forma snake_case de siempre (el panel actual las consume)

export const organizationV1 = (o: Organization) =>
  ({ id: o.id, name: o.name, type: o.type, is_active: o.isActive, created_at: o.createdAt })

export const organizationDetailV1 = (d: OrganizationDetail) => ({
  ...organizationV1(d.organization),
  members: d.members.map((m) => ({ id: m.id, user_id: m.userId, organization_id: m.organizationId, location_id: m.locationId })),
})

export const locationV1 = (l: Location) =>
  ({ id: l.id, municipality: l.municipality, department: l.department, country: l.country, is_active: l.isActive })
