# ADR-005 — Almacenamiento de imágenes: buckets, paths, límites y pipeline cliente

**Estado:** Aceptado
**Fecha:** 2026-06-27
**Revisado:** 2026-07-07 — path convention alineada con la issue #148 (nombre de fichero determinista en lugar de `{uuid}`)
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-05-01 #58](https://github.com/CodeCrafters-ES/pinboard-app/issues/58) · [I-F-A00-05-02 #59](https://github.com/CodeCrafters-ES/pinboard-app/issues/59)

---

## Contexto

La app gestiona tres tipos de imágenes con necesidades distintas de visibilidad, propiedad y ciclo de vida:

- **Avatares:** imagen de perfil del usuario, acceso público (cualquier participante puede verla).
- **Imágenes de posts:** adjuntas a posts de noticias externas, visibles solo para usuarios autenticados.
- **Imágenes de eventos:** adjuntas a eventos del calendario, visibles solo para usuarios autenticados.

Cada tipo necesita un bucket independiente para poder aplicar políticas de acceso, límites de tamaño y RLS de Storage de forma granular. Antes de subir, el cliente debe normalizar las imágenes (redimensionar + convertir a WebP) para controlar el peso almacenado y el ancho de banda consumido.

---

## Decisión

### Buckets de Supabase Storage

| Bucket | Visibilidad | Propósito |
|---|---|---|
| `avatars` | **Público** | Fotos de perfil de los usuarios |
| `post-images` | **Privado** (RLS) | Imágenes adjuntas a posts |
| `event-images` | **Privado** (RLS) | Imágenes adjuntas a eventos |

Los buckets privados requieren que el cliente incluya el JWT de Supabase en la solicitud de descarga. Las URLs de objetos privados no son accesibles sin autenticación.

---

### Path convention

| Bucket | Path |
|---|---|
| `avatars` | `{auth.uid()}/avatar.webp` |
| `post-images` | `{author_id}/{post_id}/cover.webp` |
| `event-images` | `{author_id}/{event_id}/cover.webp` |

El primer segmento del path es siempre el `user_id` del propietario (`auth.uid()` para avatares, `author_id` para posts/eventos). Esto permite a las RLS policies de Storage validar la propiedad con `auth.uid()::text = (storage.foldername(name))[1]` sin necesidad de JOIN, según el contrato establecido en [ADR-002](0002-rbac.md).

El nombre de fichero es **determinista** (`avatar.webp`, `cover.webp`), no un UUID aleatorio. Consecuencias:

- **Avatares:** el path es conocido en cuanto se tiene el `uid`, así que la URL se construye antes del upload (optimista) sin generar identificadores.
- **Posts / eventos:** se crea primero la fila (los posts nacen `status = 'draft'`) para obtener el `post_id` / `event_id`, y luego se sube la portada a `{entity_id}/cover.webp`. La URL final es predecible a partir del id de la entidad.
- Reemplazar una imagen es un **UPDATE (upsert)** sobre el mismo objeto: no genera huérfanos ni requiere DELETE (ver policy `avatars_update_own` en `create_avatars_bucket.sql`).

Al ser una única imagen por entidad (`profiles.avatar_url`, `posts.cover_image_url`, `events.image_url`), el nombre fijo basta para identificarla; no se necesita UUID de desambiguación.

---

### Límites por bucket

| Bucket | Tamaño máximo | Formatos admitidos |
|---|---|---|
| `avatars` | 2 MB | `image/jpeg`, `image/png`, `image/webp` |
| `post-images` | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `event-images` | 5 MB | `image/jpeg`, `image/png`, `image/webp` |

Formatos **no admitidos** en ningún bucket: `image/svg+xml`, `image/heic`, `image/heif`, `image/gif`. Los límites se configuran en Supabase Storage (bucket settings) y se validan también en cliente antes del upload para evitar viajes de red innecesarios.

---

### Dimensiones máximas de procesado

| Tipo | Dimensión máxima (lado largo) |
|---|---|
| Avatar | 1 024 px |
| Post / Evento | 1 920 px |

Si la imagen original tiene ambos lados por debajo del máximo, no se redimensiona (solo se convierte a WebP).

---

### Pipeline de procesado en cliente

El cliente ejecuta el siguiente pipeline antes de cada upload usando `expo-image-manipulator`:

