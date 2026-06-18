# Architecture Decision Records (ADRs)

Decisiones técnicas significativas del proyecto Nun Ibiza PinBoard App, documentadas en formato [MADR](https://adr.github.io/madr/).

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-002](0002-rbac.md) | Control de acceso basado en roles (RBAC) + RLS | Aceptado |

## Convenciones

- Numeración: `NNNN-titulo-en-kebab-case.md` (empezamos en 0002; el 0001 se reserva para el setup inicial).
- Estados posibles: `Propuesto` · `Aceptado` · `Deprecado` · `Supersedido por ADR-XXXX`.
- Todo cambio de permisos o arquitectura de datos que afecte a RLS exige un ADR nuevo o la actualización del existente, junto con la migración SQL y los tests pgTAP en el mismo PR.
