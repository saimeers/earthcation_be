import { config, enqueue, newId, readZip, sign, storage } from './adapters'
import { makeDeployment } from './application'
import { deployRouterV1 } from './httpV1'
import { playLocalRouter } from './playLocal'
import { versionRepository } from './sequelizeRepositories'

// Raíz de composición del despliegue del juego
export const deployment = makeDeployment({
  versions: versionRepository, storage, config, readZip, sign, enqueue, newId,
  now: () => Date.now(),
  log: { info: (m) => { console.log(m) }, error: (m) => { console.error(m) } },
})

export const deployRoutesV1 = deployRouterV1(deployment, config)
export const playLocalRoutes = playLocalRouter
export const isLocalPublishing = (): boolean => storage.published().driver === 'local'
export const recoverInterrupted = deployment.recoverInterrupted
