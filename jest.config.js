/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Los helpers compartidos de tests usan prefijo `_` (p. ej.
  // __tests__/integration/_retry.ts) y no son suites: no deben ejecutarse.
  testPathIgnorePatterns: ['/node_modules/', '/\\.expo/', '/__tests__/.*/_'],
};
