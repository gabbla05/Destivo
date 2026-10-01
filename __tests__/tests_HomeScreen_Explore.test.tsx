/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeScreen, getEmergencyNumber, sanitizeTimeStr } from '../src/screens/HomeScreen';
import { generateLiveRecommendations } from '../src/lib/liveExplore';

jest.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', name: 'Alicja' },
    isGuest: false,
    language: 'pl',
  }),
}));

const mockExecute = jest.fn();
jest.mock('@powersync/react-native', () => ({
  usePowerSync: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('../src/lib/liveExplore', () => ({
  generateLiveRecommendations: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: any) => {
    callback();
  },
}));

describe('HomeScreen - Rekomendacje podróży i interfejs główny', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockRecommendations = [
    {
      id: 'rome_01',
      city: 'Rzym',
      country: 'Włochy',
      lat: 41.9028,
      lon: 12.4964,
      coverImage: 'https://images.unsplash.com/photo-rome.jpg',
      shortDescription: 'Wieczne miasto.',
      transportCode: 'ROM',
      distanceKm: 1300,
      recommendedTransport: 'flight' as const,
      nearestAirport: 'WAW',
      flightDate: '20.09.2026 - 23.09.2026',
      hasPredefinedPlan: true,
      proposedTrip: {
        startDate: '20.09.2026',
        endDate: '23.09.2026',
        durationDays: 3,
        estimatedTemp: 22,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Umiarkowany ruch',
        itinerary: [{ day: 1, title: 'Dzień 1', attractions: ['Koloseum'] }],
      },
    },
    {
      id: 'bari_01',
      city: 'Bari',
      country: 'Włochy',
      lat: 41.1171,
      lon: 16.8719,
      coverImage: 'https://images.unsplash.com/photo-bari.jpg',
      shortDescription: 'Słoneczna Apulia.',
      transportCode: 'BRI',
      distanceKm: 1250,
      recommendedTransport: 'flight' as const,
      nearestAirport: 'KRK',
      flightDate: '22.09.2026 - 25.09.2026',
      hasPredefinedPlan: false,
      proposedTrip: {
        startDate: '22.09.2026',
        endDate: '25.09.2026',
        durationDays: 3,
        estimatedTemp: 25,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Spokojnie',
        itinerary: [],
      },
    },
    {
      id: 'sandomierz_01',
      city: 'Sandomierz',
      country: 'Polska',
      lat: 50.6823,
      lon: 21.7494,
      coverImage: 'https://images.unsplash.com/photo-sandomierz.jpg',
      shortDescription: 'Królewskie miasto na siedmiu wzgórzach.',
      transportCode: 'SND',
      distanceKm: 210,
      recommendedTransport: 'car' as const,
      isOffTheBeatenPath: true,
      hasPredefinedPlan: true,
      proposedTrip: {
        startDate: '20.09.2026',
        endDate: '22.09.2026',
        durationDays: 2,
        estimatedTemp: 19,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Spokojnie',
        itinerary: [{ day: 1, title: 'Dzień 1', attractions: ['Brama Opatowska'] }],
      },
    },
    {
      id: 'kazimierz_01',
      city: 'Kazimierz Dolny',
      country: 'Polska',
      lat: 51.3218,
      lon: 21.9472,
      coverImage: 'https://images.unsplash.com/photo-kazimierz.jpg',
      shortDescription: 'Malownicze miasteczko nad Wisłą.',
      transportCode: 'KAZ',
      distanceKm: 145,
      recommendedTransport: 'car' as const,
      isDayTrip: true,
      hasPredefinedPlan: true,
      proposedTrip: {
        startDate: '20.09.2026',
        endDate: '20.09.2026',
        durationDays: 1,
        estimatedTemp: 21,
        condition: 'Bez opadów, idealnie na zwiedzanie',
        crowdLevel: 'Spokojnie',
        itinerary: [{ day: 1, title: 'Dzień 1', attractions: ['Rynek w Kazimierzu Dolnym'] }],
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [], array: [] });
    (generateLiveRecommendations as jest.Mock).mockResolvedValue(mockRecommendations);
  });

  test('1. renderuje powitanie użytkownika i przyciski nawigacji', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Alicja/i)).toBeTruthy();
      expect(screen.getByText(/Gdzie wyruszamy tym razem\?/i)).toBeTruthy();
      expect(screen.getByText(/\+ Utwórz/i)).toBeTruthy();
      expect(screen.getByText(/podróże/i)).toBeTruthy();
    });
  });

  test('2. kliknięcie przycisków głównych kieruje odpowiednio do kreatora i listy podróży', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/\+ Utwórz/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByText(/\+ Utwórz/i));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripCreator');

    fireEvent.press(screen.getByText(/podróże/i));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Trips');
  });

  test('3. renderuje kafelki rekomendacji z poprawnymi danymi (Gotowy plan vs Wymaga własnego planu)', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
      expect(screen.getByText('Bari')).toBeTruthy();
    });

    // Rzym ma gotowy plan
    expect(screen.getAllByText(/Gotowy plan/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/3-dniowy gotowy plan wycieczki/i)).toBeTruthy();

    // Bari nie ma gotowego planu
    expect(screen.getByText(/Wymaga własnego planu/i)).toBeTruthy();

    // Pastylka transportu
    expect(screen.getAllByText(/Lot/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/z WAW/i)).toBeTruthy();
    expect(screen.getByText(/z KRK/i)).toBeTruthy();
  });

  test('4. kliknięcie kafelka rekomendacji przekierowuje do ExploreDetails z danymi destynacji', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Rzym'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('ExploreDetails', {
      destData: mockRecommendations[0],
    });
  });

  test('5. renderuje komunikat pustej listy rekomendacji gdy brak wyników', async () => {
    (generateLiveRecommendations as jest.Mock).mockResolvedValue([]);

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Brak bezpiecznych rekomendacji na ten moment/i)).toBeTruthy();
    });
  });

  test('6. w widoku aktywnej podróży renderuje oś czasu, przelicznik walut i numery alarmowe', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const activeTripDbRow = {
      id: 'active-trip-1',
      trip_name: 'Wyprawa do Włoch',
      destination: 'Rzym',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-1', title: 'Koloseum', time: '10:00', description: 'Zwiedzanie amfiteatru', status: 'IN_PROGRESS' },
          { id: 'ev-2', title: 'Panteon', time: '14:00', description: 'Antyczna świątynia', status: 'TODO' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [activeTripDbRow],
      array: [activeTripDbRow],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Podróż do Rzym/i)).toBeTruthy();
      expect(screen.getByText('Koloseum')).toBeTruthy();
      expect(screen.getByText('Panteon')).toBeTruthy();
      expect(screen.getByText('W TRAKCIE')).toBeTruthy();
      expect(screen.getByText(/Kalkulator Walut/i)).toBeTruthy();
      expect(screen.getByText(/Lokalny numer alarmowy/i)).toBeTruthy();
      // Upewniamy się, że blok wsparcia konsularnego został całkowicie usunięty
      expect(screen.queryByText(/Wsparcie Konsularne/i)).toBeNull();
    });
  });

  test('7. wycieczka w Polsce: wyświetla kalkulator walut (z możliwością zmiany waluty) i nie renderuje wsparcia konsularnego', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const polishTripDbRow = {
      id: 'polish-trip-1',
      trip_name: 'Weekend w stolicy',
      destination: 'Warszawa',
      origin: 'Kraków',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-1', title: 'Łazienki Królewskie', time: '11:00', description: 'Spacer po parku', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [polishTripDbRow],
      array: [polishTripDbRow],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText(/Podróż do Warszawa/i)).toBeTruthy();
      expect(screen.getByText('Łazienki Królewskie')).toBeTruthy();
      // Kalkulator walut jest zawsze dostępny (z możliwością wyboru dowolnej waluty)
      expect(screen.getByText(/Kalkulator Walut/i)).toBeTruthy();
      // Wsparcie konsularne jest całkowicie usunięte
      expect(screen.queryByText(/Wsparcie Konsularne/i)).toBeNull();
      // Lokalny numer alarmowy pozostaje
      expect(screen.getByText(/Lokalny numer alarmowy/i)).toBeTruthy();
    });
  });

  test('8. kliknięcie Dodaj atrakcję otwiera modal proponujący atrakcje nieuwzględnione na osi', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const activeTripDbRow = {
      id: 'active-trip-rome',
      trip_name: 'Rzymskie wakacje',
      destination: 'Rzym',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-1', title: 'Koloseum', time: '10:00', description: 'Zwiedzanie', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [activeTripDbRow],
      array: [activeTripDbRow],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Dodaj atrakcję')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Dodaj atrakcję'));

    await waitFor(() => {
      // Tytuł modala
      expect(screen.getByText(/Dodaj punkt w trasie/i)).toBeTruthy();
      // Sekcja propozycji
      expect(screen.getByText(/Propozycje z okolicy/i)).toBeTruthy();
      // Fontanna di Trevi powinna być zaproponowana (bo nie ma jej na osi, a Koloseum jest)
      expect(screen.getByText('Fontanna di Trevi')).toBeTruthy();
    });
  });

  test('9. nie wyświetla plakietki Nieoczywisty kierunek (czysty interfejs)', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Sandomierz')).toBeTruthy();
    });

    expect(screen.queryByText(/Nieoczywisty kierunek/i)).toBeNull();
  });

  test('10. filtruje rekomendacje po kliknięciu chipów filtrów (Blisko/Weekend, Samolotem, Wszystkie)', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rzym')).toBeTruthy();
      expect(screen.getByText('Bari')).toBeTruthy();
      expect(screen.getByText('Sandomierz')).toBeTruthy();
    });

    // Filtruj po "Blisko"
    fireEvent.press(screen.getByText(/Blisko/i));
    expect(screen.getByText('Sandomierz')).toBeTruthy();
    expect(screen.queryByText('Rzym')).toBeNull();

    // Filtruj po "Loty"
    fireEvent.press(screen.getByText(/Loty|Samolotem/i));
    expect(screen.getByText('Rzym')).toBeTruthy();
    expect(screen.getByText('Bari')).toBeTruthy();
    expect(screen.queryByText('Sandomierz')).toBeNull();

    // Powrót do "Wszystkie"
    fireEvent.press(screen.getByText(/Wszystkie/i));
    expect(screen.getByText('Rzym')).toBeTruthy();
    expect(screen.getByText('Bari')).toBeTruthy();
    expect(screen.getByText('Sandomierz')).toBeTruthy();
  });

  test('11. sanitizeTimeStr normalizuje niepoprawne godziny (np. 26:00 -> 02:00)', () => {
    expect(sanitizeTimeStr('26:00')).toBe('02:00');
    expect(sanitizeTimeStr('24:00')).toBe('00:00');
    expect(sanitizeTimeStr('25:30')).toBe('01:30');
    expect(sanitizeTimeStr('15:00')).toBe('15:00');
    expect(sanitizeTimeStr('09:45')).toBe('09:45');
    expect(sanitizeTimeStr('')).toBe('12:00');
    expect(sanitizeTimeStr(undefined)).toBe('12:00');
  });

  test('12. getEmergencyNumber poprawnie przypisuje numer alarmowy do kraju i miasta', () => {
    // Wielka Brytania
    expect(getEmergencyNumber('Londyn')).toBe('999');
    expect(getEmergencyNumber('Edynburg')).toBe('999');
    expect(getEmergencyNumber('United Kingdom')).toBe('999');
    expect(getEmergencyNumber('Wielka Brytania')).toBe('999');

    // USA / Kanada
    expect(getEmergencyNumber('Nowy Jork')).toBe('911');
    expect(getEmergencyNumber('USA')).toBe('911');
    expect(getEmergencyNumber('Kanada')).toBe('911');

    // Australia
    expect(getEmergencyNumber('Sydney')).toBe('000');
    expect(getEmergencyNumber('Australia')).toBe('000');

    // Japonia
    expect(getEmergencyNumber('Tokio')).toBe('110');
    expect(getEmergencyNumber('Japonia')).toBe('110');

    // Kraje europejskie (domyślnie 112)
    expect(getEmergencyNumber('Rzym')).toBe('112');
    expect(getEmergencyNumber('Włochy')).toBe('112');
    expect(getEmergencyNumber('Warszawa')).toBe('112');
    expect(getEmergencyNumber('Paryż')).toBe('112');
    expect(getEmergencyNumber('Barcelona')).toBe('112');
    expect(getEmergencyNumber('Chorwacja')).toBe('112');
  });

  test('13. przycisk Bilety wyświetla się wyłącznie dla transportu, a Trasa dla atrakcji i podanego noclegu', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Przypadek 1: W trakcie transportu (DEPARTURE) -> tylko Bilety
    const transportTrip = {
      id: 'trip-transport',
      trip_name: 'Podróż testowa',
      destination: 'Gdańsk',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      transport_type: 'train',
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-dep', type: 'DEPARTURE', title: 'Wyjazd z Warszawa', timeStr: '10:00', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [transportTrip],
      array: [transportTrip],
    });

    const { unmount } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Bilety')).toBeTruthy();
      expect(screen.queryByText('Trasa')).toBeNull();
    });

    unmount();

    // Przypadek 2: W trakcie atrakcji (ATTRACTION) -> tylko Trasa
    const attractionTrip = {
      id: 'trip-attr',
      trip_name: 'Podróż testowa',
      destination: 'Gdańsk',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-attr', type: 'ATTRACTION', title: 'Fontanna Neptuna', timeStr: '14:00', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [attractionTrip],
      array: [attractionTrip],
    });

    const { unmount: unmount2 } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Trasa')).toBeTruthy();
      expect(screen.queryByText('Bilety')).toBeNull();
    });

    unmount2();

    // Przypadek 3: Nocleg bez adresu -> żaden przycisk
    const lodgingNoAddressTrip = {
      id: 'trip-lodge-no-addr',
      trip_name: 'Podróż testowa',
      destination: 'Gdańsk',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      lodging_data: JSON.stringify({ lodgingAddress: '' }),
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-lodge', type: 'LODGING', title: 'Nocleg', timeStr: '16:00', subtitle: 'Zameldowanie i odbiór kluczy', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [lodgingNoAddressTrip],
      array: [lodgingNoAddressTrip],
    });

    const { unmount: unmount3 } = render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Nocleg')).toBeTruthy();
      expect(screen.queryByText('Trasa')).toBeNull();
      expect(screen.queryByText('Bilety')).toBeNull();
    });

    unmount3();

    // Przypadek 4: Nocleg z podanym adresem -> tylko Trasa
    const lodgingWithAddressTrip = {
      id: 'trip-lodge-addr',
      trip_name: 'Podróż testowa',
      destination: 'Gdańsk',
      origin: 'Warszawa',
      start_date: today,
      end_date: tomorrow,
      lodging_data: JSON.stringify({ lodgingAddress: 'ul. Długa 12, Gdańsk' }),
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-lodge', type: 'LODGING', title: 'Nocleg', timeStr: '16:00', subtitle: 'ul. Długa 12, Gdańsk', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [lodgingWithAddressTrip],
      array: [lodgingWithAddressTrip],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Nocleg')).toBeTruthy();
      expect(screen.getByText('Trasa')).toBeTruthy();
      expect(screen.queryByText('Bilety')).toBeNull();
    });
  });

  test('14. kliknięcie w powiadomienie o bilecie natychmiast otwiera modal Bilet w zasięgu ręki', async () => {
    const Notifications = require('expo-notifications');
    Notifications.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: {
        request: {
          content: {
            data: {
              type: 'PROXIMITY_ALERT',
              destination: 'Wenecja',
              departureTime: '16:30',
              stationName: 'Kraków Główny',
              ticketFile: { id: 't-notif-1', name: 'Bilet_Wenecja.pdf' },
            },
          },
        },
      },
    });

    mockExecute.mockResolvedValue({
      rows: [],
      array: [],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      // Sprawdzamy czy modal szybkiego podglądu biletu natychmiast się otworzył
      expect(screen.getByText('Kraków Główny')).toBeTruthy();
      expect(screen.getByText('Wenecja')).toBeTruthy();
      expect(screen.getByText('16:30')).toBeTruthy();
      expect(screen.getByText('Bilet w zasięgu ręki')).toBeTruthy();
    });
  });

  test('15. minione punkty na osi czasu są ukrywane domyślnie, a aktywny punkt świeci się na samej górze', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const timelineTrip = {
      id: 'trip-timeline-test',
      trip_name: 'Wyprawa w Tatry',
      destination: 'Zakopane',
      origin: 'Kraków',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-past', type: 'TRANSPORT', title: 'Pociąg do Zakopanego', timeStr: '06:00', subtitle: 'Kraków -> Zakopane', status: 'COMPLETED' },
          { id: 'ev-current', type: 'ATTRACTION', title: 'Morskie Oko', timeStr: '11:00', subtitle: 'Wycieczka piesza', status: 'IN_PROGRESS' },
          { id: 'ev-future', type: 'LODGING', title: 'Hotel Tatry', timeStr: '19:00', subtitle: 'Zakwaterowanie', status: 'PENDING' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [timelineTrip],
      array: [timelineTrip],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      // Aktywny punkt "Morskie Oko" musi być widoczny i oznaczony jako "W TRAKCIE"
      expect(screen.getByText('Morskie Oko')).toBeTruthy();
      expect(screen.getByText('W TRAKCIE')).toBeTruthy();

      // Przyszły punkt "Hotel Tatry" jest na osi czasu
      expect(screen.getByText('Hotel Tatry')).toBeTruthy();

      // Miniony punkt "Pociąg do Zakopanego" NIE powinien być widoczny domyślnie
      expect(screen.queryByText('Pociąg do Zakopanego')).toBeNull();

      // Przycisk zwijania/rozwijania minionych punktów powinien być widoczny
      expect(screen.getByTestId('toggle-past-events-btn')).toBeTruthy();
      expect(screen.getByText('Minione punkty (1) • Pokaż')).toBeTruthy();
    });

    // Rozwijamy minione punkty
    fireEvent.press(screen.getByTestId('toggle-past-events-btn'));

    await waitFor(() => {
      // Teraz miniony punkt stał się widoczny
      expect(screen.getByText('Pociąg do Zakopanego')).toBeTruthy();
      expect(screen.getByText('Ukryj minione punkty')).toBeTruthy();
    });

    // Zwijamy z powrotem
    fireEvent.press(screen.getByTestId('toggle-past-events-btn'));

    await waitFor(() => {
      expect(screen.queryByText('Pociąg do Zakopanego')).toBeNull();
      expect(screen.getByText('Minione punkty (1) • Pokaż')).toBeTruthy();
    });
  });

  test('16. w osi czasu oraz w modalu dodawania atrakcji dostępne są przyciski kalendarza i zegara', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const timelineTrip = {
      id: 'trip-picker-test',
      trip_name: 'Wyprawa testowa',
      destination: 'Wrocław',
      origin: 'Kraków',
      start_date: today,
      end_date: tomorrow,
      attractions_data: JSON.stringify({
        customTimeline: [
          { id: 'ev-test-1', type: 'ATTRACTION', title: 'Rynek', timeStr: '12:00', subtitle: 'Spacer', status: 'IN_PROGRESS' },
        ],
      }),
    };

    mockExecute.mockResolvedValue({
      rows: [timelineTrip],
      array: [timelineTrip],
    });

    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(screen.getByText('Rynek')).toBeTruthy();
    });

    // Rozwijamy kartę wydarzenia
    fireEvent.press(screen.getByText('Rynek'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker-btn-ev-test-1')).toBeTruthy();
      expect(screen.getByTestId('time-picker-btn-ev-test-1')).toBeTruthy();
    });

    // Sprawdzamy czy naciśnięcie nie powoduje błędu
    fireEvent.press(screen.getByTestId('date-picker-btn-ev-test-1'));
    fireEvent.press(screen.getByTestId('time-picker-btn-ev-test-1'));

    // Otwieramy modal dodawania atrakcji (przycisk u góry "Dodaj atrakcję")
    fireEvent.press(screen.getByText('Dodaj atrakcję'));

    await waitFor(() => {
      expect(screen.getByTestId('manual-date-picker-btn')).toBeTruthy();
      expect(screen.getByTestId('manual-time-picker-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('manual-date-picker-btn'));
    fireEvent.press(screen.getByTestId('manual-time-picker-btn'));
  });

  test('17. sekcja Explore wyświetla gotowe plany wycieczek oraz jednodniowe wypady bez noclegu (autem)', async () => {
    render(<HomeScreen navigation={mockNavigation} />);

    await waitFor(() => {
      // Widoczne są zarówno wycieczki z gotowym planem (Rzym), jak i jednodniowy wypad autem (Kazimierz Dolny)
      expect(screen.getByText('Rzym')).toBeTruthy();
      expect(screen.getByText('Kazimierz Dolny')).toBeTruthy();
      expect(screen.getByText(/1 dzień • Bez noclegu/i)).toBeTruthy();
      expect(screen.getByText(/Jednodniowy wypad autem • Bez noclegu/i)).toBeTruthy();
    });

    // Filtruj po "1 dzień (autem)"
    fireEvent.press(screen.getByText(/1 dzień \(autem\)/i));
    expect(screen.getByText('Kazimierz Dolny')).toBeTruthy();
    expect(screen.queryByText('Rzym')).toBeNull();
    expect(screen.queryByText('Bari')).toBeNull();
  });
});

