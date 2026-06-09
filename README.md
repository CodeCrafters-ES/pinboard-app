# Pinboard App

Aplicación móvil de tablero de pines construida con Expo y React Native.

## Stack tecnológico

| Tecnología | Rol |
|---|---|
| **Expo** | Framework y toolchain principal |
| **React Native** | Base de la UI nativa |
| **TypeScript** | Tipado estático en todo el proyecto |
| **NativeWind** | Estilos con utilidades Tailwind CSS para React Native |

## Requisitos previos

- Node.js (LTS)
- Expo CLI (`npm install -g expo-cli`)
- Para iOS: macOS con Xcode
- Para Android: Android Studio con emulador configurado

## Instalación

```bash
npm install
```

## Ejecución

```bash
# Inicia el servidor de desarrollo
npx expo start

# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Estructura del proyecto

```
pinboard-app/
├── app/          # Pantallas y navegación
├── components/   # Componentes reutilizables
├── assets/       # Imágenes, fuentes y recursos estáticos
└── ...
```

## Convenciones

- Todo el código nuevo debe estar en **TypeScript** (`.ts` / `.tsx`)
- Los estilos se gestionan con **NativeWind** (clases Tailwind en la prop `className`)
- No usar `StyleSheet.create` salvo casos excepcionales que NativeWind no pueda cubrir
