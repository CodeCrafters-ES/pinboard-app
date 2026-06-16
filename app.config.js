export default {
  expo: {
    name: 'Nun Ibiza',
    slug: 'nun-ibiza',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: 'nun-ibiza',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FFF8F4',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.nunibiza.pinboard',
      infoPlist: {
        NSUserNotificationsUsageDescription:
          'Nun Ibiza envía notificaciones para avisarte de nuevos posts, eventos y mensajes del equipo.',
      },
    },
    android: {
      package: 'com.nunibiza.pinboard',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFF8F4',
      },
      permissions: ['RECEIVE_BOOT_COMPLETED', 'VIBRATE'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#624325',
        },
      ],
    ],
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
