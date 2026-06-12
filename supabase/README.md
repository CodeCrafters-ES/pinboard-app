# supabase/

Aquí viven las migraciones SQL, seeds y Edge Functions del proyecto.

| Carpeta | Contenido |
|---|---|
| `migrations/` | Migraciones SQL versionadas. Se aplican con `npx supabase db push`. |
| `functions/` | Edge Functions en Deno runtime. Se despliegan con `npx supabase functions deploy`. |

> `supabase init` se ejecuta en el issue I-F-T00-06-03. No inicializar antes.
