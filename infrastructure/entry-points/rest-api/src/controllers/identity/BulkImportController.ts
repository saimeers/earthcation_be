import type { Request, Response } from 'express'
import type { ConfirmBulkImportUseCase, PreviewBulkImportUseCase } from '@earthcation/usecase'
import { importRowsV1, previewV1, reportV1 } from '../../dto/v1/identity'
import { bodyOf } from '../../dto/v1/request'

export interface BulkImportUseCases {
  readonly preview: PreviewBulkImportUseCase
  readonly confirm: ConfirmBulkImportUseCase
}

/** Traduce HTTP ↔ importación masiva desde la planilla ANM (vista previa y confirmación). */
export class BulkImportController {
  constructor(private readonly useCases: BulkImportUseCases) {}

  parse = async (req: Request, res: Response): Promise<void> => {
    const rows = await this.useCases.preview.execute({ file: req.file?.buffer })
    res.json({ rows: rows.map(previewV1) })
  }

  confirm = async (req: Request, res: Response): Promise<void> => {
    const report = await this.useCases.confirm.execute({ rows: importRowsV1(bodyOf(req).rows) })
    res.status(201).json(reportV1(report))
  }
}
