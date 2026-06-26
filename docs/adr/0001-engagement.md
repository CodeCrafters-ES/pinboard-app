# ADR-001 — Modelo de engagement: viewed / engaged / clicked

**Estado:** Aceptado
**Fecha:** 2026-06-26
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-01-01 #47](https://github.com/CodeCrafters-ES/pinboard-app/issues/47)

---

## Contexto

Los posts de Nun Ibiza enlazan a contenido externo (noticias, artículos, comunicados). El usuario consume ese contenido fuera de la app, por lo que el tiempo de lectura in-app no es un indicador útil de interés real. Se necesita un modelo de métricas que:

- Capture el nivel de interés del usuario en el post dentro de la app.
- Identifique cuándo el usuario llega al contenido final (clic en enlace externo).
- Soporte el dashboard de engagement para managers y admins.
- Funcione de forma robusta en escenarios offline con reintentos.

---

## Decisión

### Cinco métricas de engagement

| Métrica | Tabla / campo | Descripción |
|---|---|---|
| `viewed` | `engagement_sessions` (sesión creada) | El usuario abrió la card del post |
| `link_clicked` | `engagement_sessions.link_clicked = true` | El usuario activó el enlace externo |
| `reaction_type` | `post_reactions` | Reacción activa: like / dislike / love |
| `rating` | `post_ratings` | Valoración por estrellas (1–5) |
| `comment` | `post_comments` | Comentario de texto libre |

La métrica de éxito principal es `link_clicked`: representa el consumo real del contenido. Las métricas `reaction_type`, `rating` y `comment` indican implicación aunque el usuario no llegue al contenido externo. `viewed` es la métrica mínima de alcance.

### Estados de negocio de la sesión

```
[sin sesión]
      │  abrir card
      ▼
   viewed
      │  reaccionar / valorar / comentar
      ▼
  engaged ──── clic enlace externo ───▶ clicked
      │                                    ▲
      └──────────── clic enlace externo ───┘
```

| Estado | Condición |
|---|---|
| `viewed` | Sesión creada; sin interacción activa |
| `engaged` | Al menos una reacción, valoración o comentario |
| `clicked` | `link_clicked = true`, independientemente del estado anterior |

> Estos estados de negocio son **derivados** y no se persisten como campo. El campo `status` de la tabla (`active` / `idle` / `closed`) describe el ciclo de vida operacional de la sesión (ventana de actividad abierta) y es ortogonal a los estados de negocio anteriores.

### Sesión y deduplicación

Se define una **sesión única por par (user\_id, post\_id)** almacenada en la tabla `engagement_sessions`. La deduplicación opera en dos niveles:

**A nivel de base de datos:** restricción `UNIQUE(user_id, post_id)`. La Edge Function `track-engagement` usa `upsert` sobre esa clave; múltiples envíos del mismo evento actualizan la sesión existente.

**A nivel de cliente (offline):** el cliente genera un `session_id` (UUID v4) al abrir la card y lo encola en `AsyncStorage` junto a los eventos pendientes. Al recuperar conectividad, los reintentos incluyen el mismo `session_id`, permitiendo a la Edge Function descartar envíos duplicados por idempotencia.

### Arquitectura de escritura

- **Solo** la Edge Function `track-engagement` (con `service_role`) escribe en `engagement_sessions`. Los clientes autenticados no tienen políticas `INSERT`/`UPDATE`/`DELETE` sobre esa tabla.
- `post_reactions`, `post_ratings` y `post_comments` se escriben directamente desde el cliente con sus políticas RLS definidas en [ADR-002](0002-rbac.md).

---

## Consecuencias

**Positivas:**

- Un único `SELECT` por (usuario, post) proporciona el estado completo de engagement para el dashboard.
- La restricción `UNIQUE(user_id, post_id)` hace el modelo naturalmente idempotente.
- Separar el ciclo de vida operacional (`status`) del estado de negocio (derivado) mantiene el schema simple.

**Negativas / limitaciones conocidas:**

- El estado `engaged` no se almacena explícitamente; debe derivarse en queries del dashboard con `EXISTS` sobre `post_reactions`, `post_ratings` y `post_comments`.
- Si un usuario reacciona sin haber abierto la card, no existirá sesión en `engagement_sessions`; el dashboard mostrará interacción sin `viewed`.

---

## Opciones evaluadas

### Opción B — Log de eventos append-only

Cada interacción genera una fila nueva en una tabla de eventos.

**Pros:** historial completo, auditable, fácil de extender.

**Contras:** agregaciones costosas en queries de dashboard (GROUP BY sobre millones de filas); mayor almacenamiento; deduplicación más compleja (requiere `DISTINCT ON` o ventanas). Descartado por complejidad operacional desproporcionada al tamaño del equipo.

### Opción C — Tiempo de lectura in-app como métrica principal

Registrar cuántos segundos pasa el usuario en la pantalla del post.

**Pros:** métrica familiar en análisis de contenido.

**Contras:** el contenido es externo; el tiempo in-app mide el tiempo leyendo el título y la imagen, no el artículo. No predice consumo real. Descartado por irrelevancia semántica.

---

## Referencias

- `supabase/migrations/20260618500000_create_engagement_sessions_table.sql` — tabla `engagement_sessions`
- `supabase/migrations/20260618600000_rls_engagement_sessions.sql` — políticas RLS
- `supabase/migrations/20260618100000_create_posts_tables.sql` — tablas `post_reactions`, `post_ratings`, `post_comments`
- [ADR-002](0002-rbac.md) — RBAC y jerarquía de roles (políticas RLS de interacciones)
