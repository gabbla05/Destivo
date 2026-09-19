import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  StyleSheet,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  useTripCreatorStore,
  TransportOption,
} from '../../store/tripCreatorStore';
import {
  fetchTransportComparisons,
  getTransportRouteMetadata,
  TransportDataProvider,
} from '../../lib/transportCalculator';
import { VaultManager } from '../../lib/vaultManager';
import { useAuthStore } from '../../store/authStore';
import { translations } from '../../i18n/translations';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// --- NARZĘDZIE DO SZYBKIEGO LICZENIA DYSTANSU (GEOKODOWANIE) ---
const getCoords = async (query: string) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
      headers: { 'User-Agent': 'DestivoApp/1.0' }
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn("Geocoding error:", e);
  }
  return null;
};

// --- POMOCNICZA FUNKCJA DO PARSOWANIA GODZINY DO OBIEKTU DATE ---
const parseTimeToDate = (timeStr?: string): Date => {
  const d = new Date();
  if (!timeStr || !timeStr.trim()) {
    d.setHours(12, 0, 0, 0);
    return d;
  }
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) {
      d.setHours(h, m, 0, 0);
      return d;
    }
  }
  d.setHours(12, 0, 0, 0);
  return d;
};

interface Step2TransportScreenProps {
  navigation?: any;
  transportProvider: TransportDataProvider;
  departureAt?: string;
}

