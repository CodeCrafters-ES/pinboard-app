# Engagement (cliente)

Captura las señales de engagement de un post —clic en el enlace externo (métrica principal) y,
opcionalmente, tiempo de foco y scroll máximo— y las entrega _offline-first_ a la Edge Function
`track-engagement`. Base de la EPIC-N04 (participación real).

Ver `docs/adr/0001-engagement.md` para los estados de negocio (`viewed` / `engaged` / `clicked`) y
`docs/adr/0006-engagement-behavioral-signals.md` para las señales opcionales aditivas
(`focused_seconds` / `max_scroll_pct`). La derivación de `status`, el carácter append-only de
`link_clicked` y el UPSERT viven en el **servidor** (F-N04-02); el cliente solo emite eventos.

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

El clic en el enlace externo se registra con `trackLinkClick(postId, sessionId)` (usa el `sessionId`
del hook) **antes** de `Linking.openURL`; también se encola, así que sobrevive sin conexión y viaja
en el mismo lote que el resto de eventos (ver F-N03-04 / #160).

### 2. Flush global (una sola vez, en el root)

`app/_layout.tsx` monta el drenaje de la cola al recuperar red:

```tsx
useEffect(() => startEngagementSync(), []);
```

## Contrato de payload

Cada evento encolado tiene esta forma (`link_clicked` y las señales opcionales solo aparecen cuando
aplican). La cola envía un **array** de eventos por request:

```ts
{ session_id, post_id, link_clicked?, focused_seconds_delta?, max_scroll_pct?, client_ts }
```

Enviado a `POST /functions/v1/track-engagement` con `Authorization: Bearer <jwt>`. El servidor
UPSERTea por `(user_id, post_id)` (`user_id = auth.uid()` del JWT), así que reenviar (reintentos,
flush offline) no duplica filas. `link_clicked` es append-only; `focused_seconds` se acumula y
`max_scroll_pct` toma el máximo (ver ADR-0006 y `supabase/functions/track-engagement/README.md`).
