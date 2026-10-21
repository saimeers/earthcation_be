import type { Request, Response } from 'express'
import type {
  ChangeOrganizationStatusUseCase, CreateOrganizationUseCase, GetOrganizationUseCase, ListOrganizationsUseCase,
  ListOrganizationTypesUseCase, SearchOrganizationsUseCase, UpdateOrganizationUseCase,
} from '@earthcation/usecase'
import { organizationDetailLegacy, organizationLegacy } from '../../dto/legacy/catalog'
import { bodyOf, pathParam, queryText } from '../../dto/legacy/request'

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
    res.json((await this.useCases.list.execute()).map(organizationLegacy))
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const query = { name: queryText(req, 'name'), type: queryText(req, 'type') }
    res.json((await this.useCases.search.execute(query)).map(organizationLegacy))
  }

  types = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.types.execute())
  }

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(organizationDetailLegacy(await this.useCases.get.execute(pathParam(req, 'id'))))
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    const organization = await this.useCases.create.execute({ name: body.name, type: body.type })
    res.status(201).json({ message: 'Organización creada', data: organizationLegacy(organization) })
  }

  update = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    const organization = await this.useCases.update.execute({ id: pathParam(req, 'id'), changes: { name: body.name, type: body.type } })
    res.json({ message: 'Organización actualizada', data: organizationLegacy(organization) })
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
