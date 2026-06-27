# ADR-005 — Almacenamiento de imágenes: buckets, paths, límites y pipeline cliente

**Estado:** Aceptado
**Fecha:** 2026-06-27
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-05-01 #58](https://github.com/CodeCrafters-ES/pinboard-app/issues/58)

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

| Bucket | Path | Ejemplo |
|---|---|---|
| `avatars` | `{user_id}/{uuid}.webp` | `a1b2c3.../f0e1d2....webp` |
| `post-images` | `{post_id}/{uuid}.webp` | `p9q8r7.../c3b2a1....webp` |
| `event-images` | `{event_id}/{uuid}.webp` | `e5f6g7.../d4e5f6....webp` |

El primer segmento del path (`storage.foldername(name)[1]`) identifica al propietario del objeto y es la base de las RLS policies de Storage:

- `avatars`: el propietario es el usuario (`user_id = auth.uid()`).
- `post-images`: el propietario es el post; la policy verifica que `auth.uid()` sea el autor del post.
- `event-images`: el propietario es el evento; la policy verifica que `auth.uid()` sea el autor del evento.

El UUID del objeto (segundo segmento) se genera en cliente con `crypto.randomUUID()` antes del upload, lo que permite construir la URL final antes de que el upload complete (optimista).

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

```
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

Las policies de Storage operan sobre `storage.objects`. El helper `storage.foldername(name)[1]` extrae el primer segmento del path.

#### Bucket `avatars` (público para lectura)

```sql
-- SELECT: público — no requiere policy de lectura en bucket público
-- INSERT / UPDATE: solo el propio usuario puede subir o reemplazar su avatar
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

#### Bucket `post-images` (privado)

```sql
-- SELECT: usuarios autenticados pueden leer imágenes de posts existentes
create policy "post_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images');

-- INSERT / UPDATE / DELETE: solo el autor del post
create policy "post_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and exists (
      select 1 from public.posts
      where id::text = (storage.foldername(name))[1]
        and author_id = auth.uid()
    )
  );

create policy "post_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-images'
    and exists (
      select 1 from public.posts
      where id::text = (storage.foldername(name))[1]
        and author_id = auth.uid()
    )
  );
```

#### Bucket `event-images` (privado)

```sql
-- SELECT: usuarios autenticados pueden leer imágenes de eventos existentes
create policy "event_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-images');

-- INSERT / DELETE: solo el autor del evento
create policy "event_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.events
      where id::text = (storage.foldername(name))[1]
        and author_id = auth.uid()
    )
  );

create policy "event_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.events
      where id::text = (storage.foldername(name))[1]
        and author_id = auth.uid()
    )
  );
```

---

## Consecuencias

**Positivas:**

- Un bucket por tipo de contenido permite aplicar límites y políticas independientes sin condicionales en las queries.
- La conversión a WebP en cliente reduce el peso almacenado y el ancho de banda en descarga sin coste de cómputo en servidor.
- El UUID generado en cliente permite construir la URL final de forma optimista antes de que el upload complete.
- La calidad del 80 % ofrece una relación peso/calidad adecuada para contenido de tamaño medio en móvil.

**Negativas / limitaciones conocidas:**

- La conversión a WebP en cliente consume CPU y puede tardar 200–500 ms en imágenes grandes en dispositivos de gama baja. Aceptable para v1.
- Las policies de `post-images` y `event-images` hacen un JOIN con `public.posts` / `public.events` en cada operación de Storage. En tablas grandes puede ser costoso; se mitigará con índices en `posts.author_id` y `events.author_id`.
- Si se sube más de una imagen por post o evento, todas comparten el mismo `{post_id}/` o `{event_id}/` como prefijo. El UUID garantiza unicidad dentro del directorio.

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

- [ADR-002](0002-rbac.md) — helpers `is_admin()` / `is_manager()` (usados en extensiones futuras de policies de Storage)
- Consumidores: EPIC-N01 (avatares · `profiles.avatar_url`) · EPIC-N02 (post-images · `posts.image_url`) · EPIC-N05 (event-images · `events.image_url`)
- Continúa en: [I-F-A00-05-02 #59](https://github.com/CodeCrafters-ES/pinboard-app/issues/59) — variantes de thumbnail estándar y políticas de limpieza automática