```text
[Selección]
     │  ImagePicker / CameraRoll
     ▼
[Validación previa]
     │  Comprobar tamaño de archivo (< límite del bucket)
     │  Comprobar MIME type (jpeg / png / webp)
     │  Si falla → mostrar error, no continuar
     ▼
[Redimensionado]
     │  Si lado largo > dimensión máxima del tipo:
     │    resize({ width: max }) — mantiene aspect ratio
     ▼
[Conversión a WebP]
     │  compress: 0.8  (calidad 80 %)
     │  format: SaveFormat.WEBP
     ▼
[Upload a Supabase Storage]
     │  bucket: <según tipo>
     │  path: <según path convention>
     │  contentType: 'image/webp'
     ▼
[Almacenamiento de la URL]
     │  Guardar la URL pública / firmada en la columna correspondiente
     │  (profiles.avatar_url, posts.image_url, events.image_url)
```

**Código de referencia:**

```ts
import * as ImageManipulator from 'expo-image-manipulator';

async function processImage(
  uri: string,
  maxDimension: number,
): Promise<ImageManipulator.ImageResult> {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDimension } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP },
  );
}
```

> `resize` con solo `width` hace que `expo-image-manipulator` calcule la altura manteniendo el aspect ratio. Si la imagen ya es más pequeña que `maxDimension`, el resize no aumenta su tamaño.

---

### RLS policies de Storage

Las policies de Storage para los tres buckets están definidas en [ADR-002 — sección «Matriz de permisos — Storage»](0002-rbac.md). ADR-002 es la fuente de verdad para todas las policies de `storage.objects`; este ADR no las redefine para evitar duplicación.

Resumen de la matriz (ver ADR-002 para las expresiones SQL canónicas):

| Bucket | Operación | Admin | Manager | Staff |
|---|---|---|---|---|
| `avatars` | SELECT | ✓ | ✓ | ✓ |
| `avatars` | INSERT / UPDATE | ✓ (any) | ✓ (own) | ✓ (own) |
| `avatars` | DELETE | — | — | — (reemplazar vía UPDATE) |
| `post-images` | SELECT | ✓ | ✓ | ✓ |
| `post-images` | INSERT / UPDATE / DELETE | ✓ (any) | ✓ (own) | — |
| `event-images` | SELECT | ✓ | ✓ | ✓ |
| `event-images` | INSERT / UPDATE / DELETE | ✓ (any) | ✓ (own) | — |

La propiedad se valida mediante `auth.uid()::text = (storage.foldername(name))[1]`, posible gracias a la path convention `{user_id}/...` definida en este ADR.

---

### Variantes de thumbnail estándar

Se definen tres variantes estándar aplicables a los tres tipos de imagen:

| Variante | Dimensiones | Uso típico |
|---|---|---|
| `thumb` | 100 × 100 px | Listas compactas, chips de usuario |
| `medium` | 400 × 400 px | Cards de post / evento, avatar en pantalla de perfil |
| `full` | 1 200 px (lado largo) | Vista de detalle a pantalla completa |

#### Mecanismo en MVP — generación en cliente

En el MVP el cliente genera las variantes necesarias en el momento del uso, aplicando el mismo pipeline de `expo-image-manipulator` con la dimensión objetivo:

```ts
// Ejemplo: generar variante thumb antes de mostrar en lista
const thumb = await ImageManipulator.manipulateAsync(
  localUri,
  [{ resize: { width: 100 } }],
  { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP },
);
```

Solo se sube al bucket la imagen en resolución `full` (procesada según el pipeline cliente de este ADR). Las variantes `thumb` y `medium` se generan localmente al renderizar y se almacenan en la caché de `expo-image`.

#### Post-MVP — Supabase Image Transformations

Cuando el volumen de imágenes justifique centralizar las transformaciones, se activará **Supabase Image Transformations**. Las variantes se solicitarán vía querystring sobre la URL del objeto:

```text
https://<project>.supabase.co/storage/v1/render/image/public/avatars/{auth.uid()}/avatar.webp
  ?width=100&height=100&resize=cover&quality=80
```

Este cambio no requiere modificar el pipeline de upload ni las políticas de Storage; solo cambia cómo el cliente construye las URLs de visualización.

---

### Limpieza automática de imágenes huérfanas

#### Criterio de huérfano

