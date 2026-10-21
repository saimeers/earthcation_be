import { z } from 'zod'
import type { VarkListingRow } from '@earthcation/model'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { ok, page } from '../http/reply'
import { route, userOf, type Route } from '../http/route'
import type { VarkUseCases } from '../../controllers/vark/VarkController'
import { camelize } from '../dto/camelize'
import { toVarkResultDto, toVarkSubmissionDto, varkListingDto, varkResultDto, varkStyle, varkSubmissionDto } from '../dto/vark'

// El jugador envía y consulta su resultado; los listados del panel son para el personal (solo lectura)
const STAFF = ['instructor', 'admin', 'developer'] as const

const SORT = ['dominantStyle', 'visualScore', 'auditoryScore', 'readingScore'] as const

// Cada pregunta (q1 a q4) se responde A, B o C; las preguntas desconocidas no suman
const answersBody = z.object({
  answers: z.record(z.string().regex(/^q[1-4]$/), z.enum(['A', 'B', 'C'])).describe('Respuestas del test: { "q1": "A", "q2": "C", ... }'),
})

const resultsQuery = listQuery.extend({
  style: varkStyle.optional().describe('Estilo dominante'),
  department: z.string().optional().describe('Departamento del jugador (coincidencia parcial)'),
  municipality: z.string().optional().describe('Municipio del jugador (coincidencia parcial)'),
})

type ResultsQuery = z.infer<typeof resultsQuery>
type Row = Record<string, unknown>

// Con localidad se consulta por localidad (y el estilo, si viene, filtra después); con solo estilo, por estilo
const rowsOf = async (uc: VarkUseCases, q: ResultsQuery): Promise<readonly VarkListingRow[]> => {
  if (q.department ?? q.municipality) {
    const rows = await uc.listByPlace.execute({ department: q.department, municipality: q.municipality })
    return q.style ? rows.filter((r) => r.dominant_style === q.style) : rows
  }
  return q.style ? uc.listByStyle.execute(q.style) : uc.list.execute()
}

/** Rutas de v1 del test VARK. */
export const varkRoutesV1 = (uc: VarkUseCases): Route[] => [
  route({
    method: 'put', path: '/vark-results/me', tag: 'VARK', summary: 'Guarda el resultado del test del jugador', roles: [],
    body: answersBody,
    response: { status: 200, description: 'Puntajes y estilo dominante; reemplaza el resultado anterior si lo había', schema: varkSubmissionDto },
    handler: async ({ body, user }) => ok(toVarkSubmissionDto(await uc.submit.execute({ userId: userOf({ user }).id, answers: body.answers }))),
  }),
  route({
    method: 'get', path: '/vark-results/me', tag: 'VARK', summary: 'Consulta el resultado del test del jugador', roles: [],
    response: { status: 200, description: 'El resultado del jugador', schema: varkResultDto },
    handler: async ({ user }) => ok(toVarkResultDto(await uc.mine.execute(userOf({ user }).id))),
  }),
  route({
    method: 'get', path: '/vark-results', tag: 'VARK', summary: 'Lista los resultados con su jugador', roles: STAFF,
    query: resultsQuery,
    response: { status: 200, description: 'Una página de resultados, por estilo dominante', schema: z.array(varkListingDto), paginated: true },
    handler: async ({ query }) => {
      const rows = (await rowsOf(uc, query)).map(camelize) as Row[]
      const { items, meta } = paginate(query.sort ? sortBy(rows, query.sort, SORT) : rows, query)
      return page(items, meta)
    },
  }),
]
