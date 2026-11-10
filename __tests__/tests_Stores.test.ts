import AsyncStorage from '@react-native-async-storage/async-storage';
/// <reference types="jest" />
import { useAuthStore } from '../src/store/authStore';
import { useVaultStore, PIN_RECORD_KEY, MAX_ATTEMPTS } from '../src/store/vaultStore';
import * as SecureStore from 'expo-secure-store';
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
    beforeEach(async () => {
      await useVaultStore.getState().resetPin();
      useVaultStore.setState({
        hasPin: false,
        isBiometricsEnabled: false,
        isUnlocked: false,
        failedAttempts: 0,
        lockedUntil: null,
      });
    });

    test('inicjalizacja ze stanem domyślnym', () => {
      const state = useVaultStore.getState();
      expect(state.hasPin).toBe(false);
      expect(state.isBiometricsEnabled).toBe(false);
      expect(state.isUnlocked).toBe(false);
    });

    test('ustawienie kodu PIN (setPin) odblokowuje sejf', async () => {
      await useVaultStore.getState().setPin('4321');

      const state = useVaultStore.getState();
      expect(state.hasPin).toBe(true);
      expect(state.isUnlocked).toBe(true);
    });

    test('PIN nie jest przechowywany jawnym tekstem - tylko solony skrót SHA-256 w SecureStore', async () => {
      await useVaultStore.getState().setPin('4321');

      // Stan zapisywany w AsyncStorage nie zawiera PIN-u
      expect(JSON.stringify(useVaultStore.getState())).not.toContain('4321');

      const raw = await SecureStore.getItemAsync(PIN_RECORD_KEY);
      expect(raw).not.toBeNull();
      expect(raw).not.toContain('4321');
      const record = JSON.parse(raw!);
      expect(record.salt).toMatch(/^[0-9a-f]{32}$/);
      expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('ten sam PIN daje różne skróty dzięki losowej soli', async () => {
      await useVaultStore.getState().setPin('1111');
      const first = JSON.parse((await SecureStore.getItemAsync(PIN_RECORD_KEY))!);
      await useVaultStore.getState().setPin('1111');
      const second = JSON.parse((await SecureStore.getItemAsync(PIN_RECORD_KEY))!);
      expect(first.salt).not.toBe(second.salt);
      expect(first.hash).not.toBe(second.hash);
    });

    test('weryfikacja PIN-u (verifyPin)', async () => {
      await useVaultStore.getState().setPin('9876');
      useVaultStore.setState({ isUnlocked: false });
      const { verifyPin } = useVaultStore.getState();

      // Błędny PIN
      expect(await verifyPin('1111')).toBe('wrong');
      expect(useVaultStore.getState().isUnlocked).toBe(false);
      expect(useVaultStore.getState().failedAttempts).toBe(1);

      // Poprawny PIN zeruje licznik prób
      expect(await verifyPin('9876')).toBe('ok');
      expect(useVaultStore.getState().isUnlocked).toBe(true);
      expect(useVaultStore.getState().failedAttempts).toBe(0);
    });

    test(`blokada czasowa po ${MAX_ATTEMPTS} błędnych próbach (nawet poprawny PIN jest wtedy odrzucany)`, async () => {
      await useVaultStore.getState().setPin('2468');
      useVaultStore.setState({ isUnlocked: false });
      const { verifyPin } = useVaultStore.getState();

      for (let i = 1; i < MAX_ATTEMPTS; i++) {
        expect(await verifyPin('0000')).toBe('wrong');
      }
      expect(await verifyPin('0000')).toBe('locked');
      expect(useVaultStore.getState().getLockoutRemainingMs()).toBeGreaterThan(0);

      expect(await verifyPin('2468')).toBe('locked');
      expect(useVaultStore.getState().isUnlocked).toBe(false);

      // Po upływie blokady poprawny PIN znowu działa
      useVaultStore.setState({ lockedUntil: Date.now() - 1 });
      expect(await verifyPin('2468')).toBe('ok');
      expect(useVaultStore.getState().failedAttempts).toBe(0);
    });

    test('resetPin usuwa skrót z SecureStore i wymusza ustawienie nowego PIN-u', async () => {
      await useVaultStore.getState().setPin('1357');
      await useVaultStore.getState().resetPin();

      expect(await SecureStore.getItemAsync(PIN_RECORD_KEY)).toBeNull();
      expect(useVaultStore.getState().hasPin).toBe(false);
      expect(useVaultStore.getState().isUnlocked).toBe(false);
    });

    test('migracja: stary PIN zapisany jawnym tekstem w AsyncStorage jest zamieniany na skrót', async () => {
      await AsyncStorage.setItem(
        'destivo-vault-store',
        JSON.stringify({ state: { pin: '8642', isBiometricsEnabled: true }, version: 0 })
      );
      await useVaultStore.persist.rehydrate();

      expect(useVaultStore.getState().hasPin).toBe(true);
      expect(useVaultStore.getState().isBiometricsEnabled).toBe(true);
      expect(await AsyncStorage.getItem('destivo-vault-store')).not.toContain('8642');

      useVaultStore.setState({ isUnlocked: false });
      expect(await useVaultStore.getState().verifyPin('8642')).toBe('ok');
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
        cost: 600,
      });
      expect(useTripCreatorStore.getState().lodging?.type).toBe('hotel');

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
