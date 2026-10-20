/** Cola de publicaciones en segundo plano (de a una, en el orden en que se completaron). */
export interface PublishQueue {
  enqueue(versionId: string): void
}

/** Bitácora de las publicaciones (pasan en segundo plano: no hay respuesta HTTP que las cuente). */
export interface DeploymentLog {
  info(message: string): void
  error(message: string): void
}
