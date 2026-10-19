import type { DomainError } from '../../shared/errors'
import { andThen, fromNullable, map, ok, type Result } from '../../shared/result'
import { scoreVark, toAnswers, toStyle, varkNotFound, type VarkProfile, type VarkScores } from './domain'
import type { PlaceFilter, VarkListingRow, VarkRepository } from './ports'

type Outcome<T> = Promise<Result<T, DomainError>>
export type Submission = { readonly scores: VarkScores; readonly created: boolean }

const submit = (repo: VarkRepository) => (userId: string, answers: unknown): Outcome<Submission> =>
  andThen(map(toAnswers(answers), scoreVark), async (scores) => ok({ scores, ...(await repo.save(userId, scores)) }))

const listByStyle = (repo: VarkRepository) => (style: string): Outcome<readonly VarkListingRow[]> =>
  andThen(toStyle(style), async (s) => ok(await repo.listByStyle(s)))

export const makeVark = (repo: VarkRepository) => ({
  submit: submit(repo),
  mine: async (userId: string): Outcome<VarkProfile> => fromNullable(await repo.findByUser(userId), varkNotFound),
  listAll: () => repo.listAll(),
  listByStyle: listByStyle(repo),
  listByPlace: (filter: PlaceFilter) => repo.listByPlace(filter),
})

export type Vark = ReturnType<typeof makeVark>