Un objeto de Storage se considera **huérfano** cuando han transcurrido más de **24 horas** desde su creación y no existe ninguna fila en la tabla de referencia que apunte a él:

| Bucket | Tabla de referencia | Columna |
|---|---|---|
| `avatars` | `public.profiles` | `avatar_url` |
| `post-images` | `public.posts` | `cover_image_url` |
| `event-images` | `public.events` | `image_url` |

La ventana de 24 h permite completar uploads lentos o en segundo plano sin borrar objetos legítimos aún no referenciados.

Con la path convention determinista, reemplazar una imagen es un UPDATE sobre el mismo objeto y **no** genera huérfanos. Las fuentes de huérfanos que este job cubre son: portadas subidas para un draft que nunca se referenció (fila sin `cover_image_url`) y objetos cuyas filas se borraron sin `on delete cascade` sobre Storage.

#### Mecanismo de ejecución

Un job de `pg_cron` dispara diariamente una Edge Function que realiza la limpieza:

```sql
-- Ejecutar cada día a las 03:00 UTC
select cron.schedule(
  'cleanup-orphan-images',
  '0 3 * * *',
  $$ select net.http_post(
    url    := current_setting('app.edge_function_url') || '/cleanup-orphan-images',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  ) $$
);
```

La Edge Function `cleanup-orphan-images` (Deno, `service_role`) ejecuta para cada bucket:

```text
1. Listar todos los objetos del bucket (Storage API)
2. Extraer las URLs referenciadas en la tabla de referencia
3. Calcular la diferencia: objetos sin referencia con created_at < now() - interval '24h'
4. Eliminar los objetos huérfanos vía Storage Admin API
5. Registrar el resultado (número de objetos eliminados) en logs de la función
```

La Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` para acceder a Storage sin restricciones de RLS.

---

## Consecuencias

**Positivas:**

- Un bucket por tipo de contenido permite aplicar límites y políticas independientes sin condicionales en las queries.
- La conversión a WebP en cliente reduce el peso almacenado y el ancho de banda en descarga sin coste de cómputo en servidor.
- El nombre de fichero determinista permite construir la URL final de forma predecible a partir del `uid` / id de la entidad, y reemplazar la imagen por UPDATE sin dejar huérfanos.
- La calidad del 80 % ofrece una relación peso/calidad adecuada para contenido de tamaño medio en móvil.

**Negativas / limitaciones conocidas:**

- La conversión a WebP en cliente consume CPU y puede tardar 200–500 ms en imágenes grandes en dispositivos de gama baja. Aceptable para v1.
- Las policies de `post-images` y `event-images` hacen un JOIN con `public.posts` / `public.events` en cada operación de Storage. En tablas grandes puede ser costoso; se mitigará con índices en `posts.author_id` y `events.author_id`.
- El modelo es de **una imagen (portada) por entidad**. Si en el futuro se necesitara una galería de varias imágenes por post/evento, habría que revisar esta convención (p. ej. `{author_id}/{post_id}/{uuid}.webp`) y su limpieza de huérfanos.

---

## Opciones evaluadas

### Opción B — Un bucket único con prefijo de tipo

Todas las imágenes en un bucket `media` con paths `avatars/...`, `posts/...`, `events/...`.

**Pros:** menor número de buckets a gestionar.

**Contras:** límites de tamaño y MIME types deben compartirse o añadir lógica condicional en las policies. Descartado por acoplamiento de configuraciones independientes.

### Opción C — Conversión a WebP en servidor (Edge Function)

El cliente sube la imagen original y una Edge Function la transforma.

**Pros:** menor carga en cliente, transformación centralizada.

**Contras:** doble almacenamiento (original + WebP), latencia adicional antes de que la imagen esté disponible, coste de cómputo en Deno. Descartado por complejidad innecesaria en v1.

---

## Referencias

- [ADR-002](0002-rbac.md) — fuente de verdad para las RLS policies de Storage (matriz de permisos, SQL canónico, helpers `is_admin()` / `is_manager()`)
- Consumidores: EPIC-N01 (avatares · `profiles.avatar_url`) · EPIC-N02 (post-images · `posts.image_url`) · EPIC-N05 (event-images · `events.image_url`)
- Edge Function de limpieza: `cleanup-orphan-images` (implementación en EPIC-S00)
