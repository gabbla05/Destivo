/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  generatePackingList,
  calculateTripDurationDays,
  normalizeTransportType,
  loadPackingAssistant,
  togglePackingItem,
  addCustomPackingItem,
  deletePackingItem,
  resetPackingList,
  formatPackingListForSharing,
  getClimaticDefaultWeather,
} from '../src/lib/smartPackingAssistant';

describe('Dynamiczny Asystent Pakowania (Smart Packing Assistant)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('1. Wyliczanie długości wyjazdu i normalizacja transportu', () => {
    test('Powinien poprawnie policzyć liczbę dni wyjazdu', () => {
      expect(calculateTripDurationDays('10-09-2026', '13-09-2026')).toBe(4);
      expect(calculateTripDurationDays('01.05.2026', '01.05.2026')).toBe(1);
      expect(calculateTripDurationDays('2026-06-01', '2026-06-07')).toBe(7);
      // Brak dat -> domyślnie 3 dni
      expect(calculateTripDurationDays(undefined, undefined)).toBe(3);
    });

    test('Powinien znormalizować różne warianty środka transportu', () => {
      expect(normalizeTransportType('flight')).toBe('flight');
      expect(normalizeTransportType('Samolot')).toBe('flight');
      expect(normalizeTransportType('airplane')).toBe('flight');

      expect(normalizeTransportType('car')).toBe('car');
      expect(normalizeTransportType('Samochód')).toBe('car');
      expect(normalizeTransportType('samochod')).toBe('car');

      expect(normalizeTransportType('train')).toBe('train');
      expect(normalizeTransportType('Pociąg')).toBe('train');

      expect(normalizeTransportType('bus')).toBe('bus');
      expect(normalizeTransportType('Autobus')).toBe('bus');
    });
  });

  describe('2. Warunki pogodowe: Deszcz (parasol, kurtka)', () => {
    test('Gdy w prognozie jest deszcz (isRain: true), powinien dodać parasol i kurtkę przeciwdeszczową', () => {
      const items = generatePackingList({
        destination: 'Londyn',
        startDate: '10-09-2026',
        endDate: '13-09-2026',
        transportType: 'flight',
        weather: { temp: 15, isRain: true, condition: 'Przelotny deszcz' },
        language: 'pl',
      });

      const umbrella = items.find(i => i.id === 'weather-umbrella');
      const rainJacket = items.find(i => i.id === 'weather-rain-jacket');
      const shoes = items.find(i => i.id === 'weather-waterproof-shoes');

      expect(umbrella).toBeDefined();
      expect(umbrella?.title).toContain('parasol');
      expect(rainJacket).toBeDefined();
      expect(rainJacket?.title).toContain('przeciwdeszczowa');
      expect(shoes).toBeDefined();
    });

    test('Gdy brak deszczu (isRain: false), nie powinien dodawać parasola ani kurtki przeciwdeszczowej', () => {
      const items = generatePackingList({
        destination: 'Rzym',
        startDate: '10-09-2026',
        endDate: '13-09-2026',
        transportType: 'flight',
        weather: { temp: 20, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      expect(items.find(i => i.id === 'weather-umbrella')).toBeUndefined();
      expect(items.find(i => i.id === 'weather-rain-jacket')).toBeUndefined();
    });
  });

  describe('3. Warunki pogodowe: Zimno (< 10°C) vs Ciepło (>= 22°C)', () => {
    test('Gdy temperatura < 10°C, powinien dodać ciepłe ubrania (kurtka zimowa, czapka, szalik, rękawiczki, bielizna termiczna)', () => {
      const items = generatePackingList({
        destination: 'Zakopane',
        startDate: '10-12-2026',
        endDate: '14-12-2026',
        transportType: 'car',
        weather: { temp: 2, isRain: false, condition: 'Zimno, lekki mróz' },
        language: 'pl',
      });

      const warmJacket = items.find(i => i.id === 'weather-warm-jacket');
      const accessories = items.find(i => i.id === 'weather-winter-hat-scarf');
      const thermal = items.find(i => i.id === 'weather-thermal-underwear');
      const sweater = items.find(i => i.id === 'weather-warm-sweater');

      expect(warmJacket).toBeDefined();
      expect(warmJacket?.title).toContain('zimowa');
      expect(accessories).toBeDefined();
      expect(accessories?.title).toContain('czapka, szalik');
      expect(thermal).toBeDefined();
      expect(sweater).toBeDefined();
    });

    test('Gdy temperatura >= 22°C, powinien dodać krem UV, okulary przeciwsłoneczne, nakrycie głowy i strój kąpielowy', () => {
      const items = generatePackingList({
        destination: 'Barcelona',
        startDate: '10-07-2026',
        endDate: '14-07-2026',
        transportType: 'flight',
        weather: { temp: 28, isRain: false, condition: 'Gorąco i słonecznie' },
        language: 'pl',
      });

      const sunscreen = items.find(i => i.id === 'weather-sunscreen');
      const sunglasses = items.find(i => i.id === 'weather-sunglasses');
      const sunHat = items.find(i => i.id === 'weather-sun-hat');
      const swimwear = items.find(i => i.id === 'weather-swimwear');

      expect(sunscreen).toBeDefined();
      expect(sunscreen?.title).toContain('filtr');
      expect(sunglasses).toBeDefined();
      expect(sunHat).toBeDefined();
      expect(swimwear).toBeDefined();
    });
  });

  describe('4. Środek transportu: Samolot (płyny do 100ml, bagaż podręczny, powerbank)', () => {
    test('Dla samolotu generuje ostrzeżenia o płynach do 100ml, torebce 1L i zakazie powerbanków w luku', () => {
      const items = generatePackingList({
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      const liquids = items.find(i => i.id === 'flight-liquids');
      const bag1l = items.find(i => i.id === 'flight-bag-1l');
      const dimensions = items.find(i => i.id === 'flight-luggage-size');
      const powerbank = items.find(i => i.id === 'flight-powerbank');
      const boardingPass = items.find(i => i.id === 'flight-boarding-pass');

      expect(liquids).toBeDefined();
      expect(liquids?.title).toContain('100 ml');
      expect(liquids?.isWarning).toBe(true);

      expect(bag1l).toBeDefined();
      expect(bag1l?.title).toContain('1L');

      expect(dimensions).toBeDefined();
      expect(dimensions?.title).toContain('wymiarów bagażu');

      expect(powerbank).toBeDefined();
      expect(powerbank?.reason).toContain('zabronione w bagażu rejestrowanym');

      expect(boardingPass).toBeDefined();
    });

    test('Dla samochodu generuje kamizelki odblaskowe, trójkąt, apteczkę i ładowarkę 12V', () => {
      const items = generatePackingList({
        destination: 'Berlin',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'car',
        weather: { temp: 16, isRain: false, condition: 'Częściowe zachmurzenie' },
        language: 'pl',
      });

      const vests = items.find(i => i.id === 'car-safety-vests');
      const kit = items.find(i => i.id === 'car-emergency-kit');
      const charger = items.find(i => i.id === 'car-phone-charger');

      expect(vests).toBeDefined();
      expect(vests?.title).toContain('Kamizelki odblaskowe');
      expect(vests?.isWarning).toBe(true);

      expect(kit).toBeDefined();
      expect(kit?.title).toContain('Trójkąt ostrzegawczy');

      expect(charger).toBeDefined();
    });

    test('Dla pociągu generuje bilet offline, słuchawki i prowiant', () => {
      const items = generatePackingList({
        destination: 'Kraków',
        startDate: '10-09-2026',
        endDate: '12-09-2026',
        transportType: 'train',
        weather: { temp: 17, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      const trainTicket = items.find(i => i.id === 'train-ticket-offline');
      const headphones = items.find(i => i.id === 'train-headphones');

      expect(trainTicket).toBeDefined();
      expect(trainTicket?.title).toContain('Bilet kolejowy');
      expect(headphones).toBeDefined();
    });
  });

  describe('5. Długość wyjazdu: Liczba dni = sugerowane komplety odzieży', () => {
    test('Dla 4 dni wyjazdu sugeruje 5 kompletów bielizny, 5 par skarpetek i 5 t-shirtów', () => {
      const items = generatePackingList({
        destination: 'Rzym',
        startDate: '10-09-2026',
        endDate: '13-09-2026', // 4 dni
        transportType: 'flight',
        weather: { temp: 20, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      const underwear = items.find(i => i.id === 'clothing-underwear');
      const socks = items.find(i => i.id === 'clothing-socks');
      const tshirts = items.find(i => i.id === 'clothing-tshirts');
      const pants = items.find(i => i.id === 'clothing-pants');

      expect(underwear?.quantity).toBe(5); // 4 + 1
      expect(socks?.quantity).toBe(5); // 4 + 1
      expect(tshirts?.quantity).toBe(5);
      expect(pants?.quantity).toBe(3); // 3-5 dni -> 3 pary
    });

    test('Dla 1 dnia wyjazdu sugeruje 2 komplety bielizny i 2 pary skarpetek', () => {
      const items = generatePackingList({
        destination: 'Warszawa',
        startDate: '10-09-2026',
        endDate: '10-09-2026', // 1 dzień
        transportType: 'car',
        weather: { temp: 15, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      const underwear = items.find(i => i.id === 'clothing-underwear');
      const socks = items.find(i => i.id === 'clothing-socks');

      expect(underwear?.quantity).toBe(2); // 1 + 1
      expect(socks?.quantity).toBe(2);
    });
  });

  describe('6. Adapter gniazdkowy dla destynacji poza UE', () => {
    test('Dla Londynu/UK powinien dodać adapter gniazdkowy typu G', () => {
      const items = generatePackingList({
        destination: 'Londyn',
        startDate: '10-09-2026',
        endDate: '13-09-2026',
        transportType: 'flight',
        weather: { temp: 14, isRain: true, condition: 'Deszcz' },
        language: 'pl',
      });

      const adapter = items.find(i => i.id === 'electronics-adapter');
      expect(adapter).toBeDefined();
      expect(adapter?.title).toContain('Adapter gniazdkowy');
      expect(adapter?.title).toContain('UK');
    });

    test('Dla Rzymu/Włoch nie powinien dodawać adaptera brytyjskiego', () => {
      const items = generatePackingList({
        destination: 'Rzym',
        startDate: '10-09-2026',
        endDate: '13-09-2026',
        transportType: 'flight',
        weather: { temp: 20, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      const adapter = items.find(i => i.id === 'electronics-adapter');
      expect(adapter).toBeUndefined();
    });
  });

  describe('7. Trwałość, dodawanie pozycji, zaznaczanie i formatowanie tekstu', () => {
    test('loadPackingAssistant tworzy i zapisuje listę w AsyncStorage', async () => {
      const data = await loadPackingAssistant({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      expect(data.tripId).toBe('trip-abc');
      expect(data.items.length).toBeGreaterThan(10);
      expect(data.packedCount).toBe(0);
      expect(data.progressPercent).toBe(0);
    });

    test('togglePackingItem zmienia stan zaznaczenia i aktualizuje procent postępu', async () => {
      await loadPackingAssistant({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      const updated = await togglePackingItem('trip-abc', 'flight-liquids');
      expect(updated).not.toBeNull();
      const item = updated!.items.find(i => i.id === 'flight-liquids');
      expect(item?.checked).toBe(true);
      expect(updated!.packedCount).toBe(1);
      expect(updated!.progressPercent).toBeGreaterThan(0);
    });

    test('addCustomPackingItem dodaje własną pozycję użytkownika', async () => {
      await loadPackingAssistant({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      const updated = await addCustomPackingItem('trip-abc', 'Statyw do aparatu', 'custom', 'pl');
      expect(updated).not.toBeNull();
      const customItem = updated!.items.find(i => i.title === 'Statyw do aparatu');
      expect(customItem).toBeDefined();
      expect(customItem?.isCustom).toBe(true);
    });

    test('deletePackingItem usuwa pozycję z listy', async () => {
      await loadPackingAssistant({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      const withCustom = await addCustomPackingItem('trip-abc', 'Mój specjalny notes');
      const customId = withCustom!.items.find(i => i.title === 'Mój specjalny notes')!.id;

      const afterDelete = await deletePackingItem('trip-abc', customId);
      expect(afterDelete!.items.find(i => i.id === customId)).toBeUndefined();
    });

    test('resetPackingList resetuje stan i generuje listę od nowa', async () => {
      await loadPackingAssistant({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      await togglePackingItem('trip-abc', 'flight-liquids');

      const resetData = await resetPackingList({
        tripId: 'trip-abc',
        destination: 'Paryż',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 18, isRain: false, condition: 'Umiarkowanie' },
        language: 'pl',
      });

      expect(resetData.packedCount).toBe(0);
      expect(resetData.items.find(i => i.id === 'flight-liquids')?.checked).toBe(false);
    });

    test('formatPackingListForSharing generuje czysty tekst checklisty', async () => {
      const data = await loadPackingAssistant({
        tripId: 'trip-share',
        destination: 'Rzym',
        startDate: '10-09-2026',
        endDate: '14-09-2026',
        transportType: 'flight',
        weather: { temp: 22, isRain: false, condition: 'Słonecznie' },
        language: 'pl',
      });

      const text = formatPackingListForSharing(data, 'pl');
      expect(text).toContain('DESTIVO - LISTA PAKOWANIA: RZYM');
      expect(text).toContain('[ ]');
      expect(text).toContain('TRANSPORT & BAGAŻ');
    });
  });
});
