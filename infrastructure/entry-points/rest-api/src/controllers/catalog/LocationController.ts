import type { Request, Response } from 'express'
import type {
  ChangeLocationStatusUseCase, CreateLocationUseCase, GetLocationUseCase, ListLocationsUseCase, SearchLocationsUseCase,
  UpdateLocationUseCase,
} from '@earthcation/usecase'
import { locationV1 } from '../../dto/v1/catalog'
import { bodyOf, pathParam, queryText } from '../../dto/v1/request'

export interface LocationUseCases {
  readonly list: ListLocationsUseCase
  readonly search: SearchLocationsUseCase
  readonly get: GetLocationUseCase
  readonly create: CreateLocationUseCase
  readonly update: UpdateLocationUseCase
  readonly changeStatus: ChangeLocationStatusUseCase
}

const placeOf = (body: Readonly<Record<string, unknown>>) =>
  ({ municipality: body.municipality, department: body.department, country: body.country })

/** Traduce HTTP ↔ casos de uso de localidades. */
export class LocationController {
  constructor(private readonly useCases: LocationUseCases) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json((await this.useCases.list.execute()).map(locationV1))
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const query = { municipality: queryText(req, 'municipality'), department: queryText(req, 'department'), country: queryText(req, 'country') }
    res.json((await this.useCases.search.execute(query)).map(locationV1))
  }

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(locationV1(await this.useCases.get.execute(pathParam(req, 'id'))))
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const location = await this.useCases.create.execute(placeOf(bodyOf(req)))
    res.status(201).json({ message: 'Localidad creada', data: locationV1(location) })
  }

  update = async (req: Request, res: Response): Promise<void> => {
    const location = await this.useCases.update.execute({ id: pathParam(req, 'id'), changes: placeOf(bodyOf(req)) })
    res.json({ message: 'Localidad actualizada', data: locationV1(location) })
  }

  disable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: false })
    res.json({ message: 'Localidad deshabilitada correctamente' })
  }

  enable = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.changeStatus.execute({ id: pathParam(req, 'id'), active: true })
    res.json({ message: 'Localidad habilitada correctamente' })
  }
}
