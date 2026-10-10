// src/lib/geoDatabase.ts
import { getGoogleApiKey } from './config';

/**
 * Moduł geolokalizacji, słownika miast i wyznaczania rekomendacji transportowych.
 * Zapewnia:
 * 1. Offline-first bazę współrzędnych miast europejskich i światowych.
 * 2. Inteligentną normalizację nazw (obsługa deklinacji w języku polskim, usuwanie cyfr/typos).
 * 3. Tolerancję literówek (odległość Levenshteina).
 * 4. Odwzorowanie państw na ich główne stolice/węzły komunikacyjne.
 * 5. Hybrydowy fallback do OpenStreetMap Nominatim.
 * 6. Realistyczne kryteria doboru transportu (samolot, pociąg, samochód) oparte na rzeczywistym dystansie.
 */

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface RawTransportRoute {
  type: 'flight' | 'train' | 'car';
  provider: string;
  bookingUrl: string;
  actionLinks: { label: string; url: string }[];
  notes: string[];
}

// BAZA WSPÓŁRZĘDNYCH MIAST (NAZWY POLSKIE, ANGIELSKIE, LOKALNE)
export const KNOWN_CITIES: Record<string, Coordinates> = {
  // POLSKA
  warszawa: { lat: 52.2297, lon: 21.0122 },
  warsaw: { lat: 52.2297, lon: 21.0122 },
  krakow: { lat: 50.0647, lon: 19.9450 },
  kraków: { lat: 50.0647, lon: 19.9450 },
  gdansk: { lat: 54.3520, lon: 18.6466 },
  gdańsk: { lat: 54.3520, lon: 18.6466 },
  wroclaw: { lat: 51.1079, lon: 17.0385 },
  wrocław: { lat: 51.1079, lon: 17.0385 },
  poznan: { lat: 52.4064, lon: 16.9252 },
  poznań: { lat: 52.4064, lon: 16.9252 },
  lodz: { lat: 51.7592, lon: 19.4560 },
  łódź: { lat: 51.7592, lon: 19.4560 },
  katowice: { lat: 50.2649, lon: 19.0238 },
  lublin: { lat: 51.2465, lon: 22.5684 },
  szczecin: { lat: 53.4285, lon: 14.5528 },
  bydgoszcz: { lat: 53.1235, lon: 18.0084 },
  torun: { lat: 53.0138, lon: 18.5984 },
  toruń: { lat: 53.0138, lon: 18.5984 },
  bialystok: { lat: 53.1325, lon: 23.1688 },
  białystok: { lat: 53.1325, lon: 23.1688 },
  gdynia: { lat: 54.5189, lon: 18.5305 },
  sopot: { lat: 54.4418, lon: 18.5601 },
  zakopane: { lat: 49.2992, lon: 19.9496 },
  radom: { lat: 51.4027, lon: 21.1471 },
  czestochowa: { lat: 50.8118, lon: 19.1203 },
  częstochowa: { lat: 50.8118, lon: 19.1203 },
  rzeszow: { lat: 50.0412, lon: 21.9991 },
  rzeszów: { lat: 50.0412, lon: 21.9991 },
  olsztyn: { lat: 53.7784, lon: 20.4801 },
  kielce: { lat: 50.8661, lon: 20.6286 },
  gliwice: { lat: 50.2945, lon: 18.6714 },
  bielsko: { lat: 49.8224, lon: 19.0469 },
  'bielsko-biala': { lat: 49.8224, lon: 19.0469 },
  'bielsko-biała': { lat: 49.8224, lon: 19.0469 },
  sandomierz: { lat: 50.6800, lon: 21.7500 },
  szczawnica: { lat: 49.4278, lon: 20.4856 },
  karpacz: { lat: 50.7716, lon: 15.7576 },
  kolobrzeg: { lat: 54.1759, lon: 15.5833 },
  kołobrzeg: { lat: 54.1759, lon: 15.5833 },
  swinoujscie: { lat: 53.9100, lon: 14.2471 },
  świnoujście: { lat: 53.9100, lon: 14.2471 },

  // WŁOCHY
  rzym: { lat: 41.9028, lon: 12.4964 },
  rome: { lat: 41.9028, lon: 12.4964 },
  roma: { lat: 41.9028, lon: 12.4964 },
  mediolan: { lat: 45.4642, lon: 9.1900 },
  milan: { lat: 45.4642, lon: 9.1900 },
  milano: { lat: 45.4642, lon: 9.1900 },
  wenecja: { lat: 45.4408, lon: 12.3155 },
  venice: { lat: 45.4408, lon: 12.3155 },
  venezia: { lat: 45.4408, lon: 12.3155 },
  florencja: { lat: 43.7696, lon: 11.2558 },
  florence: { lat: 43.7696, lon: 11.2558 },
  firenze: { lat: 43.7696, lon: 11.2558 },
  neapol: { lat: 40.8518, lon: 14.2681 },
  naples: { lat: 40.8518, lon: 14.2681 },
  napoli: { lat: 40.8518, lon: 14.2681 },
  bolonia: { lat: 44.4949, lon: 11.3426 },
  bologna: { lat: 44.4949, lon: 11.3426 },
  turyn: { lat: 45.0703, lon: 7.6869 },
  turin: { lat: 45.0703, lon: 7.6869 },
  torino: { lat: 45.0703, lon: 7.6869 },
  bari: { lat: 41.1171, lon: 16.8719 },
  palermo: { lat: 38.1157, lon: 13.3615 },
  catania: { lat: 37.5079, lon: 15.0873 },
  katania: { lat: 37.5079, lon: 15.0873 },
  werona: { lat: 45.4384, lon: 10.9916 },
  verona: { lat: 45.4384, lon: 10.9916 },
  genua: { lat: 44.4056, lon: 8.9463 },
  pisa: { lat: 43.7228, lon: 10.4017 },
  piza: { lat: 43.7228, lon: 10.4017 },
  bergamo: { lat: 45.6983, lon: 9.6773 },
  alghero: { lat: 40.5579, lon: 8.3193 },
  matera: { lat: 40.6664, lon: 16.6043 },

  // ROSJA I EUROPA WSCHODNIA
  moskwa: { lat: 55.7558, lon: 37.6173 },
  moscow: { lat: 55.7558, lon: 37.6173 },
  'sankt petersburg': { lat: 59.9343, lon: 30.3351 },
  'saint petersburg': { lat: 59.9343, lon: 30.3351 },
  petersburg: { lat: 59.9343, lon: 30.3351 },
  kijow: { lat: 50.4501, lon: 30.5234 },
  kijów: { lat: 50.4501, lon: 30.5234 },
  kyiv: { lat: 50.4501, lon: 30.5234 },
  lwow: { lat: 49.8397, lon: 24.0297 },
  lwów: { lat: 49.8397, lon: 24.0297 },
  lviv: { lat: 49.8397, lon: 24.0297 },
  minsk: { lat: 53.9006, lon: 27.5590 },
  mińsk: { lat: 53.9006, lon: 27.5590 },

  // HISZPANIA I PORTUGALIA
  madryt: { lat: 40.4168, lon: -3.7038 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  barcelona: { lat: 41.3851, lon: 2.1734 },
  walencja: { lat: 39.4699, lon: -0.3763 },
  valencia: { lat: 39.4699, lon: -0.3763 },
  sewilla: { lat: 37.3891, lon: -5.9845 },
  seville: { lat: 37.3891, lon: -5.9845 },
  malaga: { lat: 36.7213, lon: -4.4214 },
  málaga: { lat: 36.7213, lon: -4.4214 },
  bilbao: { lat: 43.2630, lon: -2.9350 },
  alicante: { lat: 38.3452, lon: -0.4810 },
  palma: { lat: 39.5696, lon: 2.6502 },
  granada: { lat: 37.1773, lon: -3.5986 },
  girona: { lat: 41.9794, lon: 2.8214 },
  'san sebastian': { lat: 43.3183, lon: -1.9812 },
  lizbona: { lat: 38.7223, lon: -9.1393 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  porto: { lat: 41.1579, lon: -8.6291 },
  faro: { lat: 37.0194, lon: -7.9304 },
  sintra: { lat: 38.8029, lon: -9.3817 },

  // FRANCJA
  paryz: { lat: 48.8566, lon: 2.3522 },
  paryż: { lat: 48.8566, lon: 2.3522 },
  paris: { lat: 48.8566, lon: 2.3522 },
  nicea: { lat: 43.7102, lon: 7.2620 },
  nice: { lat: 43.7102, lon: 7.2620 },
  lyon: { lat: 45.7640, lon: 4.8357 },
  marsylia: { lat: 43.2965, lon: 5.3698 },
  marseille: { lat: 43.2965, lon: 5.3698 },
  bordeaux: { lat: 44.8378, lon: -0.5792 },
  tuluza: { lat: 43.6047, lon: 1.4442 },
  strasburg: { lat: 48.5734, lon: 7.7521 },
  colmar: { lat: 48.0794, lon: 7.3585 },

  // NIEMCY, AUSTRIA, SZWAJCARIA
  berlin: { lat: 52.5200, lon: 13.4050 },
  monachium: { lat: 48.1351, lon: 11.5820 },
  munich: { lat: 48.1351, lon: 11.5820 },
  frankfurt: { lat: 50.1109, lon: 8.6821 },
  hamburg: { lat: 53.5511, lon: 9.9937 },
  kolonia: { lat: 50.9375, lon: 6.9603 },
  cologne: { lat: 50.9375, lon: 6.9603 },
  drezno: { lat: 51.0504, lon: 13.7373 },
  dresden: { lat: 51.0504, lon: 13.7373 },
  lipsk: { lat: 51.3397, lon: 12.3731 },
  leipzig: { lat: 51.3397, lon: 12.3731 },
  norymberga: { lat: 49.4521, lon: 11.0767 },
  stuttgart: { lat: 48.7758, lon: 9.1829 },
  dusseldorf: { lat: 51.2277, lon: 6.7735 },
  wieden: { lat: 48.2082, lon: 16.3738 },
  wiedeń: { lat: 48.2082, lon: 16.3738 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  salzburg: { lat: 47.8095, lon: 13.0550 },
  innsbruck: { lat: 47.2692, lon: 11.4041 },
  graz: { lat: 47.0707, lon: 15.4395 },
  hallstatt: { lat: 47.5622, lon: 13.6493 },
  zurych: { lat: 47.3769, lon: 8.5417 },
  zurich: { lat: 47.3769, lon: 8.5417 },
  genewa: { lat: 46.2044, lon: 6.1432 },
  geneva: { lat: 46.2044, lon: 6.1432 },
  berno: { lat: 46.9480, lon: 7.4474 },
  bazylea: { lat: 47.5596, lon: 7.5886 },

  // WIELKA BRYTANIA I IRLANDIA
  londyn: { lat: 51.5074, lon: -0.1278 },
  london: { lat: 51.5074, lon: -0.1278 },
  edynburg: { lat: 55.9533, lon: -3.1883 },
  edinburgh: { lat: 55.9533, lon: -3.1883 },
  manchester: { lat: 53.4808, lon: -2.2426 },
  liverpool: { lat: 53.4084, lon: -2.9916 },
  dublin: { lat: 53.3498, lon: -6.2603 },

  // EUROPA ŚRODKOWA, PÓŁNOCNA, BAŁKANY
  praga: { lat: 50.0755, lon: 14.4378 },
  prague: { lat: 50.0755, lon: 14.4378 },
  brno: { lat: 49.1951, lon: 16.6068 },
  ostrawa: { lat: 49.8209, lon: 18.2625 },
  bratyslawa: { lat: 48.1486, lon: 17.1077 },
  bratysława: { lat: 48.1486, lon: 17.1077 },
  bratislava: { lat: 48.1486, lon: 17.1077 },
  budapeszt: { lat: 47.4979, lon: 19.0402 },
  budapest: { lat: 47.4979, lon: 19.0402 },
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  rotterdam: { lat: 51.9244, lon: 4.4777 },
  bruksela: { lat: 50.8503, lon: 4.3517 },
  brussels: { lat: 50.8503, lon: 4.3517 },
  kopenhaga: { lat: 55.6761, lon: 12.5683 },
  copenhagen: { lat: 55.6761, lon: 12.5683 },
  sztokholm: { lat: 59.3293, lon: 18.0686 },
  stockholm: { lat: 59.3293, lon: 18.0686 },
  oslo: { lat: 59.9139, lon: 10.7522 },
  bergen: { lat: 60.3913, lon: 5.3221 },
  tromso: { lat: 69.6492, lon: 18.9553 },
  tromsø: { lat: 69.6492, lon: 18.9553 },
  helsinki: { lat: 60.1699, lon: 24.9384 },
  reykjavik: { lat: 64.1466, lon: -21.9426 },
  tallinn: { lat: 59.4370, lon: 24.7536 },
  ryga: { lat: 56.9496, lon: 24.1052 },
  riga: { lat: 56.9496, lon: 24.1052 },
  wilno: { lat: 54.6872, lon: 25.2797 },
  vilnius: { lat: 54.6872, lon: 25.2797 },
  ateny: { lat: 37.9838, lon: 23.7275 },
  athens: { lat: 37.9838, lon: 23.7275 },
  zagrzeb: { lat: 45.8150, lon: 15.9819 },
  zagreb: { lat: 45.8150, lon: 15.9819 },
  dubrownik: { lat: 42.6507, lon: 18.0944 },
  dubrovnik: { lat: 42.6507, lon: 18.0944 },
  split: { lat: 43.5081, lon: 16.4402 },
  zadar: { lat: 44.1194, lon: 15.2314 },
  lublana: { lat: 46.0569, lon: 14.5058 },
  ljubljana: { lat: 46.0569, lon: 14.5058 },
  belgrad: { lat: 44.7866, lon: 20.4489 },
  belgrade: { lat: 44.7866, lon: 20.4489 },
  sarajewo: { lat: 43.8563, lon: 18.4131 },
  sarajevo: { lat: 43.8563, lon: 18.4131 },
  kotor: { lat: 42.4247, lon: 18.7712 },
  sofia: { lat: 42.6977, lon: 23.3219 },
  bukareszt: { lat: 44.4268, lon: 26.1025 },
  bucharest: { lat: 44.4268, lon: 26.1025 },
  valletta: { lat: 35.8992, lon: 14.5141 },
  stambul: { lat: 41.0082, lon: 28.9784 },
  stambuł: { lat: 41.0082, lon: 28.9784 },
  istanbul: { lat: 41.0082, lon: 28.9784 },

  // ŚWIAT
  'nowy jork': { lat: 40.7128, lon: -74.0060 },
  'new york': { lat: 40.7128, lon: -74.0060 },
  nyc: { lat: 40.7128, lon: -74.0060 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  chicago: { lat: 41.8781, lon: -87.6298 },
  miami: { lat: 25.7617, lon: -80.1918 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  tokio: { lat: 35.6762, lon: 139.6503 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  dubaj: { lat: 25.2048, lon: 55.2708 },
  dubai: { lat: 25.2048, lon: 55.2708 },
  singapur: { lat: 1.3521, lon: 103.8198 },
  singapore: { lat: 1.3521, lon: 103.8198 },
  sydney: { lat: -33.8688, lon: 151.2093 },
};

// ODZWIERCIEDLENIE NAZW PAŃSTW NA ICH GŁÓWNE STOLICE / WĘZŁY
export const COUNTRY_HUBS: Record<string, Coordinates> = {
  polska: { lat: 52.2297, lon: 21.0122 },
  poland: { lat: 52.2297, lon: 21.0122 },
  polski: { lat: 52.2297, lon: 21.0122 },
  wlochy: { lat: 41.9028, lon: 12.4964 },
  włochy: { lat: 41.9028, lon: 12.4964 },
  italy: { lat: 41.9028, lon: 12.4964 },
  italia: { lat: 41.9028, lon: 12.4964 },
  rosja: { lat: 55.7558, lon: 37.6173 },
  russia: { lat: 55.7558, lon: 37.6173 },
  niemcy: { lat: 52.5200, lon: 13.4050 },
  germany: { lat: 52.5200, lon: 13.4050 },
  francja: { lat: 48.8566, lon: 2.3522 },
  france: { lat: 48.8566, lon: 2.3522 },
  hiszpania: { lat: 40.4168, lon: -3.7038 },
  spain: { lat: 40.4168, lon: -3.7038 },
  espana: { lat: 40.4168, lon: -3.7038 },
  anglia: { lat: 51.5074, lon: -0.1278 },
  england: { lat: 51.5074, lon: -0.1278 },
  uk: { lat: 51.5074, lon: -0.1278 },
  'wielka brytania': { lat: 51.5074, lon: -0.1278 },
  czechy: { lat: 50.0755, lon: 14.4378 },
  czechia: { lat: 50.0755, lon: 14.4378 },
  austria: { lat: 48.2082, lon: 16.3738 },
  szwajcaria: { lat: 47.3769, lon: 8.5417 },
  holandia: { lat: 52.3676, lon: 4.9041 },
  belgia: { lat: 50.8503, lon: 4.3517 },
  portugalia: { lat: 38.7223, lon: -9.1393 },
  grecja: { lat: 37.9838, lon: 23.7275 },
  chorwacja: { lat: 45.8150, lon: 15.9819 },
  wegry: { lat: 47.4979, lon: 19.0402 },
  węgry: { lat: 47.4979, lon: 19.0402 },
  norwegia: { lat: 59.9139, lon: 10.7522 },
  szwecja: { lat: 59.3293, lon: 18.0686 },
  dania: { lat: 55.6761, lon: 12.5683 },
  finlandia: { lat: 60.1699, lon: 24.9384 },
  irlandia: { lat: 53.3498, lon: -6.2603 },
  turcja: { lat: 41.0082, lon: 28.9784 },
  usa: { lat: 40.7128, lon: -74.0060 },
  'stany zjednoczone': { lat: 40.7128, lon: -74.0060 },
  japonia: { lat: 35.6762, lon: 139.6503 },
};

// SŁOWNIK DEKLINACJI POLSKIEJ (ODMIANA PRZEZ PRZYPADKI DLA POPULARNYCH KIERUNKÓW)
export const POLISH_DECLENSIONS: Record<string, string> = {
  // Miasta
  warszawy: 'warszawa',
  warszawie: 'warszawa',
  warszawe: 'warszawa',
  warszawę: 'warszawa',
  rzymu: 'rzym',
  rzymie: 'rzym',
  moskwy: 'moskwa',
  moskwie: 'moskwa',
  moskwe: 'moskwa',
  moskwę: 'moskwa',
  krakowa: 'krakow',
  krakowie: 'krakow',
  gdanska: 'gdansk',
  gdansku: 'gdansk',
  gdańska: 'gdańsk',
  gdańsku: 'gdańsk',
  wroclawia: 'wroclaw',
  wroclawiu: 'wroclaw',
  wrocławia: 'wrocław',
  wrocławiu: 'wrocław',
  poznania: 'poznan',
  poznaniu: 'poznan',
  berlina: 'berlin',
  berlinie: 'berlin',
  paryza: 'paryz',
  paryzu: 'paryz',
  paryża: 'paryż',
  paryżu: 'paryż',
  londynu: 'londyn',
  londynie: 'londyn',
  wiednia: 'wieden',
  wiedniu: 'wieden',
  pragi: 'praga',
  pradze: 'praga',
  madrytu: 'madryt',
  madrycie: 'madryt',
  barcelony: 'barcelona',
  barcelonie: 'barcelona',
  mediolanu: 'mediolan',
  mediolanie: 'mediolan',
  aten: 'ateny',
  atenach: 'ateny',
  dubrownika: 'dubrownik',
  dubrowniku: 'dubrownik',
  wenecji: 'wenecja',
  florencji: 'florencja',
  neapolu: 'neapol',
  budapesztu: 'budapeszt',
  budapeszcie: 'budapeszt',
  // Państwa
  polski: 'polska',
  polsce: 'polska',
  polske: 'polska',
  polskę: 'polska',
  wloch: 'wlochy',
  włoch: 'włochy',
  wloszech: 'wlochy',
  włoszech: 'włochy',
  rosji: 'rosja',
  niemiec: 'niemcy',
  niemczech: 'niemcy',
  francji: 'francja',
  hiszpanii: 'hiszpania',
  grecji: 'grecja',
  chorwacji: 'chorwacja',
  austrii: 'austria',
  szwajcarii: 'szwajcaria',
  czech: 'czechy',
  czechach: 'czechy',
  portugalii: 'portugalia',
  norwegii: 'norwegia',
  szwecji: 'szwecja',
  danii: 'dania',
  finlandii: 'finlandia',
  irlandii: 'irlandia',
  turcji: 'turcja',
};

/**
 * Oblicza odległość Levenshteina między dwoma ciągami znaków.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/**
 * Czyści i normalizuje nazwę lokalizacji:
 * - Usuwa wiodące i kończące cyfry, znaki specjalne (np. "polski9" -> "polski")
 * - Konwertuje do małych liter
 * - Sprawdza polską deklinację (np. "moskwy" -> "moskwa")
 */
export function normalizePlaceQuery(query: string): string {
  if (!query) return '';
  // 1. Oczyszczenie z cyfr i znaków interpunkcyjnych
  let cleaned = query
    .trim()
    .toLowerCase()
    .replace(/[\d\-_.,!?:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  // 2. Usunięcie prefiksów typu "miasto ", "dworzec ", "lotnisko "
  cleaned = cleaned
    .replace(/^(miasto|city of|lotnisko|dworzec|stacja)\s+/i, '')
    .trim();

  // 3. Sprawdzenie deklinacji w słowniku
  if (POLISH_DECLENSIONS[cleaned]) {
    return POLISH_DECLENSIONS[cleaned];
  }

  return cleaned;
}

/**
 * Wyszukuje współrzędne w lokalnym słowniku (z tolerancją na literówki).
 */
export function findInLocalDictionary(cleaned: string): Coordinates | null {
  if (!cleaned) return null;

  // 1. Dokładne dopasowanie miast
  if (KNOWN_CITIES[cleaned]) {
    return KNOWN_CITIES[cleaned];
  }

  // 2. Dokładne dopasowanie państw
  if (COUNTRY_HUBS[cleaned]) {
    return COUNTRY_HUBS[cleaned];
  }

  // 3. Sprawdzenie deklinacji
  const baseForm = POLISH_DECLENSIONS[cleaned];
  if (baseForm) {
    if (KNOWN_CITIES[baseForm]) return KNOWN_CITIES[baseForm];
    if (COUNTRY_HUBS[baseForm]) return COUNTRY_HUBS[baseForm];
  }

  // 4. Tolerancja literówek (Levenshtein distance <= 1 lub <= 2 dla długich słów)
  const allKeys = Object.keys(KNOWN_CITIES);
  for (const key of allKeys) {
    const maxAllowed = key.length >= 7 ? 2 : 1;
    if (Math.abs(cleaned.length - key.length) <= maxAllowed) {
      if (calculateLevenshteinDistance(cleaned, key) <= maxAllowed) {
        return KNOWN_CITIES[key];
      }
    }
  }

  const countryKeys = Object.keys(COUNTRY_HUBS);
  for (const cKey of countryKeys) {
    const maxAllowed = cKey.length >= 7 ? 2 : 1;
    if (Math.abs(cleaned.length - cKey.length) <= maxAllowed) {
      if (calculateLevenshteinDistance(cleaned, cKey) <= maxAllowed) {
        return COUNTRY_HUBS[cKey];
      }
    }
  }

  return null;
}

/**
 * Główna funkcja geokodowania (Offline First + Nominatim Fallback).
 */
export async function resolveCoordinates(query: string): Promise<Coordinates | null> {
  if (!query || !query.trim()) return null;

  const normalized = normalizePlaceQuery(query);
  if (!normalized) return null;

  // 1. Krok: Sprawdzenie słownika lokalnego (0 ms, 100% niezawodności)
  const local = findInLocalDictionary(normalized);
  if (local) {
    return local;
  }

  // 2. Krok: Bezpieczny fallback do OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      normalized
    )}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DestivoTravelApp/1.0 (contact@destivo.io; travel planner app)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      // Wybieramy wynik o najwyższej randze ważności (omija małe przysiółki)
      const sorted = [...data].sort((a, b) => {
        const impA = typeof a.importance === 'number' ? a.importance : 0;
        const impB = typeof b.importance === 'number' ? b.importance : 0;
        return impB - impA;
      });
      return {
        lat: parseFloat(sorted[0].lat),
        lon: parseFloat(sorted[0].lon),
      };
    }
  } catch (error) {
    console.warn(`Geocoding error for ${query}:`, error);
  }

  return null;
}

/**
 * Oblicza odległość ortodromiczną w linii prostej (Haversine) w kilometrach.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
}

export interface StationInfo {
  hasStation: boolean;
  stationName?: string;
  stationDistanceKm?: number;
}

/**
 * Weryfikuje obecność stacji kolejowej w miejscowości docelowej lub w jej pobliżu (do 20 km).
 * Zabezpiecza przed generowaniem fałszywych połączeń kolejowych do małych wsi bez infrastruktury.
 */
export async function checkDestinationStation(
  destination: string,
  destCoords?: Coordinates | null
): Promise<StationInfo> {
  if (!destination || !destination.trim()) {
    return { hasStation: false };
  }

  const normalized = normalizePlaceQuery(destination);
  // 1. Sprawdzenie czy miejscowość znajduje się w głównym słowniku miast (wszystkie mają stacje)
  if (KNOWN_CITIES[normalized]) {
    return { hasStation: true, stationName: destination };
  }

  if (!destCoords || typeof destCoords.lat !== 'number' || typeof destCoords.lon !== 'number') {
    return { hasStation: false };
  }

  // W środowisku testowym (NODE_ENV === 'test') unikamy niepotrzebnych zapytań sieciowych
  if (process.env.NODE_ENV === 'test') {
    return { hasStation: false };
  }

  const googleApiKey = getGoogleApiKey();

  // 2. Sprawdzenie stacji przez Google Places API Nearby Search (promień 20 km)
  if (googleApiKey && !googleApiKey.includes('TYMCZASOWY')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${destCoords.lat},${destCoords.lon}&radius=20000&type=train_station&key=${googleApiKey}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          const nearest = data.results[0];
          const stLat = nearest.geometry?.location?.lat;
          const stLon = nearest.geometry?.location?.lng;
          let dist = 0;
          if (typeof stLat === 'number' && typeof stLon === 'number') {
            dist = calculateDistanceKm(destCoords.lat, destCoords.lon, stLat, stLon);
          }

          const stName = nearest.name || 'Stacja kolejowa';
          const nameMatches = stName.toLowerCase().includes(normalized);

          if (dist <= 3 && nameMatches) {
            return { hasStation: true, stationName: stName, stationDistanceKm: dist };
          }

          // Stacja w sąsiedniej miejscowości (stacja przesiadkowa)
          return {
            hasStation: false,
            stationName: stName,
            stationDistanceKm: dist,
          };
        }
      }
    } catch {
      // Ignorujemy błędy sieciowe, przechodzimy do fallbacku
    }
  }

  return { hasStation: false };
}

/**
 * Generuje realistyczny zestaw opcji transportowych na podstawie rzeczywistego dystansu oraz dostępności stacji.
 * 
 * Reguły doboru transportu:
 * - < 120 km: Samochód (trasa lokalna)
 * - 120 - 500 km:
 *   - Jeśli cel to wieś/brak stacji: Samochód (rekomendowany) + ewentualnie Pociąg z przesiadką do stacji w sąsiedztwie
 *   - Jeśli cel posiada stację: Pociąg (rekomendowany) + Samochód
 * - 500 - 800 km: Samolot (rekomendowany na czas) + Pociąg międzynarodowy (jeśli stacja) + Samochód
 * - > 800 km: Samolot (rekomendowany) + Samochód (dla fanów długich tras roadtrip)
 */
export function determineTransportRecommendations(
  origin: string,
  destination: string,
  distanceKm: number,
  stationInfo?: StationInfo
): RawTransportRoute[] {
  if (distanceKm <= 0) return [];

  const routes: RawTransportRoute[] = [];

  if (distanceKm < 120) {
    // 1. TRASY KRÓTKIE / LOKALNE (< 120 km) -> Samochód
    routes.push({
      type: 'car',
      provider: 'Własny samochód',
      bookingUrl: '',
      actionLinks: [
        {
          label: `Nawiguj do: ${destination}`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
        },
      ],
      notes: [
        `Trasa lokalna (~${distanceKm} km). Najwygodniej udać się bezpośrednio własnym samochodem.`,
      ],
    });
  } else if (distanceKm >= 120 && distanceKm <= 500) {
    // 2. TRASY ŚREDNIE / KRAJOWE (120 - 500 km)
    const isStationAvailable = stationInfo ? stationInfo.hasStation : true;
    const nearbyStationName = stationInfo?.stationName;
    const nearbyStationDist = stationInfo?.stationDistanceKm;

    if (!isStationAvailable) {
      // Przypadek małej wsi / braku bezpośredniej stacji kolejowej:
      // Rekomendowany jest własny samochód!
      routes.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          {
            label: `Nawiguj do: ${destination}`,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
          },
        ],
        notes: [
          `Miejscowość bez bezpośredniej stacji kolejowej. Najwygodniejszy dojazd własnym samochodem (~${distanceKm} km).`,
        ],
      });

      // Jeśli w pobliżu (do 20 km) istnieje stacja przesiadkowa, dodajemy opcję łączoną:
      if (nearbyStationName && nearbyStationDist !== undefined && nearbyStationDist <= 20) {
        routes.push({
          type: 'train',
          provider: 'Pociąg + dojazd lokalny (PKP / Koleo)',
          bookingUrl: 'https://koleo.pl',
          actionLinks: [
            {
              label: `Pokaż stację w: ${origin}`,
              url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}`,
            },
            {
              label: `Stacja przesiadkowa: ${nearbyStationName}`,
              url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(nearbyStationName)}`,
            },
          ],
          notes: [
            `Pociąg + dojazd lokalny. Najbliższa stacja: ${nearbyStationName} (~${nearbyStationDist} km od celu).`,
          ],
        });
      }
    } else {
      // Standardowa trasa miejska / krajowa ze stacją kolejową:
      routes.push({
        type: 'train',
        provider: 'PKP Intercity / Koleo',
        bookingUrl: 'https://koleo.pl',
        actionLinks: [
          {
            label: `Pokaż stację w: ${origin}`,
            url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}`,
          },
          {
            label: `Pokaż stację w: ${destination}`,
            url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(destination)}`,
          },
        ],
        notes: [
          `Rekomendowane połączenie kolejowe (~${distanceKm} km). Sprawdź bilety na Koleo.`,
        ],
      });

      routes.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          {
            label: `Nawiguj do: ${destination}`,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
          },
        ],
        notes: [`Podróż własnym samochodem z punktu A do B (~${distanceKm} km).`],
      });
    }
  } else if (distanceKm > 500 && distanceKm <= 800) {
    // 3. TRASY TRANSGRANICZNE / ŚREDNIO-DALEKIE (500 - 800 km) -> Samolot + Pociąg + Samochód
    routes.push({
      type: 'flight',
      provider: 'Połączenie lotnicze (Skyscanner)',
      bookingUrl: 'https://www.skyscanner.pl',
      actionLinks: [
        {
          label: `Lotnisko w okolicach: ${origin}`,
          url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(origin)}`,
        },
        {
          label: `Lotnisko w okolicach: ${destination}`,
          url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(destination)}`,
        },
      ],
      notes: [
        `Trasa daleka/międzynarodowa (~${distanceKm} km). Sprawdź loty na Skyscanner.`,
      ],
    });

    const isStationAvailable = stationInfo ? stationInfo.hasStation : true;
    if (isStationAvailable) {
      routes.push({
        type: 'train',
        provider: 'Połączenie kolejowe (PKP / Koleo)',
        bookingUrl: 'https://koleo.pl',
        actionLinks: [
          {
            label: `Pokaż stację w: ${origin}`,
            url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}`,
          },
          {
            label: `Pokaż stację w: ${destination}`,
            url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(destination)}`,
          },
        ],
        notes: [
          `Rekomendowane połączenie kolejowe (~${distanceKm} km). Sprawdź bilety na Koleo.`,
        ],
      });
    }

    routes.push({
      type: 'car',
      provider: 'Własny samochód (Roadtrip)',
      bookingUrl: '',
      actionLinks: [
        {
          label: `Nawiguj do: ${destination}`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
        },
      ],
      notes: [`Dla fanów długich tras samochodowych (~${distanceKm} km).`],
    });
  } else {
    // 4. TRASY DALEKIE / MIĘDZYNARODOWE (> 800 km) -> Samolot (rekomendowany) + Samochód (Roadtrip)
    routes.push({
      type: 'flight',
      provider: 'Połączenie lotnicze (Skyscanner)',
      bookingUrl: 'https://www.skyscanner.pl',
      actionLinks: [
        {
          label: `Lotnisko w okolicach: ${origin}`,
          url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(origin)}`,
        },
        {
          label: `Lotnisko w okolicach: ${destination}`,
          url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(destination)}`,
        },
      ],
      notes: [
        `Trasa daleka/międzynarodowa (~${distanceKm} km). Sprawdź loty na Skyscanner.`,
      ],
    });

    routes.push({
      type: 'car',
      provider: 'Własny samochód (Roadtrip)',
      bookingUrl: '',
      actionLinks: [
        {
          label: `Nawiguj do: ${destination}`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
        },
      ],
      notes: [`Dla fanów długich tras samochodowych (~${distanceKm} km).`],
    });
  }

  return routes;
}
