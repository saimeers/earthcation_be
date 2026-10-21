import { z } from 'zod'
import { SessionForbiddenError, type Requester, type SessionRow } from '@earthcation/model'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { created, file, ok, page } from '../http/reply'
import { route, userOf, type Route } from '../http/route'
import type { SessionUseCases } from '../../controllers/sessions/SessionController'
import { camelize } from '../dto/camelize'
import {
  exportFilename, joinedRoomDto, participantAnalysisDto, roomDetailDto, roomDto, roomProgressDto, XLSX_CONTENT_TYPE,
} from '../dto/sessions'

// Abrir, iniciar y terminar: instructor y admin; ver y exportar: también desarrollador (solo lectura); unirse y
// validar un código: cualquier cuenta con sesión (el juego)
const INSTRUCTORS = ['instructor', 'admin'] as const
const READERS = ['instructor', 'admin', 'developer'] as const

const SORT = ['createdAt', 'startedAt', 'name', 'status'] as const

const idParams = z.object({ id: z.uuid().describe('Id (UUID) de la sala') })
const participantParams = idParams.extend({ userId: z.uuid().describe('Id (UUID) del participante') })
const codeParams = z.object({ code: z.string().min(1).describe('Código de la sala, de 3 dígitos') })
const createBody = z.object({ name: z.string().min(1), locationId: z.uuid().describe('Localidad de la sala') })
const joinBody = z.object({ code: z.string().min(1).describe('Código de 3 dígitos (el que llega por QR o lo dicta el instructor)') })
const statusBody = z.object({ status: z.enum(['active', 'finished']).describe('active inicia la sala; finished la termina') })
const roomsQuery = listQuery.extend({
  scope: z.enum(['mine', 'all']).optional().describe('mine: las salas del usuario; all: todas (admin y desarrollador). Por defecto, all para admin y desarrollador y mine para instructor'),
  department: z.string().optional().describe('Filtra por localidad (coincidencia parcial)'),
  municipality: z.string().optional().describe('Filtra por localidad (coincidencia parcial)'),
})

type RoomsQuery = z.infer<typeof roomsQuery>
type Row = Record<string, unknown>

const requesterOf = (user: { readonly id: string, readonly role: string }): Requester => ({ id: user.id, role: user.role })

// admin y desarrollador ven todas por defecto; el instructor solo las suyas y no puede pedir `all`
const defaultScope = (role: string): 'mine' | 'all' => (role === 'instructor' ? 'mine' : 'all')

const hasPlace = (q: RoomsQuery): boolean => Boolean(q.department ?? q.municipality)

const wantsMine = (q: RoomsQuery, me: Requester): boolean => (q.scope ?? defaultScope(me.role)) === 'mine'

const roomsOf = async (uc: SessionUseCases, q: RoomsQuery, me: Requester): Promise<readonly SessionRow[]> => {
  if (hasPlace(q)) return uc.byLocation.execute({ department: q.department, municipality: q.municipality })
  if (wantsMine(q, me)) return uc.mine.execute(me.id)
  if (me.role === 'instructor') throw new SessionForbiddenError()
  return uc.all.execute()
}

