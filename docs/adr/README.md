# Architecture Decision Records (ADRs)

Decisiones técnicas significativas del proyecto Nun Ibiza PinBoard App, documentadas en formato [MADR](https://adr.github.io/madr/).

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](0001-engagement.md) | Modelo de engagement: viewed / engaged / clicked | Aceptado |
| [ADR-002](0002-rbac.md) | Control de acceso basado en roles (RBAC) + RLS | Aceptado |
| [ADR-003](0003-push-deep-linking.md) | Push notifications y deep-linking | Aceptado |
| [ADR-004](0004-chat-realtime.md) | Arquitectura del chat en tiempo real: persistente / efímero | Aceptado |
| [ADR-005](0005-image-storage.md) | Almacenamiento de imágenes: buckets, paths, límites y pipeline cliente | Aceptado |
| [ADR-006](0006-engagement-behavioral-signals.md) | Señales de comportamiento en engagement: `focused_seconds` y `max_scroll_pct` (extiende ADR-001) | Aceptado |

## Convenciones

- Numeración: `NNNN-titulo-en-kebab-case.md`.
- Estados posibles: `Propuesto` · `Aceptado` · `Deprecado` · `Supersedido por ADR-XXXX`.
- Todo cambio de permisos o arquitectura de datos que afecte a RLS exige un ADR nuevo o la actualización del existente, junto con la migración SQL y los tests pgTAP en el mismo PR.
