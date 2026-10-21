import type { Location, Organization, OrganizationDetail } from '@earthcation/model'

// Respuestas legacy del catálogo: la misma forma snake_case de siempre (el panel actual las consume)

export const organizationLegacy = (o: Organization) =>
  ({ id: o.id, name: o.name, type: o.type, is_active: o.isActive, created_at: o.createdAt })

export const organizationDetailLegacy = (d: OrganizationDetail) => ({
  ...organizationLegacy(d.organization),
  members: d.members.map((m) => ({ id: m.id, user_id: m.userId, organization_id: m.organizationId, location_id: m.locationId })),
})

export const locationLegacy = (l: Location) =>
  ({ id: l.id, municipality: l.municipality, department: l.department, country: l.country, is_active: l.isActive })
