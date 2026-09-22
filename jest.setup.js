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

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
  };
});

// Mock expo-print
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockImplementation(async ({ html }) => ({
    uri: 'file:///mock_cache/destivo_briefing.pdf',
    numberOfPages: 2,
    base64: 'JVBERi0xLjQK...',
  })),
  printAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn().mockReturnValue(true),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(true),
  unregisterAllTasksAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id-123'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

// Mock expo-brightness
jest.mock('expo-brightness', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  getBrightnessAsync: jest.fn().mockResolvedValue(0.5),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
  restoreSystemBrightnessAsync: jest.fn().mockResolvedValue(undefined),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));