/** Rutas de v1 de salas (sesiones de capacitación). */
export const sessionRoutesV1 = (uc: SessionUseCases): Route[] => [
  route({
    method: 'post', path: '/sessions', tag: 'Sesiones', summary: 'Abre una sala con un código de 3 dígitos', roles: INSTRUCTORS,
    body: createBody,
    response: { status: 201, description: 'La sala creada (cabecera Location)', schema: roomDto },
    handler: async ({ body, user }) => {
      const session = await uc.create.execute({ instructorId: userOf({ user }).id, body: { name: body.name, location_id: body.locationId } })
      return created(`/api/v1/sessions/${String(session.id)}`, camelize(session))
    },
  }),
  route({
    method: 'post', path: '/sessions/join', tag: 'Sesiones', summary: 'Un jugador se une a una sala con su código', roles: [],
    body: joinBody,
    response: { status: 200, description: 'La sala y si el jugador se inscribió ahora o ya estaba', schema: joinedRoomDto },
    handler: async ({ body, user }) => {
      const joined = await uc.join.execute({ userId: userOf({ user }).id, body: { code: body.code } })
      return ok({ session: camelize(joined.session), joined: joined.joined })
    },
  }),
  route({
    method: 'get', path: '/sessions/code/:code', tag: 'Sesiones', summary: 'Valida un código y muestra la sala (sin inscribir)', roles: [],
    params: codeParams,
    response: { status: 200, description: 'La sala viva con ese código', schema: roomDto },
    handler: async ({ params }) => ok(camelize(await uc.byCode.execute(params.code))),
  }),
  route({
    method: 'get', path: '/sessions', tag: 'Sesiones', summary: 'Lista las salas', roles: READERS,
    query: roomsQuery,
    response: { status: 200, description: 'Una página de salas', schema: z.array(roomDto), paginated: true },
    handler: async ({ query, user }) => {
      const rows = (await roomsOf(uc, query, requesterOf(userOf({ user })))).map(camelize) as Row[]
      const { items, meta } = paginate(query.sort ? sortBy(rows, query.sort, SORT) : rows, query)
      return page(items, meta)
    },
  }),
  route({
    method: 'put', path: '/sessions/:id/status', tag: 'Sesiones', summary: 'Inicia o termina una sala (solo su instructor)', roles: INSTRUCTORS,
    params: idParams, body: statusBody,
    response: { status: 200, description: 'La sala con su nuevo estado', schema: roomDto },
    handler: async ({ params, body, user }) => {
      const cmd = { id: params.id, instructorId: userOf({ user }).id }
      return ok(camelize(await (body.status === 'active' ? uc.start.execute(cmd) : uc.end.execute(cmd))))
    },
  }),
  route({
    method: 'get', path: '/sessions/:id/progress', tag: 'Sesiones', summary: 'Avance de los participantes (instructor dueño)', roles: READERS,
    params: idParams,
    response: { status: 200, description: 'Avance por participante', schema: roomProgressDto },
    handler: async ({ params, user }) => ok(camelize(await uc.progress.execute({ id: params.id, instructorId: userOf({ user }).id }))),
  }),
  route({
    method: 'get', path: '/sessions/:id', tag: 'Sesiones', summary: 'Detalle de la sala con el desempeño de cada participante', roles: READERS,
    params: idParams,
    response: { status: 200, description: 'Detalle completo. Admin y desarrollador ven todas; el instructor, las suyas y el Juego libre de su localidad', schema: roomDetailDto },
    handler: async ({ params, user }) => ok(camelize(await uc.detail.execute({ id: params.id, requester: requesterOf(userOf({ user })) }))),
  }),
  route({
    method: 'get', path: '/sessions/:id/participants/:userId/analysis', tag: 'Sesiones', summary: 'Análisis individual de un participante', roles: READERS,
    params: participantParams,
    response: { status: 200, description: 'Intentos, recorridos y tiempos de lectura del participante', schema: participantAnalysisDto },
    handler: async ({ params, user }) =>
      ok(camelize(await uc.analysis.execute({ id: params.id, userId: params.userId, requester: requesterOf(userOf({ user })) }))),
  }),
  route({
    method: 'get', path: '/sessions/:id/report.xlsx', tag: 'Sesiones', summary: 'Exporta el informe de la sala en Excel', roles: READERS,
    params: idParams,
    response: { status: 200, description: 'Archivo .xlsx con el detalle por participante', contentType: XLSX_CONTENT_TYPE },
    handler: async ({ params, user }) => {
      const report = await uc.exportReport.execute({ id: params.id, requester: requesterOf(userOf({ user })) })
      return file(XLSX_CONTENT_TYPE, exportFilename(report), report.buffer)
    },
  }),
]

