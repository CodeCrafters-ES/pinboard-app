import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#FAF6EE' },
        headerTintColor: '#7D5A3A',
        headerTitleStyle: { fontWeight: '600', color: '#2C1F14' },
        headerShadowVisible: false,
      }}
    />
  );
}
