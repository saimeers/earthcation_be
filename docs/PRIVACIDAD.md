# Inventario de datos personales

Qué datos personales guarda la plataforma, para qué, quién los ve, cuánto tiempo y con qué protecciones. Sirve de
insumo para la política de tratamiento de datos (Ley 1581 de 2012 y Decreto 1377 de 2013). Describe lo que hace hoy el
código; lo que depende de una decisión institucional está marcado como pendiente.

## Datos que se guardan

| Dato | Dónde | Para qué | Quién lo ve |
|---|---|---|---|
| Cédula, nombres, apellidos, edad, correo | `users` | Identificar al jugador, entrar al juego y al panel, y avisar al personal por correo | Admin completo; instructor solo de los jugadores de sus salas; desarrollador enmascarado; el titular, lo suyo |
| Organización y localidad | `user_profiles` | Agrupar resultados por empresa y municipio | Admin, instructor (de sus salas) y desarrollador |
| Contraseña del personal | `users.password_hash` | Acceso al panel | Nadie: solo existe su hash (bcrypt) |
| Estilo de aprendizaje (VARK) | `vark_results` | Adaptar las instrucciones del juego | Igual que los datos del jugador |
| Intentos, eventos y resultados por riesgo | `level_attempts`, `game_events`, `user_risk_progress` | Medir el desempeño y reforzar la capacitación | Igual que los datos del jugador |
| Inscripción a salas | `session_users` | Saber quién participó en cada sesión | Admin, instructor dueño y desarrollador (sin nombres) |
| Ubicación aproximada del inicio de sesión del personal (país, región, ciudad, dispositivo, sistema, navegador) | `login_events` | Soporte y analítica de uso | Admin y desarrollador |
| Visitas al juego: huella del visitante (HMAC de IP y navegador), país, región, ciudad, coordenadas aproximadas, navegador | `game_visits` | Medir cuántos jugadores abren el juego, sin identificarlos | Admin y desarrollador |
| Registro de auditoría: quién hizo qué, sobre qué, cuándo, huella de la IP y navegador | `audit_logs` | Trazabilidad de las acciones del personal | Admin y desarrollador |

La IP nunca se guarda: en las visitas y en la auditoría solo queda un HMAC con una sal del servicio, que no se puede
revertir. El registro de auditoría no guarda datos personales: solo nombres de campos y valores no personales (el rol, el
estado). Las cédulas de los intentos de inicio de sesión fallidos se guardan como huella, no en claro.

## Quién puede leer qué

| Rol | Alcance |
|---|---|
| Jugador | Sus propios datos y su progreso |
| Instructor | Los jugadores de sus salas y los que juegan en el Juego libre de su localidad; sus propias salas |
| Administrador | Todo, y es el único que crea, edita, deshabilita, importa y anonimiza usuarios |
| Desarrollador (soporte) | Sin datos personales: cédula, usuario, correo, nombres (iniciales) y edad salen enmascarados; no exporta el Excel de sesión |

Se aplica por igual a la API legacy y a la v1 (variable `SCOPED_READS`, activa por defecto).

## Medidas de seguridad

- Contraseñas con bcrypt; tokens JWT (HS256) de 24 horas para el personal y 7 días para el jugador, que además dejan de
  valer en cuanto la cuenta se deshabilita.
- Límites de peticiones por usuario y por IP, y límites de intentos de inicio de sesión por cédula, por IP y de unirse a
  una sala (el código de sala tiene 3 dígitos).
- CORS cerrado en producción, cabeceras de seguridad (`helmet`), conexión a la base de datos por TLS.
- Registro de auditoría de solo inserción: un disparador de la base de datos rechaza editar, borrar o vaciar la tabla.
- Los ZIP de las versiones del juego se validan (cantidad de archivos, tamaño descomprimido y rutas) antes de publicarse.

## Derechos del titular

| Derecho | Cómo se atiende |
|---|---|
| Conocer y acceder a sus datos | El administrador consulta la cuenta (`GET /api/v1/users/:id`) |
| Actualizar y rectificar | El titular edita nombre, apellido, edad y correo propios; el administrador edita cualquier campo |
| Suprimir (supresión de datos) | `POST /api/v1/users/:id/anonymization` (solo admin, auditado): quita nombre, cédula, usuario, correo y edad, deshabilita la cuenta y la deja sin contraseña utilizable. El progreso queda sin identidad. No se deshace |
| Revocar la autorización | Se atiende con la misma anonimización |

La anonimización se hace a pedido del titular; no hay borrado automático por tiempo.

## Conservación

No hay borrado automático. Los registros no se eliminan: se deshabilitan para conservar el histórico de progreso (que es el
objeto del proyecto), y se anonimizan cuando el titular lo pide. El registro de auditoría no se borra.

## Pendiente de decisión institucional

- **Responsable del tratamiento y canal de atención** de solicitudes de los titulares (nombre, correo, plazo de respuesta).
- **Autorización del titular:** la plataforma no recoge hoy el consentimiento dentro del producto. Debe definirse quién lo
  recoge (por ejemplo, la empresa o la institución que convoca la capacitación) y dejar constancia.
- **Tratamiento de datos de menores de edad**, si la capacitación llegara a incluir a menores.
- **Transferencias a terceros fuera del país:** el correo (Resend), el alojamiento (Railway, Vercel, Cloudflare, AWS) y la
  base de datos pueden estar fuera de Colombia; debe documentarse en la política.
- **Plazo de conservación** de los datos de quien no pide su supresión.
