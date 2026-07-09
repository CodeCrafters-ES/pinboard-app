# Engagement (cliente)

Captura las señales reales de lectura de un post (tiempo de foco, scroll, `AppState`) y las entrega
_offline-first_ a la Edge Function `track-engagement`. Base de la EPIC-N04 (participación real).

Ver `docs/adr/0001-engagement.md` para los estados (`viewed` / `skimmed` / `read`) y umbrales. La
transición de estado y el UPSERT viven en el **servidor** (F-N04-02); el cliente solo emite deltas.

## Piezas

| Módulo | Rol |
|---|---|
| `hooks/usePostEngagement.ts` | Hook de pantalla: `sessionId` estable (`expo-crypto`), foco real (`AppState` + `useIsFocused`), heartbeat 5s, `maxScrollPct` monótono. Emite eventos `init`/`tick` por `onEvent`. |
| `lib/engagement/sink.ts` | `createEngagementSink()`: adapta el evento del hook (segundos acumulados) al payload del servidor (`focused_seconds_delta`). Uno por apertura de pantalla. |
| `lib/engagement/queue.ts` | Cola FIFO persistente en `AsyncStorage` (`@engagement/queue`). Máx 500 eventos (descarta los más antiguos), batch de 50, backoff exponencial (1→30s), 401 → refresca sesión Supabase y reintenta. |
| `lib/engagement/sync.ts` | `startEngagementSync()`: vacía la cola al recuperar conectividad (NetInfo). Se monta una vez en el root. |

## Uso

### 1. En la pantalla de detalle del post

```tsx
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { usePostEngagement } from '@/hooks/usePostEngagement';
import { createEngagementSink } from '@/lib/engagement';

function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Un sink por apertura de pantalla (el closure recuerda el acumulado previo).
  const onEvent = useMemo(() => createEngagementSink(), [id]);
  const { onScroll } = usePostEngagement(id ?? '', { onEvent });

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
      {/* ...contenido del post... */}
    </ScrollView>
  );
}
```

El evento `init` (crea la fila `viewed`) se emite al montar; cada `tick` (5s, solo con foco real y
app en foreground) encola un heartbeat. Al desmontar, timers y listeners se cancelan.

### 2. Flush global (una sola vez, en el root)

`app/_layout.tsx` monta el drenaje de la cola al recuperar red:

```tsx
useEffect(() => startEngagementSync(), []);
```

## Contrato de payload

```ts
{ session_id, post_id, focused_seconds_delta, max_scroll_pct, client_ts }
```

Enviado a `POST /functions/v1/track-engagement` con `Authorization: Bearer <jwt>`. El servidor UPSERTea
por `session_id`, así que reenviar (reintentos, flush offline) es idempotente.

## Pendiente

- `wordCount`: hoy se envía 0. Se rellenará cuando exista `posts.word_count` (EPIC-N02); el servidor
  usa N = max(15s, palabras/4) para decidir `read`.
