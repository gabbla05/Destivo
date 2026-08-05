import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { translations } from '../../i18n/translations';

interface RouteInfo {
  distanceKm: number;
  durationHours: number;
}

export interface SmartRecommendation {
  id: 'fastest' | 'cheapest';
  badgeLabel: string;
  badgeColor: string;
  title: string;
  icon: string;
  carrierName: string;
  estimatedTime: string;
  estimatedPriceRange: string;
  routeText: string;
  dateText: string;
  bookingUrl: string;
}

// --- POLSKIE I EUROPEJSKIE MIASTA Z REALNYM RUCHEM LOTNICZYM ---
const ACTIVE_AIRPORT_HUBS = [
  'warszawa', 'krakow', 'gdansk', 'wroclaw', 'poznan', 'katowice', 'rzeszow', 'szczecin',
  'londyn', 'paryz', 'rzym', 'madryt', 'barcelona', 'ateny', 'amsterdam', 'berlin',
  'praga', 'wieden', 'mediolan', 'lizbona', 'oslo', 'sztokholm', 'helsinki', 'kopenhaga',
  'dublin', 'budapeszt', 'bukareszt', 'sofia', 'zagrzeb', 'nowy-jork', 'chicago', 'dubaj',
];

// --- KONWERSJA MIAST DO ASCII SLUG ---
const toSlugASCII = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-');
};

const isAirportHub = (city: string): boolean => {
  const slug = toSlugASCII(city);
  return ACTIVE_AIRPORT_HUBS.some((hub) => slug.includes(hub));
};

// --- PARSOWANIE DATY ZE STEP 1 ---
const parseDateFormats = (dateStr: string) => {
  const clean = dateStr.trim();
  const match = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return {
      koleoDate: `${d}-${m}-${y}`,
      isoDate: `${y}-${m}-${d}`,
    };
  }

  const [, day, month, year] = match;
  return {
    koleoDate: `${day}-${month}-${year}`, // Koleo: DD-MM-YYYY
    isoDate: `${year}-${month}-${day}`,    // Google Flights: YYYY-MM-DD
  };
};

// --- POBIERANIE WSPÓŁRZĘDNYCH ---
const getCoordinates = async (city: string): Promise<[number, number] | null> => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      city
    )}&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DestivoApp/1.0' },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    return null;
  } catch {
    return null;
  }
};

