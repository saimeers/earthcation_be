# Changelog

Versionado semántico. Cada versión sale de una rama `release/vX.Y.Z` fusionada en `main` con su tag.

## v1.5.1 — 2026-10-23

### Corregido
- `DB_SSL_CA` ya se puede usar. Antes, ponerla habría tumbado la conexión con la base: el certificado de Railway dice
  `CN=localhost` y el host real es otro, así que Node rechazaba el certificado por el nombre. Ahora se verifica que el
  certificado venga de esa CA, sin comprobar el nombre del servidor. Sin CA todo sigue igual: cifrado y sin verificar.

## v1.5.0 — 2026-10-22

Auditoría, protección de datos personales y escrituras que no se duplican.

### Nuevo
- **Registro de auditoría** (`audit_logs`, solo inserción): quién hizo qué, sobre qué y desde dónde, con la IP guardada
  como huella. Se consulta y se exporta a CSV desde el panel.
- **Lecturas acotadas** (`SCOPED_READS`, activa por defecto): el instructor solo ve a los jugadores de sus salas y de
  su localidad, y el desarrollador deja de ver datos personales (cédula, correo, nombres y edad van enmascarados).
- **Anonimización a pedido del titular** (`POST /api/v1/users/:id/anonymization`, de admin y auditada): reemplaza los
  datos personales por valores neutros, conserva el progreso y deshabilita la cuenta. Ley 1581 de 2012.
- **Idempotency-Key** en las escrituras del juego (intentos, lotes de eventos y resultados por riesgo): si un reintento
  por red caída repite la petición, el servidor devuelve lo mismo sin volver a ejecutarla.
- **Editar la nota de una versión del juego** (`PATCH /api/v1/game-versions/:id`, auditado).
- Inventario de datos personales y su base legal, como documento del repositorio.

### Seguridad
- El token deja de valer en cuanto la cuenta se deshabilita o cambia de rol; las sesiones del personal duran 24 horas.
- Límite de intentos al unirse a una sala.
- CORS estricto en producción, sin comodín de respaldo.
- Protección contra ZIP maliciosos al subir una versión: tope de tamaño descomprimido, de número de entradas y rechazo
  de rutas que se salgan de la carpeta.

### Nota de operación
Esta versión agrega las migraciones `0002_audit_logs` y `0003_idempotency_keys`, que se aplican solas al arrancar.

## v1.4.0 — 2026-10-21

API v1 nueva en `/api/v1`, al lado de la API anterior (que pasa a llamarse legacy y no cambia).

### Nuevo
- Todos los contextos en v1: catálogo, VARK, identidad (autenticación y usuarios), sesiones (salas, detalle, análisis
  y Excel), aprendizaje (intentos, eventos, resultados por riesgo, niveles y analíticas), despliegue de versiones del
  juego, visitas y salud, e importación masiva.
- Sobre `{ data, meta }`, errores `{ error: { code, message, details } }`, JSON en camelCase, fechas ISO 8601, ids UUID
  validados, listados con `page`, `limit` y `sort`, y reglas de negocio con código 422.
- Cada ruta se define una vez y de ahí salen el router, la validación con zod y el documento OpenAPI 3.1. Swagger UI en
  `/api/v1/docs` y la especificación en `/api/v1/openapi.json`.
- Los límites de intentos de login y de restablecimiento también cubren `/api/v1/auth/*`.
- README del repositorio.

### Despliegue
- Variable nueva, opcional: `DOCS_ACCESS` (`public` por defecto; `staff` exige token de admin o desarrollador para ver
  la documentación). En producción está en `staff`.
- La API legacy no cambia: el panel y las versiones ya publicadas del juego siguen funcionando igual.

## v1.3.0 — 2026-10-20

Refactor interno (fase 3b): el contrato de la API v1 no cambia.

### Nuevo
- Arquitectura limpia multimódulo en monorepo pnpm + Turborepo: `domain/model` (entidades, value objects, errores
  de dominio y puertos), `domain/usecase` (un `XxxUseCase.execute(cmd)` por caso), `infrastructure/driven-adapters/*`
  (Sequelize, Redis, S3/R2, ZIP, firma HMAC, cola, seguridad, Resend, Excel, catálogo geográfico),
  `infrastructure/entry-points/rest-api` y `applications/app-service` (único desplegable).
- Los límites entre capas los hacen cumplir pnpm y dependency-cruiser en CI.
- La app Express (`createApp`), los límites de peticiones y el arranque salieron de `src/legacy` (que ya no existe);
  el catálogo de municipios se siembra con un caso de uso.

### Despliegue
- Railway detecta pnpm por `packageManager` y el lockfile: construye con `pnpm build` (turbo) y arranca con
  `pnpm start` (`node applications/app-service/dist/main.js`). Node 22 o superior.
- Variables nuevas, todas opcionales y con valor por defecto: `RATE_LIMIT_USER_MAX`, `RATE_LIMIT_IP_MAX`,
  `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_LOGIN_CEDULA_MAX`, `RATE_LIMIT_LOGIN_IP_FAIL_MAX`.

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
