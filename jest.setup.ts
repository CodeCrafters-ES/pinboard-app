// Mocks globales de módulos nativos. Las suites que necesiten controlar su
// comportamiento pueden redefinirlos con jest.mock local (tiene prioridad).

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
      Promise.resolve({ isConnected: true, isInternetReachable: true }),
    ),
  },
}));

// expo-router 6: `<Stack.Screen>` llama a useRoute() y lanza fuera de un navegador.
// Las pantallas se renderizan aisladas en los tests (sin navegador), así que se
// neutraliza como no-op. En la app real siempre viven dentro de un Stack.
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  actual.Stack.Screen = () => null;
  return actual;
});
