import type { Request, Response } from 'express'
import type { LoginUseCase, RequestPasswordResetUseCase, ResetPasswordUseCase } from '@earthcation/usecase'
import { loginOrigin, sessionLegacy } from '../../dto/legacy/identity'
import { bodyOf } from '../../dto/legacy/request'

export interface AuthUseCases {
  readonly login: LoginUseCase
  readonly requestPasswordReset: RequestPasswordResetUseCase
  readonly resetPassword: ResetPasswordUseCase
}

const RESET_SENT = 'Si el correo está registrado recibirás un enlace en breve.'

/** Traduce HTTP ↔ casos de uso de inicio de sesión y contraseña. El registro público no existe: el alta es del panel. */
export class AuthController {
  constructor(private readonly useCases: AuthUseCases) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    res.json(sessionLegacy(await this.useCases.login.execute({ cedula: body.cedula, password: body.password, origin: loginOrigin(req) })))
  }

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.requestPasswordReset.execute({ email: bodyOf(req).email })
    res.json({ message: RESET_SENT })
  }

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const body = bodyOf(req)
    await this.useCases.resetPassword.execute({ token: body.token, password: body.new_password })
    res.json({ message: 'Contraseña actualizada correctamente' })
  }
}
