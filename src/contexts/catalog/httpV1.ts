import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, queryText, sendV1 } from '../../adapters/http/v1/respond'
import type { Locations, Organizations } from './application'
import type { Location, Organization, OrganizationDetail } from './domain'
import type { DomainError } from '../../shared/errors'
import type { Result } from '../../shared/result'

// Rutas v1 del catálogo (/api/organizations, /api/locations): mismas respuestas snake_case de siempre
const organizationV1 = (o: Organization) =>
  ({ id: o.id, name: o.name, type: o.type, is_active: o.isActive, created_at: o.createdAt })
const detailV1 = (o: OrganizationDetail) => ({
  ...organizationV1(o),
  members: o.members.map((m) => ({ id: m.id, user_id: m.userId, organization_id: m.organizationId, location_id: m.locationId })),
})
const locationV1 = (l: Location) =>
  ({ id: l.id, municipality: l.municipality, department: l.department, country: l.country, is_active: l.isActive })

const staff = [auth, requireRole('admin', 'instructor')]
const adminOnly = [auth, requireRole('admin')]
const id = (req: Request) => String(req.params.id)

type SetActive<T> = (id: string, on: boolean) => Promise<Result<T, DomainError>>
const toggle = <T>(setActive: SetActive<T>, on: boolean, message: string) =>
  async (req: Request, res: Response) => { sendV1(res, await setActive(id(req), on), () => res.json({ message })) }

const organizationReads = (router: Router, orgs: Organizations) => {
  router.get('/', async (_req, res) => { res.json((await orgs.list()).map(organizationV1)) })
  router.get('/search', async (req, res) => {
    res.json((await orgs.search({ name: queryText(req.query.name), type: queryText(req.query.type) })).map(organizationV1))
  })
  router.get('/types', async (_req, res) => { res.json(await orgs.types()) })
  router.get('/:id', async (req, res) => { sendV1(res, await orgs.get(id(req)), (o) => res.json(detailV1(o))) })
}

const organizationWrites = (router: Router, orgs: Organizations) => {
  router.post('/', ...staff, async (req: Request, res: Response) => {
    sendV1(res, await orgs.create(body(req.body)), (o) => res.status(201).json({ message: 'Organización creada', data: organizationV1(o) }))
  })
  router.put('/:id', ...staff, async (req: Request, res: Response) => {
    sendV1(res, await orgs.update(id(req), body(req.body)), (o) => res.json({ message: 'Organización actualizada', data: organizationV1(o) }))
  })
  router.patch('/:id/disable', ...adminOnly, toggle(orgs.setActive, false, 'Organización deshabilitada correctamente'))
  router.patch('/:id/enable', ...adminOnly, toggle(orgs.setActive, true, 'Organización habilitada correctamente'))
}

const locationReads = (router: Router, locs: Locations) => {
  router.get('/', async (_req, res) => { res.json((await locs.list()).map(locationV1)) })
  router.get('/search', async (req, res) => {
    const q = req.query
    const filter = { municipality: queryText(q.municipality), department: queryText(q.department), country: queryText(q.country) }
    res.json((await locs.search(filter)).map(locationV1))
  })
  router.get('/:id', async (req, res) => { sendV1(res, await locs.get(id(req)), (l) => res.json(locationV1(l))) })
}

const locationWrites = (router: Router, locs: Locations) => {
  router.post('/', ...staff, async (req: Request, res: Response) => {
    sendV1(res, await locs.create(body(req.body)), (l) => res.status(201).json({ message: 'Localidad creada', data: locationV1(l) }))
  })
  router.put('/:id', ...staff, async (req: Request, res: Response) => {
    sendV1(res, await locs.update(id(req), body(req.body)), (l) => res.json({ message: 'Localidad actualizada', data: locationV1(l) }))
  })
  router.patch('/:id/disable', ...adminOnly, toggle(locs.setActive, false, 'Localidad deshabilitada correctamente'))
  router.patch('/:id/enable', ...adminOnly, toggle(locs.setActive, true, 'Localidad habilitada correctamente'))
}

export const organizationsRouterV1 = (orgs: Organizations): Router => {
  const router = Router()
  organizationReads(router, orgs)
  organizationWrites(router, orgs)
  return router
}

export const locationsRouterV1 = (locs: Locations): Router => {
  const router = Router()
  locationReads(router, locs)
  locationWrites(router, locs)
  return router
}
