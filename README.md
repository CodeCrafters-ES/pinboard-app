# Nun Ibiza — PinBoard App

App móvil interna para empleados de Nun Ibiza. Centraliza noticias, eventos, chat y comunicación del equipo en un entorno corporativo seguro.

## Stack

| Tecnología | Rol |
|---|---|
| **Expo + React Native** | Framework y toolchain principal |
| **TypeScript** | Tipado estático en todo el proyecto |
| **Expo Router v3** | Navegación basada en archivos |
| **NativeWind** | Estilos Tailwind CSS via prop `className` |
| **Supabase** | Auth, Postgres, Realtime, Storage, Edge Functions |
| **EAS Build** | Builds para distribución |

## Requisitos previos

- Node.js LTS
- pnpm (`npm install -g pnpm`)
- Supabase CLI (`npx supabase --version`)
- Para Android: Android Studio con emulador configurado
- Para iOS: macOS con Xcode

## Instalación

```bash
pnpm install
```

## Variables de entorno

Crea un archivo `.env` en la raíz con:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Ejecución

```bash
# Servidor de desarrollo
npx expo start

# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Supabase local

```bash
# Arrancar entorno local (Docker)
npx supabase start

# Aplicar migraciones
npx supabase db push

# Generar tipos TypeScript desde el esquema
npx supabase gen types typescript --local > lib/database.types.ts
```

## Estructura del proyecto

```
├── app/                     # Rutas de Expo Router
│   ├── (auth)/              # login, set-password, reset-password
│   └── (app)/               # guard: sin sesión → /(auth)/login
│       ├── (tabs)/          # tablon, calendario, chat, perfil
│       ├── modals/          # nuevo-post, nuevo-evento, nuevo-chat
│       └── admin/           # gestión de usuarios (solo admin)
├── components/              # Componentes UI reutilizables
│   └── ui/                  # Text, View, Button, Card con tokens de diseño
├── hooks/                   # Custom hooks
├── lib/                     # Cliente Supabase tipado, utilidades
├── assets/                  # Imágenes, fuentes, iconos
└── supabase/
    ├── migrations/          # SQL versionado
    └── functions/           # Edge Functions (Deno runtime)
```

## Convenciones

- Todo el código en **TypeScript** (`.ts` / `.tsx`). Sin archivos `.js` / `.jsx`.
- Estilos con **NativeWind** (clases Tailwind en la prop `className`). Evitar `StyleSheet.create` salvo casos que NativeWind no cubra.
- Autorización siempre en **Supabase RLS** (Postgres), nunca en el cliente.
- Paquetes con `pnpm add`. CLI de Expo con `npx expo ...`. CLI de Supabase con `npx supabase ...`.
