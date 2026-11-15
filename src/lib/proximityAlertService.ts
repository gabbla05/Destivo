// src/lib/proximityAlertService.ts
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';

// Konfiguracja obsługi powiadomień na pierwszym planie (foreground notifications)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    } as any),
  });
} catch (handlerErr) {
  console.warn('Error setting notification handler:', handlerErr);
}

export const GEOFENCING_TASK_NAME = 'DESTIVO_GEOFENCING_TASK';
export const NOTIFICATION_STORAGE_KEY_PREFIX = '@destivo_proximity_notif_';
export const GEOFENCE_STORAGE_KEY_PREFIX = '@destivo_proximity_geofence_';

export interface ProximityCheckResult {
  shouldAlert: boolean;
  reason: 'LOCATION' | 'TIME' | 'BOTH' | 'NONE' | 'NOTIFICATION';
  tripId?: string;
  minutesUntilDeparture: number | null;
  distanceMeters: number | null;
  stationName: string;
  ticketFile: any | null;
  departureTime: string;
  destination: string;
  transportType: string;
  activeLeg?: 'outbound' | 'return';
  outboundTicket?: any;
  returnTicket?: any;
  outboundDepartureTime?: string;
  returnDepartureTime?: string;
  outboundStation?: string;
  returnStation?: string;
}

export interface HubCoordinates {
  lat: number;
  lon: number;
}

// Baza znanych węzłów komunikacyjnych (szybki fallback offline bez czekania na sieć)
const KNOWN_HUBS: Record<string, HubCoordinates> = {
  // Lotniska
  'okecie': { lat: 52.1672, lon: 20.9679 },
  'chopin': { lat: 52.1672, lon: 20.9679 },
  'lotnisko chopina': { lat: 52.1672, lon: 20.9679 },
  'modlin': { lat: 52.4511, lon: 20.6518 },
  'balice': { lat: 50.0777, lon: 19.7848 },
  'krakow airport': { lat: 50.0777, lon: 19.7848 },
  'gdansk airport': { lat: 54.3776, lon: 18.4662 },
  'rebiechowo': { lat: 54.3776, lon: 18.4662 },
  'wroclaw airport': { lat: 51.1027, lon: 16.8858 },
  'strachowice': { lat: 51.1027, lon: 16.8858 },
  'pyrzowice': { lat: 50.4743, lon: 19.0800 },
  'katowice airport': { lat: 50.4743, lon: 19.0800 },
  'poznan airport': { lat: 52.4210, lon: 16.8260 },
  'lawica': { lat: 52.4210, lon: 16.8260 },
  'charles de gaulle': { lat: 49.0097, lon: 2.5479 },
  'cdg': { lat: 49.0097, lon: 2.5479 },
  'orly': { lat: 48.7262, lon: 2.3652 },
  'fiumicino': { lat: 41.8003, lon: 12.2389 },
  'ciampino': { lat: 41.7994, lon: 12.5949 },
  'el prat': { lat: 41.2974, lon: 2.0833 },
  'heathrow': { lat: 51.4700, lon: -0.4543 },
  'gatwick': { lat: 51.1537, lon: -0.1821 },
  // Dworce kolejowe
  'warszawa centralna': { lat: 52.2288, lon: 21.0032 },
  'warszawa zachodnia': { lat: 52.2195, lon: 20.9658 },
  'warszawa wschodnia': { lat: 52.2519, lon: 21.0524 },
  'krakow glowny': { lat: 50.0667, lon: 19.9483 },
  'kraków główny': { lat: 50.0667, lon: 19.9483 },
  'gdansk glowny': { lat: 54.3556, lon: 18.6444 },
  'gdańsk główny': { lat: 54.3556, lon: 18.6444 },
  'wroclaw glowny': { lat: 51.0989, lon: 17.0367 },
  'wrocław główny': { lat: 51.0989, lon: 17.0367 },
  'poznan glowny': { lat: 52.4022, lon: 16.9125 },
  'poznań główny': { lat: 52.4022, lon: 16.9125 },
  'katowice': { lat: 50.2575, lon: 19.0175 },
};

/**
 * Oblicza odległość w metrach między dwoma punktami geograficznymi (formuła Haversine)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Promień Ziemi w metrach
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Zwraca promień strefy geofence (w metrach) w zależności od rodzaju transportu.
 * Lotniska wymagają większego promienia z uwagi na wielkość terminali i parkingów.
 */