export const Step2TransportScreen: React.FC<Step2TransportScreenProps> = ({
  navigation,
  transportProvider,
  departureAt,
}) => {
  const {
    origin,
    destination,
    startDate,
    endDate,
    transport,
    setTransportOption,
    transportDetails,
    setTransportDetails,
  } = useTripCreatorStore();
  const { language } = useAuthStore();
  const t = translations[language].transport;
  const step2T = translations[language].tripCreatorStep2;
  const commonT = translations[language].common;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState<boolean>(true);
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stany dla dynamicznych ostrzeżeń o dystansie do węzłów
  const [outboundDepDist, setOutboundDepDist] = useState<number | null>(null);
  const [outboundArrDist, setOutboundArrDist] = useState<number | null>(null);
  const [returnDepDist, setReturnDepDist] = useState<number | null>(null);
  const [returnArrDist, setReturnArrDist] = useState<number | null>(null);

  // Stan dla TimePickera (zegara)
  const [activeTimePicker, setActiveTimePicker] = useState<
    'outboundDeparture' | 'outboundArrival' | 'returnDeparture' | 'returnArrival' | null
  >(null);

  // Śledzenie klawiatury dla płynnego scrollowania
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadTransportOptions() {
      if (!origin?.trim() || !destination?.trim() || !transportProvider) {
        setOptions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchTransportComparisons(
          destination,
          origin,
          transportProvider,
          { departureAt }
        );
        if (!isMounted) return;

        // FILTROWANIE: eliminujemy autobusy / Flixbus. Pozostaje wyłącznie auto, pociąg lub samolot.
        const filtered = data.filter((opt) => {
          if (opt.type === 'bus') return false;
          const p = (opt.provider || '').toLowerCase();
          if (p.includes('flixbus') || p.includes('autokar') || p.includes('coach') || p.includes('bus')) {
            return false;
          }
          return true;
        });

        setOptions(filtered);
      } catch (error: unknown) {
        if (isMounted) {
          setErrorMessage(t.noDataText);
          setOptions([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadTransportOptions();
    return () => { isMounted = false; };
  }, [destination, origin, transportProvider, departureAt]);

  const localizeActionLinkLabel = (label: string): string => {
    if (!label) return label;

    const normalized = label.trim();
    if (normalized.toLowerCase().startsWith('nawiguj do:') || normalized.toLowerCase().startsWith('navigate to:')) {
      const dest = normalized.split(':').slice(1).join(':').trim();
      return t.routeAction.navigateTo.replace('{{destination}}', dest || destination || 'destination');
    }
    if (normalized.toLowerCase().startsWith('pokaż stację w:') || normalized.toLowerCase().startsWith('show station in:')) {
      const city = normalized.split(':').slice(1).join(':').trim();
      return t.routeAction.stationIn.replace('{{city}}', city || 'city');
    }
    if (normalized.toLowerCase().startsWith('dworzec autobusowy:') || normalized.toLowerCase().startsWith('bus station:')) {
      const city = normalized.split(':').slice(1).join(':').trim();
      return t.routeAction.busStationIn.replace('{{city}}', city || 'city');
    }
    if (normalized.toLowerCase().startsWith('lotnisko w okolicach:') || normalized.toLowerCase().startsWith('airport nearby:')) {
      const city = normalized.split(':').slice(1).join(':').trim();
      return t.routeAction.airportNear.replace('{{city}}', city || 'city');
    }

    return normalized;
  };

  const localizeRouteNote = (note: string): string => {
    if (!note) return note;

    const distanceMatch = note.match(/~([0-9]+)\s*km/i);
    const distance = distanceMatch ? distanceMatch[1] : '{{distance}}';

    if (/Trasa lokalna|Local route/i.test(note)) {
      return t.routeNotes.localRoute.replace('{{distance}}', distance);
    }
    if (/Rekomendowane połączenie kolejowe|Recommended rail connection/i.test(note)) {
      return t.routeNotes.recommendedTrain.replace('{{distance}}', distance);
    }
    if (/Alternatywne połączenie autokarowe|Alternative coach connection/i.test(note)) {
      return t.routeNotes.alternativeBus;
    }
    if (/Podróż własnym samochodem|Driving from point A to point B/i.test(note)) {
      return t.routeNotes.ownCar;
    }
    if (/Trasa daleka|Long-distance\/international route/i.test(note)) {
      return t.routeNotes.longDistanceFlight.replace('{{distance}}', distance);
    }
    if (/Dla fanów długich tras samochodowych|For fans of long road trips/i.test(note)) {
      return t.routeNotes.longRoadTrip;
    }

    return note;
  };

  const localizeProviderName = (provider: string, type: string): string => {
    const normalizedType = type?.toLowerCase();
    const lowerProvider = provider?.toLowerCase() ?? '';

    if (normalizedType === 'flight' || lowerProvider.includes('skyscanner') || lowerProvider.includes('lotnicze')) {
      return t.providers.flight;
    }
    if (normalizedType === 'train' || lowerProvider.includes('koleo') || lowerProvider.includes('pociąg') || lowerProvider.includes('rail')) {
      return t.providers.train;
    }
    if (normalizedType === 'bus' || lowerProvider.includes('flixbus') || lowerProvider.includes('autokar') || lowerProvider.includes('coach')) {
      return t.providers.bus;
    }
    if (normalizedType === 'car' || lowerProvider.includes('samochód') || lowerProvider.includes('car') || lowerProvider.includes('roadtrip')) {
      return t.providers.car;
    }
    if (lowerProvider.includes('offline') || lowerProvider.includes('gps')) {
      return t.providers.offline;
    }
    return provider || '';
  };

  const handleOpenBooking = async (url?: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert('DESTIVO', t.openLinkError);
    } catch (error: unknown) {
      console.error('Błąd otwierania linku:', error);
    }
  };

  const renderTypeName = (type: string): string => {
    switch (type) {
      case 'flight': return t.types.flight;
      case 'train': return t.types.train;
      case 'bus': return t.types.bus;
      case 'car': return t.types.car;
      default: return type.toUpperCase();
    }
  };

  const renderTypeIcon = (type: string) => {
    switch (type) {
      case 'flight':
        return <Ionicons name="airplane" size={22} color="#38BDF8" />;
      case 'train':
        return <Ionicons name="train" size={22} color="#F59E0B" />;
      case 'car':
        return <Ionicons name="car" size={22} color="#10B981" />;
      default:
        return <Ionicons name="navigate" size={22} color="#94A3B8" />;
    }
  };

  // Silnik sprawdzający odległość wpisanego dworca/lotniska od głównego miasta
  const handleCheckCommute = async (baseCity: string, hub: string, setDist: (d: number | null) => void) => {
    if (!hub.trim()) {
      setDist(null);
      return;
    }
    try {
      const [baseCoords, hubCoords] = await Promise.all([getCoords(baseCity), getCoords(hub)]);
      if (baseCoords && hubCoords) {
        const R = 6371;
        const dLat = ((hubCoords.lat - baseCoords.lat) * Math.PI) / 180;
        const dLon = ((hubCoords.lon - baseCoords.lon) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((baseCoords.lat * Math.PI) / 180) * Math.cos((hubCoords.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
        const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        setDist(dist);
      } else {
        setDist(null);
      }
    } catch (e) {
      setDist(null);
    }
  };

  // Obsługa wyboru godziny z zegara (native TimePicker)
  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActiveTimePicker(null);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      if (Platform.OS === 'ios') setActiveTimePicker(null);
      return;
    }
    const hours = String(selectedDate.getHours()).padStart(2, '0');
    const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
    const formattedTime = `${hours}:${minutes}`;

    if (activeTimePicker === 'outboundDeparture') {
      setTransportDetails({ outboundDepartureTime: formattedTime });
    } else if (activeTimePicker === 'outboundArrival') {
      setTransportDetails({ outboundArrivalTime: formattedTime });
    } else if (activeTimePicker === 'returnDeparture') {
      setTransportDetails({ returnDepartureTime: formattedTime });
    } else if (activeTimePicker === 'returnArrival') {
      setTransportDetails({ returnArrivalTime: formattedTime });
    }

    if (Platform.OS === 'ios') {
      setActiveTimePicker(null);
    }
  };

  const getActivePickerDate = (): Date => {
    let timeStr = '';
    if (activeTimePicker === 'outboundDeparture') timeStr = transportDetails.outboundDepartureTime;
    else if (activeTimePicker === 'outboundArrival') timeStr = transportDetails.outboundArrivalTime;
    else if (activeTimePicker === 'returnDeparture') timeStr = transportDetails.returnDepartureTime;
    else if (activeTimePicker === 'returnArrival') timeStr = transportDetails.returnArrivalTime;
    return parseTimeToDate(timeStr);
  };

  // Obsługa dodawania biletu do Sejfu (PDF / Zdjęcie)
  const handleUploadTicket = () => {
    Alert.alert(
      t.uploadTicket,
      t.chooseTicketSource,
      [
        {
          text: t.documentPdf,
          onPress: async () => {
            try {
              const fileData = await VaultManager.pickFile();
              if (fileData) {
                setTransportDetails({ ticketFile: fileData });
                Alert.alert('DESTIVO', t.ticketUploadedSuccess);
              }
            } catch (e) {
              console.error('Błąd wgrywania pliku biletu:', e);
              Alert.alert('DESTIVO', t.ticketUploadError);
            }
          },
        },
        {
          text: t.photoScan,
          onPress: async () => {
            try {
              const fileData = await VaultManager.pickImage();
              if (fileData) {
                setTransportDetails({ ticketFile: fileData });
                Alert.alert('DESTIVO', t.ticketUploadedSuccess);
              }
            } catch (e) {
              console.error('Błąd wgrywania zdjęcia biletu:', e);
              Alert.alert('DESTIVO', t.ticketUploadError);
            }
          },
        },
        {
          text: commonT.button_cancel || 'Anuluj',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top > 0 ? 12 : 20, 16),
                paddingBottom: isKeyboardVisible
                  ? (Platform.OS === 'android' ? 240 : keyboardHeight + 40)
                  : 120,
              },
            ]}
            bounces={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* PASEK POSTĘPU KREATORA */}
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>{step2T.step_indicator}</Text>
              <Text style={styles.progressStepName}>{step2T.step_title}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: '50%' }]} />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>{t.title}</Text>
              <View style={styles.routeHeaderRow}>
                {origin ? (
                  <>
                    <Text style={styles.routeCity}>{origin.toUpperCase()}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#F59E0B" style={{ marginHorizontal: 6 }} />
                  </>
                ) : null}
                <Text style={styles.routeCity}>
                  {destination.toUpperCase() || t.destinationFallback}
                </Text>
              </View>
              <Text style={styles.desc}>{t.subtitle}</Text>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#F59E0B" />
                <Text style={styles.loaderText}>{t.calculating}</Text>
              </View>
            ) : (
              <>
                {errorMessage && (
                  <View style={styles.errorBox}>
                    <View style={styles.errorHeaderRow}>
                      <Ionicons name="alert-circle-outline" size={16} color="#F87171" style={{ marginRight: 6 }} />
                      <Text style={styles.errorTitle}>{t.noDataTitle}</Text>
                    </View>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                )}

                {options.length === 0 && !errorMessage && (
                  <View style={styles.emptyBox}>
                    <Ionicons name="information-circle-outline" size={24} color="#94A3B8" style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyTitle}>{t.noRoutesTitle}</Text>
                    <Text style={styles.emptyText}>{t.noRoutesText}</Text>
                  </View>
                )}

                {options.map((item: TransportOption) => {
                  const isSelected = transport.selectedOption?.id === item.id;
                  const metadata = getTransportRouteMetadata(item.id);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => setTransportOption(isSelected ? null : item)}
                      style={[styles.card, isSelected && styles.cardSelected]}
                    >
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.typeIconWrapper}>
                          {renderTypeIcon(item.type)}
                        </View>
                        <View style={styles.providerInfo}>
                          <Text style={styles.typeTitle}>{renderTypeName(item.type)}</Text>
                          <Text style={styles.providerSubtitle}>
                            {localizeProviderName(item.provider, item.type)}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.selectedBadge}>
                            <Ionicons name="checkmark-circle" size={20} color="#F59E0B" />
                          </View>
                        )}
                      </View>

                      {metadata?.notes && metadata.notes.length > 0 && (
                        <View style={styles.notesBox}>
                          {metadata.notes.map((note, idx) => (
                            <View key={idx} style={styles.noteRow}>
                              <Ionicons
                                name="information-circle-outline"
                                size={14}
                                color="#F59E0B"
                                style={{ marginRight: 6, marginTop: 1 }}
                              />
                              <Text style={styles.noteText}>{localizeRouteNote(note)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {metadata?.actionLinks && metadata.actionLinks.length > 0 && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          {metadata.actionLinks.map((link, idx) => (
                            <TouchableOpacity
                              key={idx}
                              style={styles.mapButton}
                              onPress={() => handleOpenBooking(link.url)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name="navigate-outline"
                                size={14}
                                color="#38BDF8"
                                style={{ marginRight: 6 }}
                              />
                              <Text style={styles.mapButtonText}>
                                {localizeActionLinkLabel(link.label)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <View style={styles.cardFooter}>
                        <View style={{ flex: 1 }} />
                        {item.bookingUrl ? (
                          <TouchableOpacity
                            onPress={() => handleOpenBooking(item.bookingUrl)}
                            style={styles.bookButton}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.bookButtonText}>{t.checkTickets}</Text>
                            <Ionicons name="open-outline" size={13} color="#38BDF8" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* FORMULARZ SZCZEGÓŁÓW (Tylko jeśli wybrano transport) */}
                {transport.selectedOption && (
                  <View style={styles.detailsContainer}>
                    <Text style={styles.detailsTitle}>{t.detailsTitle}</Text>

                    <View style={styles.detailsCard}>
                      {/* TRASA TAM */}
                      <Text style={styles.detailsSectionTitle}>
                        {t.outbound} {startDate ? `(${startDate})` : ''}
                      </Text>

                      <View style={styles.fullWidthInputGroup}>
                        <Text style={styles.label}>{t.departureLocation}</Text>
                        <View style={styles.inputContainer}>
                          <Ionicons name="location-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="..."
                            placeholderTextColor="#94A3B8"
                            value={transportDetails.outboundDepartureLocation}
                            onChangeText={(txt) => setTransportDetails({ outboundDepartureLocation: txt })}
                            onBlur={() =>
                              handleCheckCommute(origin, transportDetails.outboundDepartureLocation, setOutboundDepDist)
                            }
                          />
                        </View>
                        {outboundDepDist !== null && outboundDepDist > 2 && (
                          <View style={styles.commuteWarningRow}>
                            <Ionicons name="warning-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.commuteWarning}>
                              {t.commuteHint.replace('{{city}}', origin).replace('{{dist}}', String(outboundDepDist))}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.fullWidthInputGroup}>
                        <Text style={styles.label}>{t.arrivalLocation}</Text>
                        <View style={styles.inputContainer}>
                          <Ionicons name="pin-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="..."
                            placeholderTextColor="#94A3B8"
                            value={transportDetails.outboundArrivalLocation}
                            onChangeText={(txt) => setTransportDetails({ outboundArrivalLocation: txt })}
                            onBlur={() =>
                              handleCheckCommute(destination, transportDetails.outboundArrivalLocation, setOutboundArrDist)
                            }
                          />
                        </View>
                        {outboundArrDist !== null && outboundArrDist > 2 && (
                          <View style={styles.commuteWarningRow}>
                            <Ionicons name="warning-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.commuteWarning}>
                              {t.commuteHint.replace('{{city}}', destination).replace('{{dist}}', String(outboundArrDist))}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.rowGroup}>
                        <View style={styles.inputGroup}>
                          <Text style={styles.label}>{t.departureTime}</Text>
                          <View style={styles.timeInputContainer}>
                            <TouchableOpacity
                              testID="clock-outboundDeparture"
                              onPress={() => setActiveTimePicker('outboundDeparture')}
                              style={styles.clockIconBtn}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="time-outline" size={18} color="#F59E0B" />
                            </TouchableOpacity>
                            <TextInput
                              style={styles.timeTextInput}
                              placeholder={t.timePlaceholder}
                              placeholderTextColor="#94A3B8"
                              value={transportDetails.outboundDepartureTime}
                              onChangeText={(txt) => setTransportDetails({ outboundDepartureTime: txt })}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                            />
                          </View>
                        </View>

                        <View style={styles.inputGroup}>
                          <Text style={styles.label}>{t.arrivalTime}</Text>
                          <View style={styles.timeInputContainer}>
                            <TouchableOpacity
                              testID="clock-outboundArrival"
                              onPress={() => setActiveTimePicker('outboundArrival')}
                              style={styles.clockIconBtn}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="time-outline" size={18} color="#F59E0B" />
                            </TouchableOpacity>
                            <TextInput
                              style={styles.timeTextInput}
                              placeholder={t.timePlaceholder}
                              placeholderTextColor="#94A3B8"
                              value={transportDetails.outboundArrivalTime}
                              onChangeText={(txt) => setTransportDetails({ outboundArrivalTime: txt })}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                            />
                          </View>
                        </View>
                      </View>

                      {/* TRASA Z POWROTEM */}
                      {endDate ? (
                        <>
                          <View style={styles.divider} />
                          <Text style={styles.detailsSectionTitle}>{t.return} ({endDate})</Text>

                          <View style={styles.fullWidthInputGroup}>
                            <Text style={styles.label}>{t.departureLocation}</Text>
                            <View style={styles.inputContainer}>
                              <Ionicons name="location-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                              <TextInput
                                style={styles.input}
                                placeholder="..."
                                placeholderTextColor="#94A3B8"
                                value={transportDetails.returnDepartureLocation}
                                onChangeText={(txt) => setTransportDetails({ returnDepartureLocation: txt })}
                                onBlur={() =>
                                  handleCheckCommute(destination, transportDetails.returnDepartureLocation, setReturnDepDist)
                                }
                              />
                            </View>
                            {returnDepDist !== null && returnDepDist > 2 && (
                              <View style={styles.commuteWarningRow}>
                                <Ionicons name="warning-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                                <Text style={styles.commuteWarning}>
                                  {t.commuteHint.replace('{{city}}', destination).replace('{{dist}}', String(returnDepDist))}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.fullWidthInputGroup}>
                            <Text style={styles.label}>{t.arrivalLocation}</Text>
                            <View style={styles.inputContainer}>
                              <Ionicons name="pin-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                              <TextInput
                                style={styles.input}
                                placeholder="..."
                                placeholderTextColor="#94A3B8"
                                value={transportDetails.returnArrivalLocation}
                                onChangeText={(txt) => setTransportDetails({ returnArrivalLocation: txt })}
                                onBlur={() =>
                                  handleCheckCommute(origin, transportDetails.returnArrivalLocation, setReturnArrDist)
                                }
                              />
                            </View>
                            {returnArrDist !== null && returnArrDist > 2 && (
                              <View style={styles.commuteWarningRow}>
                                <Ionicons name="warning-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                                <Text style={styles.commuteWarning}>
                                  {t.commuteHint.replace('{{city}}', origin).replace('{{dist}}', String(returnArrDist))}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.rowGroup}>
                            <View style={styles.inputGroup}>
                              <Text style={styles.label}>{t.departureTime}</Text>
                              <View style={styles.timeInputContainer}>
                                <TouchableOpacity
                                  testID="clock-returnDeparture"
                                  onPress={() => setActiveTimePicker('returnDeparture')}
                                  style={styles.clockIconBtn}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
                                </TouchableOpacity>
                                <TextInput
                                  style={styles.timeTextInput}
                                  placeholder={t.timePlaceholder}
                                  placeholderTextColor="#94A3B8"
                                  value={transportDetails.returnDepartureTime}
                                  onChangeText={(txt) => setTransportDetails({ returnDepartureTime: txt })}
                                  keyboardType="numbers-and-punctuation"
                                  maxLength={5}
                                />
                              </View>
                            </View>

                            <View style={styles.inputGroup}>
                              <Text style={styles.label}>{t.arrivalTime}</Text>
                              <View style={styles.timeInputContainer}>
                                <TouchableOpacity
                                  testID="clock-returnArrival"
                                  onPress={() => setActiveTimePicker('returnArrival')}
                                  style={styles.clockIconBtn}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
                                </TouchableOpacity>
                                <TextInput
                                  style={styles.timeTextInput}
                                  placeholder={t.timePlaceholder}
                                  placeholderTextColor="#94A3B8"
                                  value={transportDetails.returnArrivalTime}
                                  onChangeText={(txt) => setTransportDetails({ returnArrivalTime: txt })}
                                  keyboardType="numbers-and-punctuation"
                                  maxLength={5}
                                />
                              </View>
                            </View>
                          </View>
                        </>
                      ) : null}

                      {/* WGRYWANIE BILETU DO SEJFU */}
                      {transportDetails.ticketFile ? (
                        <View style={styles.ticketAttachedCard}>
                          <View style={styles.ticketIconContainer}>
                            <Ionicons
                              name={transportDetails.ticketFile.type === 'PDF' ? 'document-text' : 'image'}
                              size={22}
                              color="#F59E0B"
                            />
                          </View>
                          <View style={styles.ticketInfo}>
                            <Text style={styles.ticketFileName} numberOfLines={1}>
                              {transportDetails.ticketFile.name}
                            </Text>
                            <View style={styles.ticketBadgeRow}>
                              <Ionicons name="shield-checkmark" size={13} color="#10B981" style={{ marginRight: 4 }} />
                              <Text style={styles.ticketBadgeText}>{t.ticketAttached}</Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            testID="remove-ticket-btn"
                            onPress={() => setTransportDetails({ ticketFile: null })}
                            style={styles.removeTicketBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="trash-outline" size={18} color="#F87171" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.uploadButton}
                          onPress={handleUploadTicket}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="document-attach-outline"
                            size={18}
                            color="#38BDF8"
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.uploadButtonText}>{t.uploadTicket}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* TIME PICKER MODAL / DIALOG */}
          {activeTimePicker && (
            <DateTimePicker
              value={getActivePickerDate()}
              mode="time"
              is24Hour={true}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
            />
          )}

          <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !transport.selectedOption && styles.primaryButtonDisabled,
              ]}
              disabled={!transport.selectedOption}
              onPress={() => navigation?.navigate('Step3')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !transport.selectedOption && styles.primaryButtonTextDisabled,
                ]}
              >
                {commonT.button_nextStep}
              </Text>
            </TouchableOpacity>
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation?.goBack()} activeOpacity={0.7}>
                <Text style={styles.secondaryButtonText}>{commonT.button_goBack}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={() => navigation?.navigate('Step3')} activeOpacity={0.7}>
                <Text style={styles.tertiaryButtonText}>{commonT.button_skip}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  container: { flex: 1, backgroundColor: '#0B1120' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  progressText: { color: '#F59E0B', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  progressStepName: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 4, backgroundColor: '#1E293B', borderRadius: 2, marginBottom: 20 },
  progressBarFill: { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  routeCity: { fontSize: 14, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 },
  desc: { fontSize: 14, color: '#CBD5E1', lineHeight: 20 },
  scrollContent: { paddingHorizontal: 20, flexGrow: 1 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  loaderText: { color: '#CBD5E1', marginTop: 12, fontSize: 14, fontWeight: '500' },
  errorBox: { backgroundColor: 'rgba(248, 113, 113, 0.08)', borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.35)', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  errorTitle: { color: '#F87171', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#CBD5E1', fontSize: 12, lineHeight: 17 },
  emptyBox: { backgroundColor: '#111827', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#CBD5E1', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#1E293B' },
  cardSelected: { borderColor: '#F59E0B', backgroundColor: '#162032' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  typeIconWrapper: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.04)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  providerInfo: { flex: 1, marginRight: 10 },
  typeTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  providerSubtitle: { color: '#CBD5E1', fontSize: 13, marginTop: 2, fontWeight: '500' },
  selectedBadge: { marginLeft: 6 },
  notesBox: { marginBottom: 12, paddingHorizontal: 2, gap: 4 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start' },
  noteText: { color: '#F59E0B', fontSize: 12, lineHeight: 17, fontStyle: 'italic', fontWeight: '600', flex: 1 },
  mapButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  mapButtonText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12, marginTop: 8 },
  bookButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#38BDF8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  bookButtonText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  bottomActions: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1E293B', backgroundColor: '#0B1120' },
  primaryButton: { 
    backgroundColor: '#F59E0B', 
    height: 48, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#1E293B',
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  primaryButtonTextDisabled: { color: '#94A3B8' },
  actionButtonsRow: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  secondaryButtonText: { color: '#F59E0B', fontSize: 14, fontWeight: '700' },
  tertiaryButton: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tertiaryButtonText: { color: '#F59E0B', fontSize: 14, fontWeight: '700' },
  
  detailsContainer: { marginTop: 16 },
  detailsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  detailsCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  detailsSectionTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase' },
  fullWidthInputGroup: { marginBottom: 12 },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    height: '100%',
  },
  commuteWarningRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  commuteWarning: { color: '#F59E0B', fontSize: 11, fontWeight: '600', flex: 1 },
  rowGroup: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  inputGroup: { flex: 1 },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 44,
  },
  clockIconBtn: { padding: 6, marginRight: 2 },
  timeTextInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    height: '100%',
    textAlign: 'center',
  },
  divider: { height: 1, backgroundColor: '#1E293B', marginVertical: 16 },
  uploadButton: {
    marginTop: 20,
    flexDirection: 'row',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#38BDF8', fontSize: 13, fontWeight: '700' },
  ticketAttachedCard: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
  },
  ticketIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  ticketInfo: { flex: 1, marginRight: 8 },
  ticketFileName: { color: '#F8FAFC', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  ticketBadgeRow: { flexDirection: 'row', alignItems: 'center' },
  ticketBadgeText: { color: '#10B981', fontSize: 11, fontWeight: '600' },
  removeTicketBtn: { padding: 8 },
});