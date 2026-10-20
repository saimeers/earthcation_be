import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, queryText, sendV1 } from '../../adapters/http/v1/respond'
import type { Submission, Vark } from './application'
import type { VarkProfile, VarkScores } from './domain'

// Rutas v1 del test VARK (/api/vark)
const scoresV1 = (s: VarkScores) =>
  ({ visual_score: s.visual, auditory_score: s.auditory, reading_score: s.reading, dominant_style: s.dominantStyle })
const profileV1 = (p: VarkProfile) => ({ id: p.id, user_id: p.userId, ...scoresV1(p) })
const submissionV1 = (s: Submission) =>
  ({ message: s.created ? 'Test VARK completado' : 'Test VARK actualizado', result: scoresV1(s.scores) })

const staff = [auth, requireRole('instructor', 'admin', 'developer')]
const userId = (req: Request) => (req as Request & { user: { id: string } }).user.id

const playerRoutes = (router: Router, vark: Vark) => {
  router.post('/submit', auth, async (req: Request, res: Response) => {
    sendV1(res, await vark.submit(userId(req), body(req.body).answers), (s) => res.json(submissionV1(s)))
  })
  router.get('/me', auth, async (req: Request, res: Response) => {
    sendV1(res, await vark.mine(userId(req)), (p) => res.json(profileV1(p)))
  })
}

const staffRoutes = (router: Router, vark: Vark) => {
  router.get('/all', ...staff, async (_req: Request, res: Response) => { res.json(await vark.listAll()) })
  router.get('/by-style/:style', ...staff, async (req: Request, res: Response) => {
    sendV1(res, await vark.listByStyle(String(req.params.style)), (rows) => res.json(rows))
  })
  router.get('/by-location', ...staff, async (req: Request, res: Response) => {
    res.json(await vark.listByPlace({ department: queryText(req.query.department), municipality: queryText(req.query.municipality) }))
  })
}

export const varkRouterV1 = (vark: Vark): Router => {
  const router = Router()
  playerRoutes(router, vark)
  staffRoutes(router, vark)
  return router
}
