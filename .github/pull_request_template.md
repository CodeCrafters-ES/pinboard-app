## Qué cambia

<!-- Una o dos frases. Qué hace este PR y por qué. -->

Closes #

## Decisiones de arquitectura

- [ ] Este PR **no** cambia ninguna decisión registrada en `docs/adr/`.
- [ ] Este PR **sí** la cambia. ADR que lo respalda: `docs/adr/____`
      (el ADR debe existir y estar aprobado **antes** de la implementación,
      no escribirse después para justificarla)

Si supersede a un ADR anterior, marca el antiguo como `Superseded por ADR-XXXX`
y actualiza el índice en `docs/adr/README.md`.

## Consumidores afectados

<!-- Si tocas una tabla, una Edge Function o un tipo compartido: qué más deja de
     compilar o de funcionar. Enumera las issues que quedan abiertas por ello. -->

## Comprobaciones

- [ ] Migración aplicada en local y revisada.
- [ ] Cada policy RLS nueva tiene al menos un test positivo y uno negativo en `supabase/tests/`.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.
- [ ] Los tipos de Supabase están regenerados si cambió el esquema.
