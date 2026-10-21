export interface CreateRoomCommand {
  readonly instructorId: string
  readonly body: Readonly<Record<string, unknown>>
}
