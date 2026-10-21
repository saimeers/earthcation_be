import { VarkAnswers, type VarkRepository, type VarkScores } from '@earthcation/model'
import type { SubmitVarkTestCommand } from './SubmitVarkTestCommand'

/** Puntaje guardado y si fue el primer envío (`created`) o reemplazó al anterior. */
export interface VarkSubmission {
  readonly scores: VarkScores
  readonly created: boolean
}

/** Califica el test y guarda el resultado del jugador (reenviarlo reemplaza el anterior). */
export class SubmitVarkTestUseCase {
  constructor(private readonly results: VarkRepository) {}

  async execute(cmd: SubmitVarkTestCommand): Promise<VarkSubmission> {
    const scores = VarkAnswers.from(cmd.answers).score()
    const { created } = await this.results.save(cmd.userId, scores)
    return { scores, created }
  }
}
