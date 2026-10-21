import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/DomainError'

// Mismos mensajes que v1: el panel y el juego los muestran tal cual

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() { super('INVALID_CREDENTIALS', 'Credenciales inválidas') }
}

export class UserInactiveError extends UnauthorizedError {
  constructor() { super('USER_INACTIVE', 'Usuario inactivo') }
}

export class CedulaRequiredError extends ValidationError {
  constructor() { super('CEDULA_REQUIRED', 'La cédula es requerida') }
}

export class EmailRequiredError extends ValidationError {
  constructor() { super('EMAIL_REQUIRED', 'El email es requerido') }
}

export class ResetFieldsRequiredError extends ValidationError {
  constructor() { super('RESET_FIELDS_REQUIRED', 'Token y nueva contraseña son requeridos') }
}

export class InvalidResetTokenError extends ValidationError {
  constructor() { super('RESET_TOKEN_INVALID', 'Token inválido o expirado') }
}

export class UserNotFoundError extends NotFoundError {
  constructor() { super('USER_NOT_FOUND', 'Usuario no encontrado') }
}

export class UserEditForbiddenError extends ForbiddenError {
  constructor() { super('USER_EDIT_FORBIDDEN', 'No tienes permiso para editar este usuario') }
}

export class UsernameTakenError extends ConflictError {
  constructor() { super('USERNAME_TAKEN', 'El nombre de usuario ya está en uso') }
}

export class CedulaTakenError extends ConflictError {
  constructor() { super('CEDULA_TAKEN', 'La cédula ya está registrada') }
}

export class UserIdentifierRequiredError extends ValidationError {
  constructor() { super('USER_IDENTIFIER_REQUIRED', 'La cédula o el nombre de usuario son requeridos') }
}

export class StaffEmailRequiredError extends ValidationError {
  constructor() { super('STAFF_EMAIL_REQUIRED', 'El correo es obligatorio para instructores y administradores') }
}

// Antes un rol o una edad que no existían llegaban a Postgres y respondían 500
export class InvalidRoleError extends ValidationError {
  constructor() { super('ROLE_INVALID', 'Rol inválido') }
}

export class InvalidAgeError extends ValidationError {
  constructor() { super('AGE_INVALID', 'La edad debe ser un número') }
}

export class ExcelRequiredError extends ValidationError {
  constructor() { super('EXCEL_REQUIRED', 'El archivo Excel es requerido') }
}

export class ImportRowsRequiredError extends ValidationError {
  constructor() { super('IMPORT_ROWS_REQUIRED', 'rows debe ser un arreglo no vacío') }
}

export class AnmHeaderMissingError extends ValidationError {
  constructor() { super('ANM_HEADER_MISSING', 'No se encontró la fila de encabezado esperada en el Excel (formato ANM)') }
}

export class AnmColumnsMissingError extends ValidationError {
  constructor(missing: readonly string[]) {
    super('ANM_COLUMNS_MISSING', `No se encontraron las columnas requeridas en el Excel: ${missing.join(', ')}`, { missing })
  }
}

export class UserAnonymizationSelfError extends ForbiddenError {
  constructor() { super('CANNOT_ANONYMIZE_SELF', 'No puedes anonimizar tu propia cuenta') }
}

export class UserAlreadyAnonymizedError extends ConflictError {
  constructor() { super('USER_ALREADY_ANONYMIZED', 'La cuenta ya está anonimizada') }
}