/**
 * Rodzaj transportu podróży. Wiersze z bazy nie mają kolumny transport_type - typ jest zapisany
 * w transport_data.selectedOption.type (bez tego lotnisko dostawało promień dworca: 600 m zamiast 1,5 km).
 */
export function resolveTripTransportType(trip: any): string {
  if (trip?.transport_type) return String(trip.transport_type);
  try {
    const td = typeof trip?.transport_data === 'string'
      ? JSON.parse(trip.transport_data || '{}')
      : trip?.transport_data || {};
    return td?.selectedOption?.type || 'train';
  } catch {
    return 'train';
  }
}

export function getGeofenceRadiusForTransport(transportType?: string): number {
  switch (transportType?.toLowerCase()) {
    case 'flight':
      return 1500; // 1.5 km dla lotnisk
    case 'train':
      return 600; // 600 m dla dworców kolejowych
    case 'bus':
      return 500; // 500 m dla dworców autobusowych
    default:
      return 600;
  }
}

/**
 * Sanityzuje format godziny (np. '22.20' lub '22,20' -> '22:20').
 */
export function sanitizeTimeStr(timeStr?: string): string {
  if (!timeStr) return '';
  return timeStr.trim().replace(/[.,]/g, ':');
}

/**
 * Parsuje datę rozpoczęcia podróży oraz godzinę odjazdu do obiektu Date.
 */
export function parseDepartureDateTime(
  startDateStr?: string,
  departureTimeStr?: string
): Date | null {
  if (!startDateStr) return null;

  try {
    const cleanDate = startDateStr.replace(/\./g, '-').trim();
    const parts = cleanDate.split('-');
    let year: number;
    let month: number;
    let day: number;

    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    } else {
      return null;
    }

    let hours = 12;
    let minutes = 0;

    if (departureTimeStr && departureTimeStr.trim()) {
      const cleanTime = sanitizeTimeStr(departureTimeStr);
      const timeParts = cleanTime.split(':');
      if (timeParts.length >= 2) {
        const h = parseInt(timeParts[0], 10);
        const m = parseInt(timeParts[1], 10);
        if (!isNaN(h) && !isNaN(m)) {
          hours = h;
          minutes = m;
        }
      }
    }

    return new Date(year, month, day, hours, minutes, 0, 0);
  } catch {
    return null;
  }
}

/**
 * Wyszukuje współrzędne węzła komunikacyjnego (dworzec / lotnisko).
 * Najpierw sprawdza lokalny słownik offline (0 opóźnienia), a w razie braku pyta Nominatim.
 */
