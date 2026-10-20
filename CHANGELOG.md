# Changelog

Versionado semántico. Cada versión sale de una rama `release/vX.Y.Z` fusionada en `main` con su tag.

## v1.2.0 — 2026-10-20

Refactor interno (fase 3): el contrato de la API v1 no cambia.

### Nuevo
- Migraciones versionadas con Umzug (`schema_migrations`); `sync({ alter: true })` ya no corre al arrancar.
- Backend en TypeScript con núcleo funcional (`Result`, errores de dominio), entorno validado con zod al arrancar
  y lint de estilo funcional.
- Contextos `catalog`, `vark`, `observability`, `identity`, `deployment`, `learning` y `sessions`: reglas como
  funciones puras, puertos y adaptadores (Sequelize, ExcelJS, S3/R2, Resend).
- Pruebas: contrato de v1 (forma de cada respuesta por rol), valores calculados de aprendizaje y sesiones, celdas
  del Excel de sesión y unitarias de los casos de uso; Postgres en CI.

### Cambios de comportamiento (a propósito)
- `PUT /api/organizations/:id` y `/api/locations/:id` solo aplican los campos editables.
- Un staff inactivo con contraseña errada recibe "Credenciales inválidas" (antes revelaba "Usuario inactivo").
- La importación masiva crea usuario y perfil en una transacción y consulta las cédulas de la vista previa en una
  sola consulta; la contraseña temporal se mezcla con aleatoriedad criptográfica.
- El progreso del instructor consulta los resultados de todos los participantes en una sola consulta.

### Despliegue
- Railway corre `npm run build` (tsc → `dist/`) y luego `npm start`; al arrancar aplica `0001_baseline`
  (probada contra una copia del esquema de producción: solo crea `schema_migrations`).

## v1.1.0 — 2026-10-19

- Seguridad (fase 0): un no admin ya no cambia su rol ni su cédula; límites de login por cédula e IP; los 5xx no
  exponen detalles; JWT con HS256 fijo y secreto obligatorio.
- Git flow, CI con escaneo de secretos, plantilla de PR y Dependabot.
