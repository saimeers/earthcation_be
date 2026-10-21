export interface JoinRoomCommand {
  readonly userId: string
  readonly body: Readonly<Record<string, unknown>>
}
