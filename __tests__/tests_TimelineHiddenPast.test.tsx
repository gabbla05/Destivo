import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TimelineScreen } from '../src/screens/TimelineScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: { tripId: 'trip-active-hidden-past' },
  }),
  useFocusEffect: (cb: any) => cb(),
}));

const mockDbExecute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockDbExecute,
  }),
}));

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user-123', email: 'test@destivo.io', isGuest: false },
    isGuest: false,
    language: 'pl',
  }),
}));

const mockSupabaseSelect = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: mockSupabaseSelect,
    })),
  },
}));

describe('Oś czasu - Ukrywanie minionych punktów od góry (start od obecnego/najbliższego)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Dla aktywnej wycieczki nie powinien renderować minionych punktów od góry dopóki użytkownik nie kliknie Pokaż lub nie przefiltruje na dany dzień', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const tomorrow = new Date(now.getTime() + 86400000);

    const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${yesterday.getFullYear()}`;
    const todayStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    const tomorrowStr = `${String(tomorrow.getDate()).padStart(2, '0')}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${tomorrow.getFullYear()}`;

    const customTimeline = [
      {
        id: 'evt_past_yesterday',
        type: 'ATTRACTION',
        title: 'Wczorajsza Atrakcja',
        dateStr: yesterdayStr,
        timeStr: '10:00',
        parsedDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 10, 0),
        isPast: true,
      },
      {
        id: 'evt_today_current',
        type: 'ATTRACTION',
        title: 'Bieżący Przystanek Dzisiaj',
        dateStr: todayStr,
        timeStr: '23:59',
        parsedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59),
        isCurrent: true,
      },
      {
        id: 'evt_tomorrow_future',
        type: 'ATTRACTION',
        title: 'Jutrzejsza Atrakcja',
        dateStr: tomorrowStr,
        timeStr: '12:00',
        parsedDate: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0),
      },
    ];

    const tripData = [{
      id: 'trip-active-hidden-past',
      title: 'Włochy 2026',
      origin: 'Warszawa',
      destination: 'Rzym',
      start_date: yesterdayStr,
      end_date: tomorrowStr,
      attractions_data: JSON.stringify({ customTimeline }),
    }];

    mockSupabaseSelect.mockImplementation(() => ({
      eq: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockResolvedValue({ data: tripData, error: null }),
        order: jest.fn().mockImplementation(() => ({
          limit: jest.fn().mockResolvedValue({ data: tripData, error: null }),
        })),
        then: (resolve: any) => resolve({ data: tripData, error: null }),
      })),
      order: jest.fn().mockImplementation(() => ({
        limit: jest.fn().mockResolvedValue({ data: tripData, error: null }),
      })),
      then: (resolve: any) => resolve({ data: tripData, error: null }),
    }));

    render(<TimelineScreen route={{ params: { tripId: 'trip-active-hidden-past' } }} />);

    // 1. Bieżący i przyszły punkt są widoczne od razu
    await waitFor(() => {
      expect(screen.getByText('Bieżący Przystanek Dzisiaj')).toBeTruthy();
      expect(screen.getByText('Jutrzejsza Atrakcja')).toBeTruthy();
    });

    // 2. Wczorajszy punkt NIE powinien być wyświetlany od góry!
    expect(screen.queryByText('Wczorajsza Atrakcja')).toBeNull();

    // 3. Widoczna jest belka informująca o minionych punktach
    expect(screen.getByTestId('show-past-events-btn')).toBeTruthy();

    // 4. Kliknięcie "Pokaż" rozwija minione punkty
    fireEvent.press(screen.getByTestId('show-past-events-btn'));
    await waitFor(() => {
      expect(screen.getByText('Wczorajsza Atrakcja')).toBeTruthy();
    });

    // 5. Kliknięcie "Ukryj" ponownie je ukrywa
    fireEvent.press(screen.getByTestId('hide-past-events-btn'));
    await waitFor(() => {
      expect(screen.queryByText('Wczorajsza Atrakcja')).toBeNull();
    });

    // 6. Gdy użytkownik przefiltruje na miniony dzień (wczoraj), punkt z tego dnia jest w pełni widoczny
    const dayTab = screen.getByText(new RegExp(yesterdayStr.slice(0, 5)));
    fireEvent.press(dayTab);
    await waitFor(() => {
      expect(screen.getByText('Wczorajsza Atrakcja')).toBeTruthy();
    });
  });
});
