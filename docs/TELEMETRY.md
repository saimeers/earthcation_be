# Telemetría del juego — trazabilidad del jugador

Guía para quien construya vistas en el panel web (`earthcation_fe`) con los datos que deja el
juego. Todo sale de tres tablas:

| Tabla | Qué es | Granularidad |
|---|---|---|
| `level_attempts` | Cada vez que un jugador entra o reintenta un nivel | 1 fila por intento |
| `game_events` | Qué hizo o qué le pasó dentro del intento | N filas por intento |
| `user_risk_progress` | Resultado por riesgo (mitigó / falló) | 1 fila por resultado; ahora con `attempt_id` |

Autenticación: JWT en `Authorization: Bearer <token>`. Las rutas de lectura exigen rol `admin` o
`instructor`.

## Endpoints de lectura

### `GET /api/telemetry/overview[?session_id=]`
Vista global (o de una sesión de capacitación).

```jsonc
{
  "levels": [            // intentos por nivel y resultado
    { "level_key": "level2", "outcome": "failed", "count": 12, "players": 7, "avg_duration_ms": 84210 }
  ],
  "fail_reasons": [      // de qué mueren y en qué etapa, ordenado por frecuencia
    { "level_key": "level2", "fail_reason": "intoxicacion_metano", "fail_risk_id": "CR-06", "fail_stage": "Methane1", "count": 5 }
  ],
  "retries": [           // cuántos intentos necesitan
    { "level_key": "level1", "avg_attempt_number": 1.8, "max_attempt_number": 6 }
  ],
  "gas_brands": [        // detector elegido y cuántos lo calibraron
    { "gas_brand": "Dräger X-am 5600", "attempts": 20, "calibrated": 14 }
  ],
  "risks": [             // ordenado por tasa de fallo
    { "risk_id": "CR-06", "risk_name": "Gases y Vapores (Atmósferas Tóxicas)", "category": "Químico",
      "results": 40, "mitigated": 28, "failed": 12, "fail_rate": 30.0, "mistakes_total": 15, "avg_reaction_ms": 9120 }
  ],
  "event_counts": [ { "event_type": "device_opened", "count": 133 } ]
}
```

### `GET /api/telemetry/users/:userId/summary[?session_id=]`
Trazabilidad de un jugador. Con `session_id` se limita a lo que hizo dentro de esa sesión.

```jsonc
{
  "user_id": "…",
  "total_attempts": 5,
  "levels": [
    { "level_key": "level2", "attempts": 3, "completed": 1, "failed": 2, "abandoned": 0,
      "retries": 2, "attempts_until_first_completion": 3,
      "best_time_ms": 151200, "total_time_ms": 402000,
      "fail_reasons": { "intoxicacion_metano": 1, "derrumbe": 1 },
      "fail_stages": { "Methane1": 1, "Support2": 1 } }
  ],
  "risks": [             // ordenado por fallos: el primero es donde más se equivoca
    { "risk_id": "CR-04", "risk_name": "Geomecánico (Derrumbes)", "category": "…", "level_name": "…",
      "results": 6, "mitigated": 4, "failed": 2, "mitigation_rate": 66.7,
      "mistakes_total": 2, "avg_reaction_ms": 9859, "last_result": "mitigated", "last_recorded_at": "…" }
  ],
  "weakest_risk": { … },             // el riesgo con más fallos, o null
  "event_counts": { "fatigue_injury": 4, "device_opened": 9 }
}
```

### `GET /api/telemetry/users/:userId/attempts[?level_key=&session_id=]`
Lista de intentos del jugador, del más reciente al más antiguo. Cada elemento es una fila de
`level_attempts` (ver campos abajo) con `level` anidado.

### `GET /api/telemetry/attempts/:id`
Un intento completo, para reconstruir la partida como línea de tiempo.

```jsonc
{
  "attempt": { …campos de level_attempts…, "level": {…}, "user": { "id", "username", "cedula" },
               "riskResults": [ { "risk_id", "is_mitigated", "mistakes_count", "reaction_time_ms", "risk": {…} } ] },
  "events": [ …game_events ordenados por t_ms… ]
}
```

