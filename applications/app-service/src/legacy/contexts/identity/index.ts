import { recordLogin } from '../observability'
import { mailer, passwords, resetTokens, spreadsheets, tokens } from './adapters'
import { makeIdentity } from './application'
import { authRouterV1, bulkImportRouterV1, usersRouterV1 } from './httpV1'
import { accountRepository, importDirectory, userReadModel } from './sequelizeRepositories'

// Raíz de composición de identidad: cuentas, usuarios e importación masiva
export const identity = makeIdentity({
  accounts: accountRepository, users: userReadModel, directory: importDirectory,
  passwords, resetTokens, tokens, mailer, spreadsheets,
  now: () => Date.now(),
  logError: (message) => { console.error(message) },
})

// El login deja la ubicación del inicio de sesión en observabilidad, sin bloquear la respuesta
export const authRoutesV1 = authRouterV1(identity, recordLogin)
export const userRoutesV1 = usersRouterV1(identity)
export const bulkImportRoutesV1 = bulkImportRouterV1(identity)
