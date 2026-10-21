import type { Request, Response } from 'express'
import type {
  AnonymizeUserUseCase, ChangeUserStatusUseCase, CreateUserUseCase, GetUserSessionsUseCase, GetUserUseCase, ListUsersUseCase, UpdateUserUseCase,
} from '@earthcation/usecase'
import { currentUser } from '../../middlewares/auth'
import { creationLegacy, userFieldsLegacy } from '../../dto/legacy/identity'
import { bodyOf, pathParam, queryText } from '../../dto/legacy/request'

export interface UserUseCases {
  readonly list: ListUsersUseCase
  readonly get: GetUserUseCase
  readonly sessions: GetUserSessionsUseCase
  readonly create: CreateUserUseCase
  readonly update: UpdateUserUseCase
  readonly changeStatus: ChangeUserStatusUseCase
  /** Solo la API v1 la expone (derecho de supresión). */
  readonly anonymize: AnonymizeUserUseCase
}

/** Traduce HTTP ↔ casos de uso de usuarios. Las lecturas de legacy salen como filas crudas, igual que antes. */
export class UserController {
  constructor(private readonly useCases: UserUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = { role: queryText(req, 'role'), organizationId: queryText(req, 'organization_id'), locationId: queryText(req, 'location_id') }
    res.json(await this.useCases.list.execute(query))
  }

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.get.execute(pathParam(req, 'id')))
  }

  sessions = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.sessions.execute(pathParam(req, 'id')))
  }

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(creationLegacy(await this.useCases.create.execute({ fields: userFieldsLegacy(bodyOf(req)) })))
  }

  update = async (req: Request, res: Response): Promise<void> => {
    const cmd = { id: pathParam(req, 'id'), editor: currentUser(req), fields: userFieldsLegacy(bodyOf(req)) }
    res.json({ message: 'Usuario actualizado', user: await this.useCases.update.execute(cmd) })
  }

  disable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: false })
    res.json({ message: 'Usuario deshabilitado correctamente' })
  }

  enable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: true })
    res.json({ message: 'Usuario habilitado correctamente' })
  }
}
