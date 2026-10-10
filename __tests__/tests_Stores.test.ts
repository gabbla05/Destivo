/// <reference types="jest" />
import { useAuthStore } from '../src/store/authStore';
import { useVaultStore } from '../src/store/vaultStore';
import { useTripCreatorStore, TransportOption } from '../src/store/tripCreatorStore';

describe('Zarządzanie stanem aplikacji (Stores)', () => {
  describe('1. authStore (useAuthStore)', () => {
    beforeEach(() => {
      useAuthStore.setState({
        user: null,
        isGuest: false,
        language: 'pl',
      });
    });

    test('inicjalizacja ze stanem domyślnym', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isGuest).toBe(false);
      expect(state.language).toBe('pl');
    });

    test('przełączanie języka: toggleLanguage i setLanguage', () => {
      const { toggleLanguage, setLanguage } = useAuthStore.getState();
      
      toggleLanguage();
      expect(useAuthStore.getState().language).toBe('en');

      toggleLanguage();
      expect(useAuthStore.getState().language).toBe('pl');

      setLanguage('en');
      expect(useAuthStore.getState().language).toBe('en');

      setLanguage('pl');
      expect(useAuthStore.getState().language).toBe('pl');
    });

    test('ustawianie użytkownika zalogowanego (setUser)', () => {
      const { setUser } = useAuthStore.getState();

      setUser({
        id: 'u-123',
        email: 'traveler@destivo.io',
        name: 'Podróżnik',
      });

      let state = useAuthStore.getState();
      expect(state.user?.id).toBe('u-123');
      expect(state.user?.email).toBe('traveler@destivo.io');
      expect(state.isGuest).toBe(false);
      expect(state.language).toBe('pl');

      // Użytkownik z zadanym językiem
      setUser({
        id: 'u-456',
        email: 'globetrotter@destivo.io',
        isGuest: false,
        language: 'en',
      });

      state = useAuthStore.getState();
      expect(state.user?.id).toBe('u-456');
      expect(state.language).toBe('en');
    });

    test('tryb gościa (continueAsGuest) i wylogowanie (logout)', () => {
      const { continueAsGuest, logout } = useAuthStore.getState();

      continueAsGuest();
      let state = useAuthStore.getState();
      expect(state.isGuest).toBe(true);
      expect(state.user?.id).toBe('guest-session');
      expect(state.user?.email).toBe('guest@destivo.io');

      logout();
      state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isGuest).toBe(false);
    });

    test('setUser(null) czyści użytkownika i flagę gościa', () => {
      const { continueAsGuest, setUser } = useAuthStore.getState();
      continueAsGuest();
      expect(useAuthStore.getState().isGuest).toBe(true);

      setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isGuest).toBe(false);
    });
  });

  describe('2. vaultStore (useVaultStore)', () => {
    beforeEach(() => {
      useVaultStore.setState({
        pin: null,
        isBiometricsEnabled: false,
        isUnlocked: false,
      });
    });

    test('inicjalizacja ze stanem domyślnym', () => {
      const state = useVaultStore.getState();
      expect(state.pin).toBeNull();
      expect(state.isBiometricsEnabled).toBe(false);
      expect(state.isUnlocked).toBe(false);
    });

    test('ustawienie kodu PIN (setPin) odblokowuje sejf', () => {
      const { setPin } = useVaultStore.getState();
      setPin('4321');

      const state = useVaultStore.getState();
      expect(state.pin).toBe('4321');
      expect(state.isUnlocked).toBe(true);
    });

    test('weryfikacja PIN-u (verifyPin)', () => {
      useVaultStore.setState({ pin: '9876', isUnlocked: false });
      const { verifyPin } = useVaultStore.getState();

      // Błędny PIN
      const invalidResult = verifyPin('1111');
      expect(invalidResult).toBe(false);
      expect(useVaultStore.getState().isUnlocked).toBe(false);

      // Poprawny PIN
      const validResult = verifyPin('9876');
      expect(validResult).toBe(true);
      expect(useVaultStore.getState().isUnlocked).toBe(true);
    });

    test('ręczne blokowanie i odblokowywanie sejfu (lockVault, unlockVault)', () => {
      const { lockVault, unlockVault } = useVaultStore.getState();

      unlockVault();
      expect(useVaultStore.getState().isUnlocked).toBe(true);

      lockVault();
      expect(useVaultStore.getState().isUnlocked).toBe(false);
    });

    test('konfiguracja biometrii (setBiometrics)', () => {
      const { setBiometrics } = useVaultStore.getState();

      setBiometrics(true);
      expect(useVaultStore.getState().isBiometricsEnabled).toBe(true);

      setBiometrics(false);
      expect(useVaultStore.getState().isBiometricsEnabled).toBe(false);
    });
  });

  describe('3. tripCreatorStore (useTripCreatorStore)', () => {
    beforeEach(() => {
      useTripCreatorStore.getState().reset();
    });

    test('podstawowe pola wycieczki (setTripName, setOrigin, setDestination, setStep1Data)', () => {
      const { setTripName, setOrigin, setDestination, setStep1Data } = useTripCreatorStore.getState();

      setTripName('Wakacje na Sycylii');
      expect(useTripCreatorStore.getState().tripName).toBe('Wakacje na Sycylii');

      setOrigin('Warszawa');
      expect(useTripCreatorStore.getState().origin).toBe('Warszawa');

      setDestination('Palermo');
      expect(useTripCreatorStore.getState().destination).toBe('Palermo');

      setStep1Data({
        tripName: 'Rzymski weekend',
        origin: 'Kraków',
        destination: 'Rzym',
        startDate: '2026-05-01',
        endDate: '2026-05-05',
      });

      const state = useTripCreatorStore.getState();
      expect(state.tripName).toBe('Rzymski weekend');
      expect(state.origin).toBe('Kraków');
      expect(state.destination).toBe('Rzym');
      expect(state.startDate).toBe('2026-05-01');
      expect(state.endDate).toBe('2026-05-05');
    });

    test('wybór opcji transportu (setTransportOption) oraz własnego kosztu', () => {
      const { setTransportOption, setCustomTransportCost, clearCustomTransportCost } = useTripCreatorStore.getState();

      const mockOption: TransportOption = {
        id: 'opt-flight-1',
        type: 'flight',
        provider: 'Ryanair',
        rawDurationMinutes: 120,
        doorToDoorDurationMinutes: 240,
        basePrice: 150,
        totalCost: 220,
        minTotalCost: 200,
        maxTotalCost: 250,
        price: {
          min: 200,
          max: 250,
          currency: 'PLN',
          status: 'LIVE',
          source: 'Ryanair API',
          checkedAt: '2026-04-10T10:00:00Z',
        },
        dataConfidence: 'HIGH',
        distanceKm: 1300,
        stressScore: 30,
        badges: ['SMART_CHOICE'],
      };

      setTransportOption(mockOption);
      let state = useTripCreatorStore.getState();
      expect(state.transport.selectedOption?.id).toBe('opt-flight-1');
      expect(state.transport.customCost).toBe(220);
      expect(state.transport.currency).toBe('PLN');
      expect(state.transport.priceStatus).toBe('LIVE');
      expect(state.transport.priceSource).toBe('Ryanair API');

      // Opcja z statusem UNAVAILABLE
      const unavailableOption: TransportOption = {
        ...mockOption,
        id: 'opt-bus-1',
        type: 'bus',
        price: {
          ...mockOption.price,
          status: 'UNAVAILABLE',
        },
      };

      setTransportOption(unavailableOption);
      state = useTripCreatorStore.getState();
      expect(state.transport.selectedOption?.id).toBe('opt-bus-1');
      expect(state.transport.customCost).toBeUndefined();

      // Czyszczenie opcji (null)
      setTransportOption(null);
      state = useTripCreatorStore.getState();
      expect(state.transport.selectedOption).toBeNull();
      expect(state.transport.customCost).toBeUndefined();

      // Ręczny koszt transportu
      setCustomTransportCost(350);
      expect(useTripCreatorStore.getState().transport.customCost).toBe(350);

      setCustomTransportCost(-50); // Zabezpieczenie Math.max(0, cost)
      expect(useTripCreatorStore.getState().transport.customCost).toBe(0);

      clearCustomTransportCost();
      expect(useTripCreatorStore.getState().transport.customCost).toBeUndefined();
    });

    test('szczegóły transportu, zakwaterowanie oraz atrakcje', () => {
      const {
        setTransportDetails,
        setLodging,
        setLodgingAddress,
        setAttractions,
        toggleAttraction,
        reset,
      } = useTripCreatorStore.getState();

      setTransportDetails({
        outboundDepartureLocation: 'Lotnisko Chopina WAW',
        outboundArrivalLocation: 'Fiumicino FCO',
      });
      expect(useTripCreatorStore.getState().transportDetails.outboundDepartureLocation).toBe('Lotnisko Chopina WAW');

      setLodging({
        type: 'hotel',
        name: 'Hotel Colosseo',
        cost: 600,
      });
      expect(useTripCreatorStore.getState().lodging?.name).toBe('Hotel Colosseo');

      setLodgingAddress('Via dei Fori Imperiali 1, Rzym');
      expect(useTripCreatorStore.getState().lodgingAddress).toBe('Via dei Fori Imperiali 1, Rzym');

      setAttractions({
        selected: ['Koloseum'],
        budget: 100,
      });
      expect(useTripCreatorStore.getState().attractions.selected).toEqual(['Koloseum']);

      // Toggle - dodanie atrakcji
      toggleAttraction('Watykan');
      expect(useTripCreatorStore.getState().attractions.selected).toEqual(['Koloseum', 'Watykan']);

      // Toggle - usunięcie atrakcji
      toggleAttraction('Koloseum');
      expect(useTripCreatorStore.getState().attractions.selected).toEqual(['Watykan']);

      // Reset
      reset();
      expect(useTripCreatorStore.getState().tripName).toBe('');
      expect(useTripCreatorStore.getState().attractions.selected).toEqual([]);
    });
  });
});
