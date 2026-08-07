# Gamificación (cliente)

Lee el ranking de puntos por engagement real. Capa de acceso a la RPC `leaderboard`
(EPIC-N08, F-N08-02) y cálculo de las ventanas temporales en `Europe/Madrid`.

Ver `docs/adr/0007-gamification.md` para las reglas de puntos (clic 10 · comentario 5 ·
valoración 3 · reacción 2 · vista 1), la idempotencia por acción y la decisión de
persistencia. La adjudicación vive **entera en el servidor** (triggers sobre las cuatro
tablas fuente); el cliente solo lee agregados.

## Piezas

| Módulo | Rol |
|---|---|
| `lib/gamification/dateRange.ts` | Ventanas semanal y mensual en `Europe/Madrid`, half-open `[start, end)`. |
| `lib/gamification/leaderboard.ts` | Llamada a la RPC `leaderboard` + separación de la fila «Tu posición». |
| `hooks/useLeaderboard.ts` | Hook contenedor: carga, error, `refetch` y cambio de periodo. |
| `app/(app)/ranking.tsx` | Pantalla `RankingScreen` (tabs Semanal / Mensual). |

## La RPC `leaderboard`

```sql
leaderboard(period_start timestamptz, period_end timestamptz, limit_n int default 20)
  returns table (user_id uuid, full_name text, avatar_url text,
                 total_points bigint, rank int, is_self boolean)
```

`SECURITY DEFINER` con `search_path` fijado y `EXECUTE` concedido solo a `authenticated`.
Migración `supabase/migrations/20260809000000_leaderboard_fn_n08_02_01.sql`.

Contrato relevante para el cliente:

- **`user_points` no se consulta directamente.** Su policy solo deja ver la fila propia;
  el agregado de todos los usuarios sale únicamente por esta función.
- **Solo campos públicos del perfil** (`profiles_public`): `full_name` y `avatar_url`.
  Nunca emails.
- **Orden ya resuelto en SQL**: puntos descendentes, desempate por el primer
  `awarded_at` ascendente. No reordenar en el cliente.
- **Fila propia fuera del top.** Si el usuario no entra en el top N, la respuesta trae
  una fila extra al final con su puesto real e `is_self = true`. Usa
  `splitSelfBelowTop(entries, limit)` para separarla — el criterio es `rank > limit`,
  el mismo que aplica el SQL.
- **`limit_n` se acota en servidor** a `[1, 100]`.

## Ventanas temporales

Se calculan contra `Europe/Madrid` de forma explícita, **no** contra la hora del
dispositivo (a diferencia de `lib/eventRange.ts`): el AC de F-N08-02 fija esa zona, así
que un empleado que abra la app de viaje ve la misma semana que sus compañeros.

| Periodo | Rango |
|---|---|
| `weekly` | Lunes 00:00 (incl.) → lunes siguiente 00:00 (excl.) |
| `monthly` | Día 1 a las 00:00 (incl.) → día 1 del mes siguiente 00:00 (excl.) |

El rango es half-open a propósito: «domingo 23:59» como fin inclusivo perdería el último
segundo del domingo.

La conversión usa `Intl.DateTimeFormat` con `timeZone: 'Europe/Madrid'` y resuelve el
offset por iteración, así que el horario de verano sale correcto sin tabla de offsets ni
dependencias. Los límites caen siempre a medianoche, que en España nunca coincide con un
cambio de hora (ocurre a las 02:00/03:00).

## Uso

```tsx
import { useLeaderboard } from '@/hooks/useLeaderboard';

const { top, selfBelowTop, period, setPeriod, loading, error, refetch } = useLeaderboard();

// Cambiar de pestaña recarga con el rango correspondiente.
setPeriod('monthly');
```

Fuera de React:

```ts
import { getWeeklyLeaderboard, getMonthlyLeaderboard } from '@/lib/gamification';

const entries = await getWeeklyLeaderboard(20); // lanza si la RPC falla
```