// --- REALNA TRASA DROGOWA Z OSRM ---
const calculateRoute = async (origin: string, destination: string): Promise<RouteInfo> => {
  if (!origin.trim() || !destination.trim()) {
    return { distanceKm: 300, durationHours: 3.5 };
  }

  const origCoords = await getCoordinates(origin);
  const destCoords = await getCoordinates(destination);

  if (!origCoords || !destCoords) {
    return { distanceKm: 300, durationHours: 3.5 };
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origCoords[1]},${origCoords[0]};${destCoords[1]},${destCoords[0]}?overview=false`;
    const res = await fetch(osrmUrl);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const distanceKm = Math.round(data.routes[0].distance / 1000);
      const durationHours = parseFloat((data.routes[0].duration / 3600).toFixed(1));
      return { distanceKm, durationHours };
    }
  } catch {
    // Fallback offline
  }

  return { distanceKm: 300, durationHours: 3.5 };
};

// --- GENEROWANIE INTELIGENTNYCH REKOMENDACJI ---
const generateSmartRecommendations = (
  origin: string,
  destination: string,
  startDate: string,
  distanceKm: number
): { fastest: SmartRecommendation; cheapest: SmartRecommendation } => {
  const fromCity = origin.trim() || 'Warszawa';
  const toCity = destination.trim() || 'Kraków';
  const { koleoDate, isoDate } = parseDateFormats(startDate);

  const routeText = `${fromCity} ➔ ${toCity}`;
  const dateText = startDate.trim() ? `Dzień: ${startDate.trim()}` : 'Rozkład na dziś';

  // 1. DEDYKOWANE BEZPIECZNE URL-E
  const koleoUrl = `https://koleo.pl/rozklad-pkp/${toSlugASCII(fromCity)}/${toSlugASCII(
    toCity
  )}/${koleoDate}_00:00`;

  const googleFlightsUrl = `https://www.google.com/travel/flights?q=Flights%20from%20${encodeURIComponent(
    fromCity
  )}%20to%20${encodeURIComponent(toCity)}%20on%20${isoDate}`;

  const rome2RioUrl = `https://www.rome2rio.com/map/${encodeURIComponent(
    fromCity
  )}/${encodeURIComponent(toCity)}`;

  // 2. CZY TRASA NADAJE SIĘ NA LOT?
  // Lot proponujemy tylko, jeśli trasa > 700 km LUB (trasa > 400 km i OBYDWA miasta to duże huby lotnicze)
  const canFly =
    distanceKm > 700 ||
    (distanceKm > 400 && isAirportHub(fromCity) && isAirportHub(toCity));

  if (canFly) {
    const flightTime = Math.max(1.5, parseFloat((distanceKm / 650 + 1.8).toFixed(1)));
    const flightMin = Math.max(160, Math.round(distanceKm * 0.25));
    const flightMax = Math.max(400, Math.round(distanceKm * 0.6));

    const busTime = Math.round(distanceKm / 70);
    const busMin = Math.max(120, Math.round(distanceKm * 0.17));
    const busMax = Math.max(320, Math.round(distanceKm * 0.35));

    return {
      fastest: {
        id: 'fastest',
        badgeLabel: '⚡ NAJSZYBSZA OPCJA (LOT)',
        badgeColor: '#38BDF8',
        title: 'Połączenie lotnicze',
        icon: '✈️',
        carrierName: 'Google Flights (Linie lotnicze)',
        estimatedTime: `~${flightTime} h (z odprawą)`,
        estimatedPriceRange: `${flightMin} - ${flightMax} PLN`,
        routeText,
        dateText,
        bookingUrl: googleFlightsUrl,
      },
      cheapest: {
        id: 'cheapest',
        badgeLabel: '💰 ALTERNATYWA LĄDOWA',
        badgeColor: '#22C55E',
        title: 'Autokar międzynarodowy / Pociąg',
        icon: '🚌',
        carrierName: 'Rome2Rio (FlixBus / Omio)',
        estimatedTime: `~${busTime} h`,
        estimatedPriceRange: `${busMin} - ${busMax} PLN`,
        routeText,
        dateText,
        bookingUrl: rome2RioUrl,
      },
    };
  }

  // 3. TRASY BEZ LOTÓW (np. Radom -> Szczecin, Lublin -> Poznań, trasy krajowe < 400 km)
  const trainTime = Math.max(1, parseFloat((distanceKm / 105).toFixed(1)));
  const trainMin = Math.max(35, Math.round(distanceKm * 0.28));
  const trainMax = Math.max(75, Math.round(distanceKm * 0.58));

  const busTime = Math.max(1.5, parseFloat((distanceKm / 72).toFixed(1)));
  const busMin = Math.max(25, Math.round(distanceKm * 0.18));
  const busMax = Math.max(55, Math.round(distanceKm * 0.35));

  return {
    fastest: {
      id: 'fastest',
      badgeLabel: '⚡ NAJSZYBSZA OPCJA (POCIĄG EKSPRESOWY)',
      badgeColor: '#38BDF8',
      title: 'Szybkie połączenie kolejowe (IC / EIP)',
      icon: '🚄',
      carrierName: 'Koleo / PKP Intercity',
      estimatedTime: `~${trainTime} h`,
      estimatedPriceRange: `${trainMin} - ${trainMax} PLN`,
      routeText,
      dateText,
      bookingUrl: koleoUrl,
    },
    cheapest: {
      id: 'cheapest',
      badgeLabel: '💰 NAJTAŃSZA OPCJA (AUTOKAR / BEZPOŚREDNI)',
      badgeColor: '#22C55E',
      title: 'Autokary i linie dalekobieżne',
      icon: '🚌',
      carrierName: 'Rome2Rio (FlixBus / Omio)',
      estimatedTime: `~${busTime} h`,
      estimatedPriceRange: `${busMin} - ${busMax} PLN`,
      routeText,
      dateText,
      bookingUrl: rome2RioUrl,
    },
  };
};

export const Step2TransportScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { isGuest, language, toggleLanguage } = useAuthStore();
  const t = translations[language].tripCreatorStep2;
  const commonT = translations[language].common;

  const {
    origin,
    destination,
    startDate,
    transportType,
    customTransport,
    setTransport,
  } = useTripCreatorStore();

  const [loadingRoute, setLoadingRoute] = useState(true);
  const [routeInfo, setRouteInfo] = useState<RouteInfo>({ distanceKm: 0, durationHours: 0 });
  const [recommendations, setRecommendations] = useState<{
    fastest: SmartRecommendation;
    cheapest: SmartRecommendation;
  }>({
    fastest: {
      id: 'fastest',
      badgeLabel: '⚡ NAJSZYBSZA OPCJA',
      badgeColor: '#38BDF8',
      title: 'Szybki pociąg / Lot',
      icon: '🚄',
      carrierName: 'Koleo / Wyszukiwarka',
      estimatedTime: '~4 h',
      estimatedPriceRange: '80 - 200 PLN',
      routeText: 'Start ➔ Cel',
      dateText: 'Dzień wyjazdu',
      bookingUrl: 'https://koleo.pl',
    },
    cheapest: {
      id: 'cheapest',
      badgeLabel: '💰 NAJTAŃSZA OPCJA',
      badgeColor: '#22C55E',
      title: 'Połączenie autokarowe',
      icon: '🚌',
      carrierName: 'Rome2Rio',
      estimatedTime: '~6 h',
      estimatedPriceRange: '50 - 150 PLN',
      routeText: 'Start ➔ Cel',
      dateText: 'Dzień wyjazdu',
      bookingUrl: 'https://www.rome2rio.com',
    },
  });

  const [selectedType, setSelectedType] = useState<'fastest' | 'cheapest' | 'custom' | null>(
    transportType === 'fastest' || transportType === 'cheapest' ? transportType : null
  );
  const [customInput, setCustomInput] = useState(customTransport);

  // Kalkulator paliwa
  const [fuelConsumption, setFuelConsumption] = useState('7.5');
  const [fuelPrice, setFuelPrice] = useState('6.50');

  useEffect(() => {
    let isMounted = true;
    const fetchRouteData = async () => {
      setLoadingRoute(true);
      const info = await calculateRoute(origin, destination);
      if (isMounted) {
        setRouteInfo(info);
        const smartOffers = generateSmartRecommendations(
          origin,
          destination,
          startDate,
          info.distanceKm
        );
        setRecommendations(smartOffers);
        setLoadingRoute(false);
      }
    };
    fetchRouteData();
    return () => {
      isMounted = false;
    };
  }, [origin, destination, startDate]);

  const calculateCarCost = () => {
    const cons = parseFloat(fuelConsumption.replace(',', '.')) || 0;
    const price = parseFloat(fuelPrice.replace(',', '.')) || 0;
    const cost = (routeInfo.distanceKm / 100) * cons * price;
    return Math.round(cost);
  };

  const handleOpenBookingUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('DESTIVO', 'Nie udało się otworzyć strony z rozkładem jazdy.');
    });
  };

  const handleSelectOffer = (offer: SmartRecommendation) => {
    setSelectedType(offer.id);
    const summary = `${offer.carrierName}: ${origin || 'Start'} → ${destination} (${
      offer.estimatedTime
    }, szac. ${offer.estimatedPriceRange})`;
    setCustomInput(summary);
  };

  const handleNext = () => {
    if (!selectedType && !customInput.trim()) {
      Alert.alert('DESTIVO', 'Wybierz jedną z opcji transportu lub wpisz własną relację.');
      return;
    }

    setTransport(selectedType || 'custom', customInput.trim());
    if (navigation) {
      navigation.navigate('Step3');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
          {/* GÓRNY PASEK JĘZYKA */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.langButton}
              onPress={toggleLanguage}
              activeOpacity={0.7}
            >
              <Text style={styles.langButtonText}>{language === 'pl' ? 'EN' : 'PL'}</Text>
            </TouchableOpacity>
          </View>

          {/* PASEK POSTĘPU */}
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>KROK 2 Z 4</Text>
            <Text style={styles.progressStepName}>{t.header_title}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '50%' }]} />
          </View>

          {/* GŁÓWNA KARTA */}
          <View style={styles.card}>
            <Text style={styles.title}>{t.header_title}</Text>
            <Text style={styles.subtitle}>
              Porównanie optymalnych opcji z szacowanym czasem i przedziałem cenowym dla Twojej trasy.
            </Text>

            {/* BELKA Z REALNYM DYSTANSEM OSRM */}
            <View style={styles.distanceBadge}>
              {loadingRoute ? (
                <ActivityIndicator size="small" color="#F59E0B" />
              ) : (
                <Text style={styles.distanceText}>
                  📍 {origin ? `${origin} → ` : ''}
                  {destination}: <Text style={{ color: '#F59E0B' }}>{routeInfo.distanceKm} km</Text> (~{routeInfo.durationHours} h autem)
                </Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>REKOMENDOWANE POŁĄCZENIA</Text>

            {/* KARTY DWÓCH REKOMENDACJI */}
            {[recommendations.fastest, recommendations.cheapest].map((offer) => {
              const isSelected = selectedType === offer.id;
              return (
                <View
                  key={offer.id}
                  style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                >
                  <View style={styles.optionHeaderRow}>
                    <Text style={[styles.badge, { color: offer.badgeColor }]}>
                      {offer.badgeLabel}
                    </Text>
                    <TouchableOpacity
                      style={styles.selectBadgeBtn}
                      onPress={() => handleSelectOffer(offer)}
                    >
                      <Text style={styles.selectBadgeText}>
                        {isSelected ? `✓ ${t.button_selected}` : t.button_select_option}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.mainTitleRow}>
                    <Text style={styles.optionTitle}>
                      {offer.icon} {offer.title}
                    </Text>
                    <Text style={styles.priceBadge}>{offer.estimatedPriceRange}</Text>
                  </View>

                  <Text style={styles.carrierText}>Przewoźnik / Baza: {offer.carrierName}</Text>

                  <View style={styles.metaBox}>
                    <Text style={styles.metaText}>⏱ Szacowany czas: {offer.estimatedTime}</Text>
                    <Text style={styles.metaText}>🗺 Trasa: {offer.routeText}</Text>
                    <Text style={styles.metaText}>📅 {offer.dateText}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.buyTicketBtn}
                    onPress={() => handleOpenBookingUrl(offer.bookingUrl)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.buyTicketText}>
                      Sprawdź i kup bilet ({offer.carrierName.split(' ')[0]}) ↗
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* OPCJA SAMOCHODU PRYWATNEGO */}
            <View
              style={[
                styles.optionCard,
                selectedType === 'custom' &&
                  customInput.includes('Samochód') &&
                  styles.optionCardSelected,
              ]}
            >
              <View style={styles.optionHeaderRow}>
                <Text style={styles.badgeCar}>🚗 ALTERNATYWA (AUTO PRYWATNE)</Text>
                {isGuest ? (
                  <Text style={styles.lockBadge}>🔒 GOŚĆ</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.selectBadgeBtn}
                    onPress={() => {
                      setSelectedType('custom');
                      setCustomInput(
                        `Samochód prywatny (${origin} → ${destination}): paliwo ~${calculateCarCost()} PLN`
                      );
                    }}
                  >
                    <Text style={styles.selectBadgeText}>
                      {selectedType === 'custom' && customInput.includes('Samochód')
                        ? `✓ ${t.button_selected}`
                        : t.button_select_option}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {isGuest ? (
                <View style={styles.lockedContainer}>
                  <Text style={styles.lockedTitle}>{t.car_logged_only_title}</Text>
                  <Text style={styles.lockedDesc}>{t.car_logged_only_desc}</Text>
                </View>
              ) : (
                <View style={styles.carCalculatorContainer}>
                  <View style={styles.rowGroup}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.inputLabelSmall}>{t.fuel_consumption_label}</Text>
                      <TextInput
                        style={styles.smallInput}
                        value={fuelConsumption}
                        onChangeText={setFuelConsumption}
                        keyboardType="numeric"
                        placeholder="7.5"
                        placeholderTextColor="#475569"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.inputLabelSmall}>{t.fuel_price_label}</Text>
                      <TextInput
                        style={styles.smallInput}
                        value={fuelPrice}
                        onChangeText={setFuelPrice}
                        keyboardType="numeric"
                        placeholder="6.50"
                        placeholderTextColor="#475569"
                      />
                    </View>
                  </View>
                  <View style={styles.carCostRow}>
                    <Text style={styles.carCostLabel}>{t.car_total_cost}</Text>
                    <Text style={styles.carCostValue}>~{calculateCarCost()} PLN</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.buyTicketBtn, { marginTop: 10 }]}
                    onPress={() =>
                      handleOpenBookingUrl(
                        `https://www.google.com/maps/dir/${encodeURIComponent(
                          origin
                        )}/${encodeURIComponent(destination)}`
                      )
                    }
                  >
                    <Text style={styles.buyTicketText}>Otwórz trasę w Google Maps ↗</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* FINALNY WYBÓR */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t.input_customTransportLabel.toUpperCase()}</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>✍️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Wybierz opcję z góry lub wpisz własną relację..."
                  placeholderTextColor="#475569"
                  value={customInput}
                  onChangeText={(text) => {
                    setCustomInput(text);
                    setSelectedType('custom');
                  }}
                />
              </View>
            </View>

            {/* PRZYCISKI NAWIGACJI */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{commonT.button_nextStep} →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation?.goBack()}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>← {commonT.button_goBack}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langButtonText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#F59E0B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  progressStepName: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 4, backgroundColor: '#1E293B', borderRadius: 2, marginBottom: 20 },
  progressBarFill: { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 18 },
  distanceBadge: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  distanceText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  optionCard: {
    backgroundColor: '#0B1120',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  optionCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  optionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  badgeCar: { color: '#A855F7', fontSize: 11, fontWeight: '800' },
  mainTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  optionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  priceBadge: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  carrierText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  metaBox: {
    backgroundColor: '#111827',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 12,
  },
  metaText: { color: '#E2E8F0', fontSize: 12, marginBottom: 4 },
  selectBadgeBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectBadgeText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  buyTicketBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  buyTicketText: { color: '#38BDF8', fontSize: 13, fontWeight: '700' },
  lockBadge: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lockedContainer: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  lockedTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  lockedDesc: { color: '#64748B', fontSize: 11, lineHeight: 16 },
  carCalculatorContainer: { marginTop: 8 },
  rowGroup: { flexDirection: 'row', justifyContent: 'space-between' },
  inputLabelSmall: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  smallInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#F8FAFC',
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
  },
  carCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  carCostLabel: { color: '#94A3B8', fontSize: 12 },
  carCostValue: { color: '#F59E0B', fontSize: 15, fontWeight: '700' },
  inputGroup: { marginTop: 10, marginBottom: 16 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: { fontSize: 15, marginRight: 10 },
  input: { flex: 1, color: '#F8FAFC', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#F59E0B',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});