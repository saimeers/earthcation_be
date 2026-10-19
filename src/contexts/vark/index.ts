import { makeVark } from './application'
import { varkRouterV1 } from './httpV1'
import { varkRepository } from './sequelizeRepositories'

// Raíz de composición del test VARK
export const vark = makeVark(varkRepository)
export const varkRoutesV1 = varkRouterV1(vark)
