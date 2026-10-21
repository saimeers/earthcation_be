import { VarkResultNotFoundError, type VarkRepository, type VarkResult } from '@earthcation/model'

/** El resultado VARK del usuario que pregunta. */
export class GetMyVarkResultUseCase {
  constructor(private readonly results: VarkRepository) {}

  async execute(userId: string): Promise<VarkResult> {
    const result = await this.results.findByUser(userId)
    if (!result) throw new VarkResultNotFoundError()
    return result
  }
}
