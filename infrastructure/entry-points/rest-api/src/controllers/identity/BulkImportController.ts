import type { Request, Response } from 'express'
import type { ConfirmBulkImportUseCase, PreviewBulkImportUseCase } from '@earthcation/usecase'
import { importRowsLegacy, previewLegacy, reportLegacy } from '../../dto/legacy/identity'
import { bodyOf } from '../../dto/legacy/request'

export interface BulkImportUseCases {
  readonly preview: PreviewBulkImportUseCase
  readonly confirm: ConfirmBulkImportUseCase
}

/** Traduce HTTP ↔ importación masiva desde la planilla ANM (vista previa y confirmación). */
export class BulkImportController {
  constructor(private readonly useCases: BulkImportUseCases) {}

  parse = async (req: Request, res: Response): Promise<void> => {
    const rows = await this.useCases.preview.execute({ file: req.file?.buffer })
    res.json({ rows: rows.map(previewLegacy) })
  }

  confirm = async (req: Request, res: Response): Promise<void> => {
    const report = await this.useCases.confirm.execute({ rows: importRowsLegacy(bodyOf(req).rows) })
    res.status(201).json(reportLegacy(report))
  }
}