### Vistas por sesión (rol `admin`)

- `GET /api/sessions/:id/progress/admin` — todos los participantes con su telemetría resumida
  (`telemetry.levels`, `telemetry.journeys`), riesgos por participante y de la sesión, bandas de
  desempeño y causas de fallo. Lo usa la página de detalle de sesión del panel.
- `GET /api/sessions/:id/participants/:userId/analysis` — análisis de un participante en la sesión
  con promedios del grupo para comparar.
- `GET /api/sessions/:id/export.xlsx` — exportación a Excel de los resultados de la sesión.

Los endpoints anteriores de progreso y analítica (`/api/progress/*`, `/api/analytics/*`) siguen
igual.

## Campos de `level_attempts`

| Campo | Significado |
|---|---|
| `level_key` | `level1`, `level2` |
| `level_id` | FK a `levels` (resuelto por nombre "Nivel N…") |
| `attempt_number` | 1 = primera vez; mayor = reintentos de ese jugador en ese nivel |
| `outcome` | `in_progress`, `completed`, `failed`, `abandoned` (salió o reinició sin terminar) |
| `fail_reason` | `derrumbe`, `intoxicacion_metano`, `mordedura_ofidio`, `infeccion_por_hongos`, `lesion_por_fatiga`, `desconocido` |
| `fail_risk_id` | Riesgo que causó la muerte (`CR-04`, `CR-06`, `CR-07`, `CR-02`) |
| `fail_stage` | Etapa del nivel donde falló (ver "Etapas") |
| `duration_ms`, `final_health` | Duración y vida al terminar |
| `vark_style` | Estilo de aprendizaje del jugador en ese intento |
| `gas_brand`, `device_calibrated` | Detector elegido y si lo calibró (Nivel 2) |
| `summary` | Contadores del intento (JSON, ver abajo) |
| `started_at`, `ended_at`, `session_id`, `user_id` | — |

### Contadores en `summary`

`coal_collected`, `fatigue_injuries`, `risks_mitigated`, `risks_failed`, `lantern_warnings`, y en Nivel 2 además
`device_opened`, `calibrations_valid`, `calibrations_invalid`, `exits_uncalibrated`,
`damage_methane` (vida perdida por metano), `damage_biohazard` (vida perdida por mordedura o esporas).

## Campos de `game_events`

`event_type`, `risk_id` (puede ser null), `stage`, `t_ms` (milisegundos desde el inicio del
intento), `pos_x` (posición horizontal del jugador), `health`, `fatigue`, `payload` (JSON propio
del evento), `created_at`.

### Catálogo de eventos

| `event_type` | Cuándo | `payload` |
|---|---|---|
| `level_start` | Entra al nivel | `vark_style`, `gas_brand` |
| `stage_enter` | Cambia de etapa (el nombre va en `stage`) | — |
| `risk_info_shown` | Se abre el panel informativo de un riesgo | `panel`, `style` |
| `risk_info_closed` | Lo cierra | `panel`, `style`, `read_ms`, `audio_finished` |
| `risk_mitigated` / `risk_failed` | Resultado real de un riesgo (mismo dato que `user_risk_progress`) | `mistakes`, `reaction_ms` |
| `wall_broken`, `stone_broken` | Termina cada fase de picar | `wall`, `fatigue_injuries`, `duration_ms` |
| `coal_collected` | Recoge el carbón | `wall` |
| `wagon_sent`, `wagon_arrived` | Palanca del vagón | `to_surface` |
| `fatigue_injury` | Picó hasta agotar la fatiga (CR-02) | — |
| `support_prompt` | Aparece el botón de sostenimiento (CR-04) | `timeout_s` |
| `support_placed` | Lo coloca a tiempo | `reaction_ms` |
| `collapse` | Se acabó el tiempo: derrumbe | — |
| `player_death` | Muere | `cause`, `calibrated` |
| `level_complete` / `level_failed` / `level_abandoned` | Cierre del intento | `fail_reason` |
| `lantern_warning` | Se alejó del inicio con la linterna apagada (CR-08); se le advierte una vez | — |
| `lantern_on` | Enciende la linterna por primera vez (CR-08 mitigado si no hubo advertencia) | `after_warning`, `elapsed_ms` |

