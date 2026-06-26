# Architecture Decision Records (ADRs)

Decisiones técnicas significativas del proyecto Nun Ibiza PinBoard App, documentadas en formato [MADR](https://adr.github.io/madr/).

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](0001-engagement.md) | Modelo de engagement: viewed / engaged / clicked | Aceptado |
| [ADR-002](0002-rbac.md) | Control de acceso basado en roles (RBAC) + RLS | Aceptado |
| [ADR-003](0003-push-deep-linking.md) | Push notifications y deep-linking | Aceptado |

## Convenciones

- Numeración: `NNNN-titulo-en-kebab-case.md`.
- Estados posibles: `Propuesto` · `Aceptado` · `Deprecado` · `Supersedido por ADR-XXXX`.
- Todo cambio de permisos o arquitectura de datos que afecte a RLS exige un ADR nuevo o la actualización del existente, junto con la migración SQL y los tests pgTAP en el mismo PR.
