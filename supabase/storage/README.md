# supabase/storage/

Documentación de los buckets de Supabase Storage del MVP de Nun Ibiza. Las decisiones de diseño (límites, pipeline de procesado en cliente, thumbnails, limpieza de huérfanos) viven en [ADR-005](../../docs/adr/0005-image-storage.md); las RLS policies canónicas viven en [ADR-002 — sección "Matriz de permisos — Storage"](../../docs/adr/0002-rbac.md#matriz-de-permisos--storage). Este README no duplica ese contenido, solo lo consolida y referencia junto al estado real desplegado.

## Buckets

| Bucket | Público | Límite | MIME admitidos | Migración |
|---|---|---|---|---|
| `avatars` | Sí | 2 MB | `image/webp` (ver nota) | `20260619200000_create_avatars_bucket.sql` |
| `post-images` | No | 5 MB | `image/webp`, `image/png`, `image/jpeg` | `20260707010000_create_post_event_images_buckets.sql` |
| `event-images` | No | 5 MB | `image/webp`, `image/png`, `image/jpeg` | `20260707010000_create_post_event_images_buckets.sql` |

> **Nota:** ADR-005 documenta `avatars` con `image/webp`, `image/png` y `image/jpeg` admitidos. La migración ya desplegada solo permite `image/webp`, porque el cliente siempre convierte a WebP antes de subir (ver `hooks/useAvatarUpload.ts`). Se deja constancia aquí de la discrepancia; no se amplía el bucket en este issue por ser un cambio de comportamiento ajeno a su alcance.

## Convención de paths

El primer segmento de cada path es siempre el `id` del propietario (`author_id` / `auth.uid()`), lo que permite a las RLS policies validar propiedad con `auth.uid()::text = (storage.foldername(name))[1]` sin necesidad de JOIN.

| Bucket | Path |
|---|---|
| `avatars` | `{user_id}/avatar.webp` |
| `post-images` | `{author_id}/{post_id}/cover.webp` |
| `event-images` | `{author_id}/{event_id}/cover.webp` |

Al ser un nombre de fichero fijo (`avatar.webp` / `cover.webp`), sustituir la imagen es un simple `upsert` (UPDATE) sobre el mismo path — no se acumulan versiones huérfanas por cada reemplazo.

## Cómo se sirven

- **`avatars`** (público): la URL pública del objeto (`getPublicUrl`) es accesible sin autenticación — pensado para mostrarse en perfiles y listas sin pasar el JWT.
- **`post-images`** / **`event-images`** (privados): requieren sesión autenticada. El acceso se resuelve vía RLS sobre `storage.objects` (`SELECT` para cualquier `authenticated`) o, si se necesita compartir fuera de la app, vía signed URL (`createSignedUrl`).

Las RLS policies de escritura están implementadas en `20260708000000_rls_storage_post_event_images_n02_03_03.sql` (**#150**), siguiendo el SQL canónico de [ADR-002](../../docs/adr/0002-rbac.md#storage-policies--sql-canónico): `SELECT` para cualquier autenticado; `INSERT`/`UPDATE`/`DELETE` para admin (cualquier carpeta) o el propietario de la carpeta (manager sobre la suya); `staff` es solo lectura. Tests en `supabase/tests/rls/rls_storage_post_event_images.sql`.

## Cómo subir desde cliente

El patrón de referencia ya implementado es `hooks/useAvatarUpload.ts`: redimensiona y comprime a WebP con `expo-image-manipulator` antes de llamar a `supabase.storage.from(bucket).upload(path, ...)`. Para posts/eventos aplica el mismo pipeline (ver ADR-005: resize a máx. 1920 px, calidad 80–85 %, `contentType: 'image/webp'`).

El helper genérico compartido vive en `lib/media.ts` (**#149**, I-F-N02-03-02): `prepareImageForUpload({ uri }, target)` aplica el resize+compresión a WebP (posts/eventos máx. 1920 px calidad 85, avatares máx. 1024 px calidad 80, guard de >10 MB) y `uploadImage(bucket, path, prepared)` sube y devuelve la URL pública (`avatars`) o firmada (`post-images`/`event-images`). Es el punto de entrada recomendado para nuevas subidas. `hooks/useAvatarUpload.ts` conserva su propio pipeline equivalente por motivos históricos; migrarlo a `lib/media.ts` queda como refactor pendiente.
