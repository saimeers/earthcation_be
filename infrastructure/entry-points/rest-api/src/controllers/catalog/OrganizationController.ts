import type { Request, Response } from 'express'
import type {
  ChangeOrganizationStatusUseCase, CreateOrganizationUseCase, GetOrganizationUseCase, ListOrganizationsUseCase,
  ListOrganizationTypesUseCase, SearchOrganizationsUseCase, UpdateOrganizationUseCase,
} from '@earthcation/usecase'
import { organizationDetailV1, organizationV1 } from '../../dto/v1/catalog'
import { bodyOf, pathParam, queryText } from '../../dto/v1/request'

export interface OrganizationUseCases {
  readonly list: ListOrganizationsUseCase
  readonly search: SearchOrganizationsUseCase
  readonly types: ListOrganizationTypesUseCase
  readonly get: GetOrganizationUseCase
  readonly create: CreateOrganizationUseCase
  readonly update: UpdateOrganizationUseCase
  readonly changeStatus: ChangeOrganizationStatusUseCase
}

/** Traduce HTTP ↔ casos de uso de organizaciones (sin lógica: los errores los traduce el errorHandler). */
export class OrganizationController {
  constructor(private readonly useCases: OrganizationUseCases) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json((await this.useCases.list.execute()).map(organizationV1))
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const query = { name: queryText(req, 'name'), type: queryText(req, 'type') }
    res.json((await this.useCases.search.execute(query)).map(organizationV1))
  }

  types = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.types.execute())
  }

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(organizationDetailV1(await this.useCases.get.execute(pathParam(req, 'id'))))
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    const organization = await this.useCases.create.execute({ name: body.name, type: body.type })
    res.status(201).json({ message: 'Organización creada', data: organizationV1(organization) })
  }

  update = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    const organization = await this.useCases.update.execute({ id: pathParam(req, 'id'), changes: { name: body.name, type: body.type } })
    res.json({ message: 'Organización actualizada', data: organizationV1(organization) })
  }

  disable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: false })
    res.json({ message: 'Organización deshabilitada correctamente' })
  }

  enable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: true })
    res.json({ message: 'Organización habilitada correctamente' })
  }
}