Solo Nivel 2:

| `event_type` | Cuándo | `payload` |
|---|---|---|
| `device_opened` / `device_closed` | Abre o cierra el detector | `methane_active`, `reading_lel` |
| `device_powered_on` | Lo enciende | `in_safe_zone` |
| `device_calibrated` | Confirma calibración | `valid` (false = calibró fuera de la zona segura) |
| `safe_zone_enter` / `safe_zone_exit` | Cruza la zona segura | `calibrated` |
| `methane_start` | Empieza a subir el metano (CR-06) | `calibrated` |
| `gas_alarm` | El detector empieza a avisar | `reading_lel`, `real_lel`, `calibrated`, `since_methane_ms` |
| `methane_evacuated` | Llega a la zona segura | `reaction_ms`, `calibrated`, `real_lel`, `alarm_had_sounded` |
| `biohazard_warned` | Nota el riesgo biológico en la vía (CR-07) | `kind` (`ofidio`, `hongo`) |
| `biohazard_contact` | Le pasa por encima (mordedura / esporas) | `kind`, `since_warning_ms` |
| `biohazard_reported` / `biohazard_treated` | Vuelve a la zona segura sin / con contacto | `kind`, `reaction_ms` |

### Etapas (`stage`, `fail_stage`)

- Nivel 1: `PickingMuro1`, `WagonToSurface1`, `PlacingSupport1`, `WagonReturning1`,
  `PickingMuro2`, `WagonToSurface2`, `PlacingSupport2`, `WagonReturning2`, `PickingMuro3`,
  `WagonToSurface3`.
- Nivel 2: `PickingMuro1`, `WagonToSurface1`, `Support1`, `Methane1`, `Hazard1`,
  `WagonReturning1`, `PickingMuro2`, `WagonToSurface2`, `Support2`, `Methane2`, `Hazard2`,
  `WagonReturning2`, `PickingMuro3`, `WagonToSurface3`.

## Ideas de vistas que estos datos permiten

- Línea de tiempo de un intento (eventos por `t_ms`, con la vida como curva).
- Embudo por etapa: en cuál abandonan o mueren más (`fail_stage`).
- Reintentos hasta completar cada nivel, por jugador y promedio del grupo.
- Riesgo más débil por jugador y por organización (`weakest_risk`, `risks`).
- Tiempo de reacción ante metano con y sin equipo calibrado (`methane_evacuated`).
- Cuánto leen los paneles de riesgo según estilo VARK (`risk_info_closed.read_ms`).
- Uso del detector: cuántas veces lo abren y si calibran antes de avanzar.

## Notas

- `user_risk_progress` ya no recibe un "mitigado" automático al cerrar el panel informativo: solo
  guarda resultados reales. Los registros anteriores a este cambio sí incluyen esos automáticos.
- Un intento que quedó `in_progress` (el jugador cerró el juego) se marca `abandoned` cuando ese
  jugador vuelve a entrar al mismo nivel.

## Endpoints de escritura (los usa el juego)

- `POST /api/telemetry/attempts` `{ level_key, session_id?, vark_style?, gas_brand? }` → `{ attempt }`
- `POST /api/telemetry/events` `{ attempt_id, events: [ { event_type, risk_id?, stage?, t_ms?, pos_x?, health?, fatigue?, payload? } ] }`
- `PATCH /api/telemetry/attempts/:id` `{ outcome, fail_reason?, fail_risk_id?, fail_stage?, duration_ms?, final_health?, device_calibrated?, gas_brand?, summary? }`
- `POST /api/progress/save` acepta además `attempt_id` y `detail` (JSON).
