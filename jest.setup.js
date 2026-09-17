// jest.setup.js
// Mock AsyncStorage for Jest environment
// Ensure test env has valid Supabase variables to avoid runtime validation errors
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'anonkey';

// Mock AsyncStorage
const mockAsyncStorage = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// Mock PowerSync
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: jest.fn().mockResolvedValue({ rows: [], array: [] }),
  }),
  PowerSyncDatabase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [], array: [] }),
    init: jest.fn().mockResolvedValue(undefined),
  })),
  PowerSyncContext: {
    Provider: ({ children }) => children,
  },
  Table: jest.fn(),
  Schema: jest.fn(),
  column: { text: 'text', integer: 'integer', real: 'real' },
}));
