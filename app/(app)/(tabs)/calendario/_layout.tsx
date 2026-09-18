import { Stack } from 'expo-router';

export default function CalendarioLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Agenda' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Evento', headerTintColor: '#7D5A3A' }} />
    </Stack>
  );
}