export async function resolveHubCoordinates(
  stationQuery?: string,
  city?: string
): Promise<HubCoordinates | null> {
  const query = (stationQuery || city || '').toLowerCase().trim();
  if (!query) return null;

  // 1. Sprawdzenie znanych węzłów offline
  for (const [key, coords] of Object.entries(KNOWN_HUBS)) {
    if (query.includes(key) || key.includes(query)) {
      return coords;
    }
  }

  // 2. Dynamiczne geokodowanie online jako fallback
  try {
    const searchParam = encodeURIComponent(`${stationQuery || ''} ${city || ''}`.trim());
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${searchParam}&limit=1`,
      {
        headers: { 'User-Agent': 'DestivoApp/1.0' },
      }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
  } catch (err) {
    console.warn('Geocoding hub error:', err);
  }

  return null;
}

/**
 * Szuka powiązanego z wyjazdem biletu w transporcie lub w Sejfie (Travel Day Pass).
 * Obsługuje rozróżnienie biletu na wyjazd (TAM) i na powrót (POWRÓT).
 */
export function findActiveTicketForTrip(
  trip: any,
  now: Date = new Date()
): {
  file: any;
  source: 'transport' | 'vault';
  departureTime: string;
  stationName: string;
  activeLeg: 'outbound' | 'return';
  outboundTicket?: any;
  returnTicket?: any;
  outboundDepartureTime?: string;
  returnDepartureTime?: string;
  outboundStation?: string;
  returnStation?: string;
} | null {
  if (!trip) return null;

  try {
    // 1. Sprawdź transport_data oraz timeline
    const transportData =
      typeof trip.transport_data === 'string'
        ? JSON.parse(trip.transport_data || '{}')
        : trip.transport_data || {};
    const details = transportData.details || {};

    let timelineEvents: any[] = [];
    try {
      const attractionsData =
        typeof trip.attractions_data === 'string'
          ? JSON.parse(trip.attractions_data || '{}')
          : trip.attractions_data || {};
      timelineEvents = attractionsData.customTimeline || [];
    } catch {}

    const depEvent = timelineEvents.find((e: any) => e.type === 'DEPARTURE');
    const retEvent = timelineEvents.find((e: any) => e.type === 'RETURN');

    const outboundDepartureTime =
      sanitizeTimeStr(details.outboundDepartureTime) ||
      sanitizeTimeStr(depEvent?.timeStr) ||
      '08:00';
    const outboundStation =
      details.outboundDepartureLocation ||
      depEvent?.subtitle ||
      trip.origin ||
      'Stacja / Lotnisko';

    const returnDepartureTime =
      sanitizeTimeStr(details.returnDepartureTime) ||
      sanitizeTimeStr(retEvent?.timeStr) ||
      '12:00';
    const returnStation =
      details.returnDepartureLocation ||
      retEvent?.subtitle ||
      trip.destination ||
      'Stacja / Lotnisko';

    // 2. Sprawdź pliki w Sejfie (lodging_data.vaultFiles)
    const lodgingData =
      typeof trip.lodging_data === 'string'
        ? JSON.parse(trip.lodging_data || '{}')
        : trip.lodging_data || {};
    const vaultFiles: any[] = lodgingData.vaultFiles || trip.vaultFiles || [];

    let outboundTicket = details.outboundTicketFile || details.ticketFile || null;
    let returnTicket = details.returnTicketFile || null;

    const isTicketLike = (name?: string) => {
      const n = (name || '').toLowerCase();
      return (
        n.includes('bilet') ||
        n.includes('ticket') ||
        n.includes('pass') ||
        n.includes('boarding') ||
        n.includes('lot') ||
        n.includes('pkp') ||
        n.includes('train') ||
        n.includes('flight')
      );
    };

    if (!outboundTicket) {
      outboundTicket =
        vaultFiles.find((f: any) =>
          f.tag === 'OUTBOUND_TICKET' ||
          (f.name && /tam|wyjazd|outbound|departure|wylot/i.test(f.name))
        ) || null;
    }

    if (!returnTicket) {
      returnTicket =
        vaultFiles.find((f: any) =>
          f.tag === 'RETURN_TICKET' ||
          (f.name && /powrot|powrót|return|inbound|przylot/i.test(f.name))
        ) || null;
    }

    // Fallback: jeśli nadal nie przypisano, szukamy dowolnego biletu w Sejfie
    if (!outboundTicket && vaultFiles.length > 0) {
      outboundTicket = vaultFiles.find((f: any) => isTicketLike(f.name)) || vaultFiles[0];
    }
    if (!returnTicket && vaultFiles.length > 1 && outboundTicket !== vaultFiles[1]) {
      returnTicket = vaultFiles.find((f: any) => f !== outboundTicket && isTicketLike(f.name)) || vaultFiles[1];
    }

    // Wyznaczanie aktywnego odcinka podróży (TAM vs POWRÓT)
    const outboundDate = parseDepartureDateTime(trip.start_date, outboundDepartureTime);
    const returnDate = parseDepartureDateTime(trip.end_date, returnDepartureTime);

    let activeLeg: 'outbound' | 'return' = 'outbound';
    if (outboundDate && returnDate) {
      const outboundPassed = now.getTime() > outboundDate.getTime() + 4 * 60 * 60 * 1000;
      const returnUpcoming = returnDate.getTime() >= now.getTime() - 2 * 60 * 60 * 1000;
      if (outboundPassed && returnUpcoming) {
        activeLeg = 'return';
      }
    } else if (!outboundDate && returnDate) {
      activeLeg = 'return';
    }

    const activeFile =
      activeLeg === 'return'
        ? (returnTicket || outboundTicket)
        : (outboundTicket || returnTicket);

    const activeDepartureTime =
      activeLeg === 'return' ? returnDepartureTime : outboundDepartureTime;
    const activeStation =
      activeLeg === 'return' ? returnStation : outboundStation;
    const hasTransportTicket = Boolean(
      activeLeg === 'return'
        ? details.returnTicketFile
        : (details.outboundTicketFile || details.ticketFile)
    );
    const source: 'transport' | 'vault' = hasTransportTicket ? 'transport' : 'vault';

    return {
      file: activeFile,
      source,
      departureTime: activeDepartureTime,
      stationName: activeStation,
      activeLeg,
      outboundTicket,
      returnTicket,
      outboundDepartureTime,
      returnDepartureTime,
      outboundStation,
      returnStation,
    };
  } catch {
    return null;
  }
}

/**
 * Sprawdza czy użytkownik kwalifikuje się do alertu zbliżeniowego (Proximity Alert).
 * Uwzględnia:
 * 1. Okno czasowe (np. do 90 minut przed odjazdem lub do 30 min po odjeździe)
 * 2. Odległość fizyczną od węzła (jeśli współrzędne użytkownika są dostępne)
 */
export async function checkProximityStatus(
  trip: any,
  userCoords?: { latitude: number; longitude: number } | null,
  now: Date = new Date()
): Promise<ProximityCheckResult> {
  const fallbackResult: ProximityCheckResult = {
    shouldAlert: false,
    reason: 'NONE',
    minutesUntilDeparture: null,
    distanceMeters: null,
    stationName: trip?.origin || 'Stacja',
    ticketFile: null,
    departureTime: '',
    destination: trip?.destination || '',
    transportType: trip?.transport_type || 'train',
  };

  if (!trip) return fallbackResult;

  const ticketData = findActiveTicketForTrip(trip, now);
  const activeLeg = ticketData?.activeLeg || 'outbound';
  const stationName = ticketData?.stationName || trip.origin || 'Stacja';
  const departureTime = ticketData?.departureTime || '12:00';
  const transportType = resolveTripTransportType(trip);

  fallbackResult.stationName = stationName;
  fallbackResult.ticketFile = ticketData?.file || null;
  fallbackResult.departureTime = departureTime;
  fallbackResult.destination = activeLeg === 'return' ? (trip.origin || 'Powrót') : (trip.destination || '');
  fallbackResult.transportType = transportType;
  fallbackResult.activeLeg = activeLeg;
  fallbackResult.outboundTicket = ticketData?.outboundTicket;
  fallbackResult.returnTicket = ticketData?.returnTicket;
  fallbackResult.outboundDepartureTime = ticketData?.outboundDepartureTime;
  fallbackResult.returnDepartureTime = ticketData?.returnDepartureTime;
  fallbackResult.outboundStation = ticketData?.outboundStation;
  fallbackResult.returnStation = ticketData?.returnStation;

  const targetDateStr = activeLeg === 'return' ? (trip.end_date || trip.start_date) : trip.start_date;
  const departureDate = parseDepartureDateTime(targetDateStr, departureTime);
  let timeAlert = false;
  let minutesUntil: number | null = null;

  if (departureDate) {
    const diffMs = departureDate.getTime() - now.getTime();
    minutesUntil = Math.round(diffMs / (1000 * 60));
    fallbackResult.minutesUntilDeparture = minutesUntil;

    // Okno czasowe: od 90 minut przed odjazdem do 30 minut po planowanym odjeździe
    if (minutesUntil >= -30 && minutesUntil <= 90) {
      timeAlert = true;
    }
  }

  let locationAlert = false;
  let distanceMeters: number | null = null;

  if (userCoords?.latitude && userCoords?.longitude) {
    const hubCoords = await resolveHubCoordinates(stationName, trip.origin);
    if (hubCoords) {
      distanceMeters = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        hubCoords.lat,
        hubCoords.lon
      );
      fallbackResult.distanceMeters = distanceMeters;
      const radius = getGeofenceRadiusForTransport(transportType);
      if (distanceMeters <= radius) {
        locationAlert = true;
      }
    }
  }

  if (timeAlert && locationAlert) {
    return { ...fallbackResult, shouldAlert: true, reason: 'BOTH' };
  } else if (locationAlert) {
    return { ...fallbackResult, shouldAlert: true, reason: 'LOCATION' };
  } else if (timeAlert) {
    return { ...fallbackResult, shouldAlert: true, reason: 'TIME' };
  }

  return fallbackResult;
}

/**
 * Weryfikuje i w razie potrzeby prosi użytkownika o uprawnienia do powiadomień (w tym Android 13+ POST_NOTIFICATIONS oraz iOS).
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }
    const { status: requestedStatus } = await Notifications.requestPermissionsAsync();
    if (requestedStatus !== 'granted') {
      console.warn('Destivo: Brak uprawnień do powiadomień systemowych (POST_NOTIFICATIONS na Androidzie 13+).');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Destivo: Błąd weryfikacji uprawnień powiadomień:', err);
    return false;
  }
}

/**
 * Planuje lokalne powiadomienie offline na czas przed odjazdem (np. T-60 min).
 * Działa w 100% lokalnie na urządzeniu, nie wymaga serwera push i działa w trybie offline!
 */
export async function scheduleLocalDepartureNotification(
  trip: any,
  language: 'pl' | 'en' = 'pl'
): Promise<string | null> {
  if (!trip || Platform.OS === 'web') return null;

  try {
    const ticketData = findActiveTicketForTrip(trip);
    const activeLeg = ticketData?.activeLeg || 'outbound';
    const targetDateStr = activeLeg === 'return' ? (trip.end_date || trip.start_date) : trip.start_date;
    const departureTime = ticketData?.departureTime || '12:00';
    const departureDate = parseDepartureDateTime(targetDateStr, departureTime);
    if (!departureDate) return null;

    const now = new Date();
    const diffMs = departureDate.getTime() - now.getTime();
    const minutesUntil = Math.round(diffMs / (60 * 1000));

    // Jeśli podróż odjechała ponad 60 minut temu, nie planujemy powiadomienia
    if (minutesUntil < -60) {
      return null;
    }

    // Wyczyść ewentualne stare wygasłe powiadomienia
    await dismissExpiredDepartureNotifications().catch(() => {});

    // Weryfikacja i żądanie uprawnień do powiadomień (Android 13+ POST_NOTIFICATIONS oraz iOS)
    const hasPermission = await ensureNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const storageKey = `${NOTIFICATION_STORAGE_KEY_PREFIX}${trip.id}`;
    const deliveredKey = `${storageKey}_delivered_${departureDate.getTime()}`;

    // Anulujemy ewentualne poprzednie zaplanowane powiadomienie dla tej podróży
    const existingNotifId = await AsyncStorage.getItem(storageKey);
    if (existingNotifId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(existingNotifId);
      } catch {}
    }

    const t = translations[language]?.proximityAlert || translations.pl.proximityAlert;

    // Konfiguracja kanału powiadomień w systemie Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('destivo-proximity-alerts', {
        name: t.channelName || 'Destivo Proximity Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#38BDF8',
      });
    }

    // Treść powiadomienia
    const title = (t.notificationTitle || 'Bilet gotowy: {{destination}}').replace(
      '{{destination}}',
      trip.destination || ''
    );

    let body = '';
    let trigger: Notifications.NotificationTriggerInput;

    if (minutesUntil <= 60) {
      // Jeśli powiadomienie natychmiastowe zostało już wcześniej wysłane dla tego wyjazdu, unikamy powtórnego spamu
      const alreadyDelivered = await AsyncStorage.getItem(deliveredKey);
      if (alreadyDelivered === 'true') {
        return null;
      }

      if (minutesUntil <= 0) {
        body = (
          t.notificationBodyTimeNow ||
          'Twój transport do {{destination}} właśnie odjechał/odjeżdża! Dotknij, aby natychmiast okazać bilet.'
        ).replace('{{destination}}', trip.destination || '');
      } else {
        body = (
          t.notificationBodyTime ||
          'Twój transport do {{destination}} odjeżdża za {{minutes}} minut. Dotknij, aby okazać bilet.'
        )
          .replace('{{destination}}', trip.destination || '')
          .replace('{{minutes}}', String(minutesUntil));
      }

      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
      };

      await AsyncStorage.setItem(deliveredKey, 'true');
    } else {
      // Odjazd w dalszej przyszłości (> 60 minut) -> planujemy na T-60 min
      const triggerDate = new Date(departureDate.getTime() - 60 * 60 * 1000);
      body = (
        t.notificationBodyTime ||
        'Twój transport do {{destination}} odjeżdża za {{minutes}} minut. Dotknij, aby okazać bilet.'
      )
        .replace('{{destination}}', trip.destination || '')
        .replace('{{minutes}}', '60');

      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      };
    }

    const expiresAt = departureDate.getTime() + 60 * 60 * 1000; // 1 godzina po odjeździe / wylocie

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        channelId: 'destivo-proximity-alerts',
        autoDismiss: false,
        sticky: true,
        data: {
          tripId: trip.id,
          ticketFile: ticketData?.file,
          type: 'PROXIMITY_ALERT',
          departureTime: ticketData?.departureTime || '12:00',
          stationName: ticketData?.stationName || trip.origin || '',
          destination: trip.destination || '',
          transportType: trip.transport_type || 'train',
          activeLeg: ticketData?.activeLeg || 'outbound',
          outboundTicket: ticketData?.outboundTicket || null,
          returnTicket: ticketData?.returnTicket || null,
          outboundDepartureTime: ticketData?.outboundDepartureTime,
          returnDepartureTime: ticketData?.returnDepartureTime,
          outboundStation: ticketData?.outboundStation,
          returnStation: ticketData?.returnStation,
          expiresAt,
        },
      } as any,
      trigger,
    });

    // Zapisujemy identyfikator w AsyncStorage w celu późniejszego anulowania
    await AsyncStorage.setItem(storageKey, notificationId);

    // Zaplanuj automatyczne usunięcie z paska powiadomień po upływie 1h od odjazdu
    const timeUntilExpiry = expiresAt - Date.now();
    if (timeUntilExpiry > 0 && timeUntilExpiry < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(async () => {
        try {
          await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
        } catch {}
      }, timeUntilExpiry);
      if (typeof (timer as any)?.unref === 'function') {
        (timer as any).unref();
      }
    }

    return notificationId;
  } catch (err) {
    console.warn('Error scheduling departure notification:', err);
    return null;
  }
}

/**
 * Usuwa z paska powiadomień te, dla których minęła godzina po odjeździe/wylocie.
 */
export async function dismissExpiredDepartureNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
    const now = Date.now();
    for (const notif of presented) {
      const data = notif.request?.content?.data as any;
      if (data?.type === 'PROXIMITY_ALERT' && data?.expiresAt && now > data.expiresAt) {
        await Notifications.dismissNotificationAsync(notif.request.identifier).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error dismissing expired departure notifications:', err);
  }
}

/**
 * Anuluje zaplanowane powiadomienie dla danej podróży.
 */
export async function cancelScheduledDepartureNotification(tripId: string): Promise<void> {
  if (!tripId || Platform.OS === 'web') return;

  try {
    const storageKey = `${NOTIFICATION_STORAGE_KEY_PREFIX}${tripId}`;
    const notificationId = await AsyncStorage.getItem(storageKey);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
      await AsyncStorage.removeItem(storageKey);
    }
  } catch (err) {
    console.warn('Error canceling departure notification:', err);
  }
}

/**
 * Geofencing w tle (P13): strefa wokół miejsca najbliższego odjazdu (tam lub powrót).
 *
 * - Rejestrowana tylko, gdy odjazd jest w ciągu 48 h (oszczędność baterii), użytkownik ma włączony
 *   przełącznik w profilu i dał zgodę na lokalizację "zawsze" (wymóg Androida dla geofencingu).
 * - Wejście w strefę, także przy zamkniętej aplikacji, wywołuje jedno powiadomienie z biletem.
 * - Strefa jest usuwana po odjeździe + 2 h, przy usunięciu podróży, wylogowaniu i usunięciu danych.
 */
export const GEOFENCE_SETTING_KEY = '@destivo_departure_geofence_enabled';
export const GEOFENCE_CONSENT_ASKED_KEY = '@destivo_background_location_asked';
const GEOFENCE_NOTIFIED_PREFIX = '@destivo_geofence_notified_';
const GEOFENCE_WINDOW_HOURS = 48;
const GEOFENCE_AFTER_DEPARTURE_HOURS = 2;

export interface StoredGeofence {
  regionId: string;
  tripId: string;
  leg: 'outbound' | 'return';
  stationName: string;
  destination: string;
  departureTime: string;
  expiresAt: number;
  /** Odwołanie do pliku biletu (ścieżka w Sejfie, bez zawartości). */
  ticketFile?: any;
}

/** Przełącznik "Powiadomienia o zbliżaniu się do odjazdu" (domyślnie włączony). */
export async function isDepartureGeofenceEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GEOFENCE_SETTING_KEY)) !== 'false';
  } catch {
    return true;
  }
}

export async function setDepartureGeofenceEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(GEOFENCE_SETTING_KEY, enabled ? 'true' : 'false');
  if (!enabled) await clearGeofencing();
}

/** Najbliższy odjazd podróży (tam albo powrót), dla którego warto rejestrować strefę. */
export function getUpcomingDeparture(
  trip: any,
  now: Date = new Date()
): { leg: 'outbound' | 'return'; date: Date; stationName: string; city: string; departureTime: string; ticketFile: any } | null {
  if (!trip) return null;
  const ticket = findActiveTicketForTrip(trip, now);
  const candidates = [
    {
      leg: 'outbound' as const,
      date: parseDepartureDateTime(trip.start_date, ticket?.outboundDepartureTime || ticket?.departureTime || '08:00'),
      stationName: ticket?.outboundStation || trip.origin || '',
      city: trip.origin || '',
      departureTime: ticket?.outboundDepartureTime || '08:00',
      ticketFile: ticket?.outboundTicket || ticket?.file || null,
    },
    {
      leg: 'return' as const,
      date: parseDepartureDateTime(trip.end_date, ticket?.returnDepartureTime || '12:00'),
      stationName: ticket?.returnStation || trip.destination || '',
      city: trip.destination || '',
      departureTime: ticket?.returnDepartureTime || '12:00',
      ticketFile: ticket?.returnTicket || null,
    },
  ];
  for (const c of candidates) {
    if (!c.date) continue;
    const hoursUntil = (c.date.getTime() - now.getTime()) / 3600000;
    if (hoursUntil > -GEOFENCE_AFTER_DEPARTURE_HOURS && hoursUntil <= GEOFENCE_WINDOW_HOURS) {
      return { ...c, date: c.date };
    }
  }
  return null;
}

/**
 * Zgoda na lokalizację w tle w dwóch krokach (wymóg Androida): najpierw lokalizacja podczas używania,
 * potem nasze wyjaśnienie i dopiero wtedy systemowa prośba o dostęp "zawsze".
 * Pytamy tylko raz; odmowa niczego nie blokuje (zostaje baner i powiadomienie według godziny).
 */
export async function requestBackgroundLocationConsent(
  language: 'pl' | 'en' = 'pl',
  confirm: (title: string, message: string) => Promise<boolean>
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return true;
    if ((await AsyncStorage.getItem(GEOFENCE_CONSENT_ASKED_KEY)) === 'true') return false;
    await AsyncStorage.setItem(GEOFENCE_CONSENT_ASKED_KEY, 'true');

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    const t = translations[language]?.proximityAlert || translations.pl.proximityAlert;
    const accepted = await confirm(t.bgLocationTitle, t.bgLocationMessage);
    if (!accepted) return false;

    const req = await Location.requestBackgroundPermissionsAsync();
    return req.status === 'granted';
  } catch (err) {
    console.warn('Background location consent error:', err);
    return false;
  }
}

export async function setupGeofencingForTrip(trip: any, now: Date = new Date()): Promise<boolean> {
  if (!trip?.id || Platform.OS === 'web') return false;

  try {
    if (!(await isDepartureGeofenceEnabled())) return false;

    const departure = getUpcomingDeparture(trip, now);
    if (!departure) return false;

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    const hubCoords = await resolveHubCoordinates(departure.stationName, departure.city);
    if (!hubCoords) return false;

    await ensureNotificationPermissions().catch(() => false);

    const regionId = `trip_${trip.id}_${departure.leg}`;
    const region: Location.LocationRegion = {
      identifier: regionId,
      latitude: hubCoords.lat,
      longitude: hubCoords.lon,
      radius: getGeofenceRadiusForTransport(resolveTripTransportType(trip)),
      notifyOnEnter: true,
      notifyOnExit: false,
    };

    // Jedna aktywna strefa naraz - startGeofencingAsync zastępuje poprzednie regiony zadania
    await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, [region]);

    const stored: StoredGeofence = {
      regionId,
      tripId: trip.id,
      leg: departure.leg,
      stationName: departure.stationName,
      destination: departure.leg === 'return' ? trip.origin || '' : trip.destination || '',
      departureTime: departure.departureTime,
      expiresAt: departure.date.getTime() + GEOFENCE_AFTER_DEPARTURE_HOURS * 3600000,
      ticketFile: departure.ticketFile
        ? {
            id: departure.ticketFile.id,
            name: departure.ticketFile.name,
            uri: departure.ticketFile.uri,
            type: departure.ticketFile.type,
            encryptionVersion: departure.ticketFile.encryptionVersion,
          }
        : null,
    };
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(GEOFENCE_STORAGE_KEY_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    await AsyncStorage.setItem(`${GEOFENCE_STORAGE_KEY_PREFIX}${regionId}`, JSON.stringify(stored));
    return true;
  } catch (err) {
    console.warn('Error setting up geofencing:', err);
    return false;
  }
}

/** Zatrzymuje geofencing i usuwa zapisane strefy. */
export async function clearGeofencing(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(GEOFENCE_STORAGE_KEY_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {}

  try {
    const isStarted = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK_NAME);
    if (isStarted) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
    }
  } catch (err) {
    console.warn('Error clearing geofencing:', err);
  }
}

/** Usuwa strefę danej podróży (np. po usunięciu podróży). */
export async function clearGeofencingForTrip(tripId: string): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith(`${GEOFENCE_STORAGE_KEY_PREFIX}trip_${tripId}_`)
    );
    if (keys.length > 0) await clearGeofencing();
  } catch {}
}

/** Sprzątanie stref po odjeździe (+2 h). Wywoływane przy starcie ekranu "Dziś". */
export async function cleanupExpiredGeofences(now: number = Date.now()): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(GEOFENCE_STORAGE_KEY_PREFIX));
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      const stored: StoredGeofence | null = raw ? JSON.parse(raw) : null;
      if (!stored || typeof stored.expiresAt !== 'number' || stored.expiresAt < now) {
        await clearGeofencing();
        return;
      }
    }
  } catch {}
}

/** Obsługa wejścia w strefę (wydzielona z zadania w tle, żeby dało się ją przetestować). */
export async function handleGeofenceEnter(regionId?: string): Promise<boolean> {
  if (!regionId) return false;
  const notifiedKey = `${GEOFENCE_NOTIFIED_PREFIX}${regionId}`;
  if ((await AsyncStorage.getItem(notifiedKey)) === 'true') return false;

  const raw = await AsyncStorage.getItem(`${GEOFENCE_STORAGE_KEY_PREFIX}${regionId}`);
  const stored: StoredGeofence | null = raw ? JSON.parse(raw) : null;
  if (!stored || stored.expiresAt < Date.now()) return false;

  let language: 'pl' | 'en' = 'pl';
  try {
    const auth = JSON.parse((await AsyncStorage.getItem('destivo-auth-store')) || '{}');
    if (auth?.state?.language === 'en') language = 'en';
  } catch {}
  const t = translations[language]?.proximityAlert || translations.pl.proximityAlert;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t.geofenceTitle,
      body: t.geofenceBody.replace('{{station}}', stored.stationName),
      sound: true,
      data: {
        type: 'GEOFENCE_ENTER',
        regionId,
        tripId: stored.tripId,
        activeLeg: stored.leg,
        stationName: stored.stationName,
        destination: stored.destination,
        departureTime: stored.departureTime,
        ticketFile: stored.ticketFile || null,
      },
    },
    trigger: null,
  });
  await AsyncStorage.setItem(notifiedKey, 'true');
  return true;
}

// Rejestracja zadania w tle na poziomie modułu (wymóg Expo: moduł ładowany przy starcie aplikacji)
if (Platform.OS !== 'web' && TaskManager?.defineTask) {
  try {
    TaskManager.defineTask(GEOFENCING_TASK_NAME, async ({ data, error }: any) => {
      if (error || !data) return;
      if (data.eventType === Location.GeofencingEventType?.Enter) {
        await handleGeofenceEnter(data.region?.identifier).catch(() => false);
      }
    });
  } catch (e) {
    // Ciche przechwycenie w środowiskach bez natywnego TaskManager
  }
}
