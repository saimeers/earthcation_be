import type { Request, Response } from 'express'
import type {
  ActivateVersionUseCase, CompleteUploadUseCase, CreateVersionUseCase, GetDeployStatusUseCase, GetPreviewUrlUseCase,
  ListVersionsUseCase, ReceiveLocalZipUseCase, RemoveVersionUseCase,
} from '@earthcation/usecase'
import { currentUser } from '../../middlewares/auth'
import { createdVersionV1, deployStatusV1, listedVersionV1, previewV1, versionV1 } from '../../dto/v1/deployment'
import { bodyOf, pathParam } from '../../dto/v1/request'

export interface DeploymentUseCases {
  readonly status: GetDeployStatusUseCase
  readonly list: ListVersionsUseCase
  readonly create: CreateVersionUseCase
  readonly receiveZip: ReceiveLocalZipUseCase
  readonly complete: CompleteUploadUseCase
  readonly activate: ActivateVersionUseCase
  readonly remove: RemoveVersionUseCase
  readonly preview: GetPreviewUrlUseCase
}

const origin = (req: Request): string => `${req.protocol}://${req.get('host') ?? ''}`

// express.raw deja un Buffer si llegó un ZIP; si no, el cuerpo es otra cosa (o nada)
const zipOf = (req: Request): Uint8Array | null => {
  const body: unknown = req.body
  return Buffer.isBuffer(body) ? body : null
}

/** Traduce HTTP ↔ casos de uso del despliegue del juego (sin lógica: los errores los traduce el errorHandler). */
export class DeploymentController {
  constructor(private readonly useCases: DeploymentUseCases) {}

  status = async (_req: Request, res: Response): Promise<void> => {
    res.json(deployStatusV1(await this.useCases.status.execute()))
  }

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json((await this.useCases.list.execute()).map(listedVersionV1))
  }

  preview = async (req: Request, res: Response): Promise<void> => {
    res.json(previewV1(await this.useCases.preview.execute({ id: pathParam(req, 'id'), apiBase: origin(req) })))
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    const command = { label: body.label, notes: body.notes, sizeBytes: body.size_bytes, uploadedBy: currentUser(req).id }
    res.status(201).json(createdVersionV1(await this.useCases.create.execute(command)))
  }

  upload = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.receiveZip.execute({ id: pathParam(req, 'id'), zip: zipOf(req) })
    res.json({ message: 'ZIP recibido' })
  }

  complete = async (req: Request, res: Response): Promise<void> => {
    res.json(versionV1(await this.useCases.complete.execute(pathParam(req, 'id'))))
  }

  activate = async (req: Request, res: Response): Promise<void> => {
    const version = await this.useCases.activate.execute(pathParam(req, 'id'))
    res.json({ message: `Versión ${version.label} activa`, version: versionV1(version) })
  }

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.remove.execute(pathParam(req, 'id'))
    res.json({ message: 'Versión eliminada' })
  }
}
