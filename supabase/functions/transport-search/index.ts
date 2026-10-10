/// <reference path="./deno-shims.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Coordinates {
  lat: number;
  lon: number;
}

// BAZA WSPÓŁRZĘDNYCH MIAST (NAZWY POLSKIE, ANGIELSKIE, LOKALNE)
const KNOWN_CITIES: Record<string, Coordinates> = {
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

// ODZWIERCIEDLENIE PAŃSTW
const COUNTRY_HUBS: Record<string, Coordinates> = {
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

// SŁOWNIK DEKLINACJI POLSKIEJ
const POLISH_DECLENSIONS: Record<string, string> = {
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

function calculateLevenshtein(a: string, b: string): number {
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

function normalizePlaceQuery(query: string): string {
  if (!query) return '';
  let cleaned = query
    .trim()
    .toLowerCase()
    .replace(/[\d\-_.,!?:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  cleaned = cleaned.replace(/^(miasto|city of|lotnisko|dworzec|stacja)\s+/i, '').trim();

  if (POLISH_DECLENSIONS[cleaned]) {
    return POLISH_DECLENSIONS[cleaned];
  }
  return cleaned;
}

function findInLocalDictionary(cleaned: string): Coordinates | null {
  if (!cleaned) return null;
  if (KNOWN_CITIES[cleaned]) return KNOWN_CITIES[cleaned];
  if (COUNTRY_HUBS[cleaned]) return COUNTRY_HUBS[cleaned];

  const baseForm = POLISH_DECLENSIONS[cleaned];
  if (baseForm) {
    if (KNOWN_CITIES[baseForm]) return KNOWN_CITIES[baseForm];
    if (COUNTRY_HUBS[baseForm]) return COUNTRY_HUBS[baseForm];
  }

  const allKeys = Object.keys(KNOWN_CITIES);
  for (const key of allKeys) {
    const maxAllowed = key.length >= 7 ? 2 : 1;
    if (Math.abs(cleaned.length - key.length) <= maxAllowed) {
      if (calculateLevenshtein(cleaned, key) <= maxAllowed) {
        return KNOWN_CITIES[key];
      }
    }
  }

  const countryKeys = Object.keys(COUNTRY_HUBS);
  for (const cKey of countryKeys) {
    const maxAllowed = cKey.length >= 7 ? 2 : 1;
    if (Math.abs(cleaned.length - cKey.length) <= maxAllowed) {
      if (calculateLevenshtein(cleaned, cKey) <= maxAllowed) {
        return COUNTRY_HUBS[cKey];
      }
    }
  }

  return null;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

async function getCoords(cityName: string): Promise<Coordinates | null> {
  if (!cityName || !cityName.trim()) return null;
  const normalized = normalizePlaceQuery(cityName);
  if (!normalized) return null;

  // 1. Sprawdzenie słownika miast offline
  const local = findInLocalDictionary(normalized);
  if (local) return local;

  // 2. OpenStreetMap Nominatim z bezpiecznym rankingiem
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalized)}&limit=5&addressdetails=1`, {
      headers: {
        'User-Agent': 'DestivoTravelApp/1.0 (contact@destivo.io; travel planner app)',
        Accept: 'application/json',
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const sorted = [...data].sort((a, b) => {
        const impA = typeof a.importance === 'number' ? a.importance : 0;
        const impB = typeof b.importance === 'number' ? b.importance : 0;
        return impB - impA;
      });
      return { lat: parseFloat(sorted[0].lat), lon: parseFloat(sorted[0].lon) };
    }
  } catch (e) {
    console.warn("Geocoding error in transport-search:", e);
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { origin, destination, originCoords, destinationCoords } = await req.json()

    if (!origin || !destination) {
      return new Response(JSON.stringify({ routes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Jeśli klient przekazał już zgeokodowane współrzędne, używamy ich bezpośrednio.
    // W przeciwnym razie pobieramy ze słownika lub Nominatim.
    let orig = (originCoords && typeof originCoords.lat === 'number') ? originCoords as Coordinates : null;
    let dest = (destinationCoords && typeof destinationCoords.lat === 'number') ? destinationCoords as Coordinates : null;

    if (!orig) orig = await getCoords(origin);
    if (!dest) dest = await getCoords(destination);

    // Jeśli lokalizacja nie została rozpoznana, zwracamy pustą listę tras zamiast fałszywego 500 km!
    if (!orig || !dest) {
      return new Response(JSON.stringify({ routes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const airDistance = calculateDistanceKm(orig.lat, orig.lon, dest.lat, dest.lon);
    if (airDistance <= 0) {
      return new Response(JSON.stringify({ routes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const transportPlan: any[] = [];

    // REALISTYCZNE KRYTERIA LOGISTYCZNE:
    // < 120 km: Auto
    // 120 - 500 km: Pociąg + Auto
    // 500 - 800 km: Samolot + Pociąg + Auto
    // > 800 km: Samolot + Auto (Roadtrip)
    if (airDistance < 120) {
      // 1. TRASY KRÓTKIE / LOKALNE (< 120 km) -> Samochód
      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Trasa lokalna (~${airDistance} km). Najwygodniej udać się bezpośrednio własnym samochodem.`]
      });
    } else if (airDistance >= 120 && airDistance <= 500) {
      // 2. TRASY ŚREDNIE / KRAJOWE (120 - 500 km) -> Pociąg + Samochód
      transportPlan.push({
        type: 'train',
        provider: 'PKP Intercity / Koleo',
        bookingUrl: 'https://koleo.pl',
        actionLinks: [
          { label: `Pokaż stację w: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}` },
          { label: `Pokaż stację w: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(destination)}` }
        ],
        notes: [`Rekomendowane połączenie kolejowe (~${airDistance} km). Sprawdź bilety na Koleo.`]
      });

      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Podróż własnym samochodem z punktu A do B (~${airDistance} km).`]
      });
    } else if (airDistance > 500 && airDistance <= 800) {
      // 3. TRASY TRANSGRANICZNE / ŚREDNIO-DALEKIE (500 - 800 km) -> Samolot + Pociąg + Samochód
      transportPlan.push({
        type: 'flight',
        provider: 'Połączenie lotnicze (Skyscanner)',
        bookingUrl: 'https://www.skyscanner.pl',
        actionLinks: [
          { label: `Lotnisko w okolicach: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(origin)}` },
          { label: `Lotnisko w okolicach: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(destination)}` }
        ],
        notes: [`Trasa daleka/międzynarodowa (~${airDistance} km). Sprawdź loty na Skyscanner.`]
      });

      transportPlan.push({
        type: 'train',
        provider: 'Połączenie kolejowe (PKP / Koleo)',
        bookingUrl: 'https://koleo.pl',
        actionLinks: [
          { label: `Pokaż stację w: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(origin)}` },
          { label: `Pokaż stację w: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Dworzec+Kolejowy+${encodeURIComponent(destination)}` }
        ],
        notes: [`Rekomendowane połączenie kolejowe (~${airDistance} km). Sprawdź bilety na Koleo.`]
      });

      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód (Roadtrip)',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Dla fanów długich tras samochodowych (~${airDistance} km).`]
      });
    } else {
      // 4. TRASY MIĘDZYNARODOWE / DALEKIE (> 800 km) -> Samolot + Samochód (Roadtrip)
      transportPlan.push({
        type: 'flight',
        provider: 'Połączenie lotnicze (Skyscanner)',
        bookingUrl: 'https://www.skyscanner.pl',
        actionLinks: [
          { label: `Lotnisko w okolicach: ${origin}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(origin)}` },
          { label: `Lotnisko w okolicach: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=Lotnisko+${encodeURIComponent(destination)}` }
        ],
        notes: [`Trasa daleka/międzynarodowa (~${airDistance} km). Sprawdź loty na Skyscanner.`]
      });

      transportPlan.push({
        type: 'car',
        provider: 'Własny samochód (Roadtrip)',
        bookingUrl: '',
        actionLinks: [
          { label: `Nawiguj do: ${destination}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` }
        ],
        notes: [`Dla fanów długich tras samochodowych (~${airDistance} km).`]
      });
    }

    return new Response(JSON.stringify({ routes: transportPlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})