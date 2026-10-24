import {
  ConflictError, NotFoundError, TooLargeError, UnauthorizedError, UnavailableError, ValidationError,
} from '../../shared/errors/DomainError'

/** La cabecera x-deploy-token llegó pero no coincide con DEPLOY_UPLOAD_TOKEN (o no hay token configurado). */
export class DeployTokenInvalidError extends UnauthorizedError {
  constructor() { super('DEPLOY_TOKEN_INVALID', 'No autorizado') }
}

export class VersionNotFoundError extends NotFoundError {
  constructor() { super('VERSION_NOT_FOUND', 'Versión no encontrada') }
}

export class VersionLabelInvalidError extends ValidationError {
  constructor() { super('VERSION_LABEL_INVALID', 'Versión inválida: usa letras, números, punto o guion (máx. 40)') }
}

export class VersionSizeRequiredError extends ValidationError {
  constructor() { super('VERSION_SIZE_REQUIRED', 'size_bytes es requerido') }
}

export class ZipTooLargeError extends TooLargeError {
  constructor(maxMb: number) { super('ZIP_TOO_LARGE', `El ZIP supera el máximo de ${maxMb} MB`) }
}

export class ZipBodyRequiredError extends ValidationError {
  constructor() { super('ZIP_BODY_REQUIRED', 'Envía el ZIP en el cuerpo (application/zip)') }
}

export class ZipMissingError extends ValidationError {
  constructor() { super('ZIP_MISSING', 'El ZIP no llegó al almacenamiento. Vuelve a subirlo.') }
}

export class UploadPresignedOnlyError extends ValidationError {
  constructor() { super('UPLOAD_PRESIGNED_ONLY', 'Con S3 el ZIP se sube a la URL prefirmada') }
}

export class VersionNotUploadingError extends ConflictError {
  constructor() { super('VERSION_NOT_UPLOADING', 'La versión ya no espera el ZIP') }
}

export class VersionBusyError extends ConflictError {
  constructor() { super('VERSION_BUSY', 'La versión ya se está publicando o está lista') }
}

export class VersionStateChangedError extends ConflictError {
  constructor() { super('VERSION_STATE_CHANGED', 'La versión cambió de estado; recarga la lista') }
}

/** Mismo código para activar y para previsualizar; cambia el mensaje. */
export class VersionNotReadyError extends ConflictError {
  constructor(message: string) { super('VERSION_NOT_READY', message) }
}

export class VersionActiveError extends ConflictError {
  constructor() { super('VERSION_ACTIVE', 'No se puede borrar la versión activa: activa otra primero') }
}

export class VersionPublishingError extends ConflictError {
  constructor() { super('VERSION_PUBLISHING', 'Espera a que termine de publicarse') }
}

export class SigningSecretMissingError extends UnavailableError {
  constructor() { super('SIGNING_SECRET_MISSING', 'Falta PLAY_SIGNING_SECRET en la API') }
}

/** El archivo subido no se pudo abrir como ZIP (motivo que queda en la versión fallida). */
export class InvalidZipError extends ValidationError {
  constructor() { super('ZIP_INVALID', 'El archivo no es un ZIP válido') }
}

/** El ZIP no es un build WebGL de Unity; el mensaje es el motivo que ve el panel. */
export class InvalidBuildError extends ValidationError {
  constructor(reason: string) { super('BUILD_INVALID', reason) }
}
