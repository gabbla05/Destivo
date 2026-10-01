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
  let transportType = trip.transport_type;
  if (!transportType) {
    try {
      const td = typeof trip.transport_data === 'string' ? JSON.parse(trip.transport_data || '{}') : trip.transport_data || {};
      transportType = td.selectedOption?.type || 'train';
    } catch {
      transportType = 'train';
    }
  }

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

    // Weryfikacja i żądanie uprawnień do powiadomień (Android 13+ oraz iOS)
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Destivo: Brak uprawnień do powiadomień systemowych.');
        return null;
      }
    } catch (permErr) {
      console.warn('Destivo: Błąd weryfikacji uprawnień powiadomień:', permErr);
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
      setTimeout(async () => {
        try {
          await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
        } catch {}
      }, timeUntilExpiry);
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
 * Rejestruje sprzętowy Geofencing w systemie operacyjnym (expo-location + TaskManager).
 * Aktywowany wyłącznie w dniu podróży, aby zużycie baterii wynosiło 0% w pozostałe dni!
 */
export async function setupGeofencingForTrip(trip: any): Promise<boolean> {
  if (!trip || Platform.OS === 'web') return false;

  try {
    const ticketData = findActiveTicketForTrip(trip);
    const stationName = ticketData?.stationName || trip.origin || '';
    const departureTime = ticketData?.departureTime || '12:00';
    const departureDate = parseDepartureDateTime(trip.start_date, departureTime);

    // Sprawdzenie czy wyjazd jest w ciągu najbliższych 24 godzin (ochrona baterii)
    if (departureDate) {
      const hoursUntil = (departureDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 24 || hoursUntil < -2) {
        // Wyjazd jest zbyt daleko w przyszłości lub już minął – nie rejestrujemy geofence
        return false;
      }
    }

    const hubCoords = await resolveHubCoordinates(stationName, trip.origin);
    if (!hubCoords) return false;

    // Uprawnienia lokalizacji w tle
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    const radius = getGeofenceRadiusForTransport(trip.transport_type);

    const regions: Location.LocationRegion[] = [
      {
        identifier: `trip_${trip.id}`,
        latitude: hubCoords.lat,
        longitude: hubCoords.lon,
        radius,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ];

    await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, regions);

    const storageKey = `${GEOFENCE_STORAGE_KEY_PREFIX}${trip.id}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(regions[0]));

    return true;
  } catch (err) {
    console.warn('Error setting up geofencing:', err);
    return false;
  }
}

/**
 * Zwalnia zadanie geofencingu w tle.
 */
export async function clearGeofencing(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isStarted = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK_NAME);
    if (isStarted) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
    }
  } catch (err) {
    console.warn('Error clearing geofencing:', err);
  }
}

// Rejestracja zadania w tle TaskManager (bezpieczna dla środowisk testowych i webowych)
if (Platform.OS !== 'web' && TaskManager?.defineTask) {
  try {
    TaskManager.defineTask(
      GEOFENCING_TASK_NAME,
      async ({ data: { eventType, region } }: any) => {
        if (eventType === Location.GeofencingEventType?.Enter) {
          // Użytkownik wszedł w strefę dworca / lotniska!
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Jesteś na miejscu!',
              body: 'Twój bilet z Sejfu jest gotowy do okazania na bramce.',
              sound: true,
              data: {
                regionId: region?.identifier,
                type: 'GEOFENCE_ENTER',
              },
            },
            trigger: null, // Natychmiastowe powiadomienie Heads-Up
          });
        }
      }
    );
  } catch (e) {
    // Ciche przechwycenie w środowiskach bez natywnego TaskManager
  }
}
