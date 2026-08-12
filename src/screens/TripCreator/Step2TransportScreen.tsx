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
  SafeAreaView,
  StatusBar,
  TextInput,
} from 'react-native';
import {
  useTripCreatorStore,
  TransportOption,
} from '../../store/tripCreatorStore';
import {
  fetchTransportComparisons,
  getTransportRouteMetadata,
  TransportDataProvider,
} from '../../lib/transportCalculator';
import { useAuthStore } from '../../store/authStore';
import { translations } from '../../i18n/translations';

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
  const commonT = translations[language].common;

  const [loading, setLoading] = useState<boolean>(true);
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stany dla dynamicznych ostrzeżeń o dystansie do węzłów
  const [outboundDepDist, setOutboundDepDist] = useState<number | null>(null);
  const [outboundArrDist, setOutboundArrDist] = useState<number | null>(null);
  const [returnDepDist, setReturnDepDist] = useState<number | null>(null);
  const [returnArrDist, setReturnArrDist] = useState<number | null>(null);

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
        setOptions(data);
        if (!transport.selectedOption && data.length > 0) {
          setTransportOption(data[0]);
        }
      } catch (error: unknown) {
        if (isMounted) {
          setErrorMessage('Nie udało się pobrać rekomendacji transportowych.');
          setOptions([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadTransportOptions();
    return () => { isMounted = false; };
  }, [destination, origin, transportProvider, departureAt]);

  const handleOpenBooking = async (url?: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert('DESTIVO', 'Nie można otworzyć linku.');
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.routeSubtitle}>
            {origin ? `${origin.toUpperCase()} ➔ ` : ''}
            {destination.toUpperCase() || 'CEL PODRÓŻY'}
          </Text>
          <Text style={styles.desc}>{t.subtitle}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loaderText}>{t.calculating}</Text>
            </View>
          ) : (
            <>
              {errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>Brak danych</Text>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}
              {options.length === 0 && !errorMessage && (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Brak połączeń</Text>
                  <Text style={styles.emptyText}>Nie znaleziono odpowiednich połączeń dla tej trasy lub podano błędną lokalizację.</Text>
                </View>
              )}
              {options.map((item: TransportOption) => {
                const isSelected = transport.selectedOption?.id === item.id;
                const metadata = getTransportRouteMetadata(item.id);

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.85}
                    onPress={() => setTransportOption(item)}
                    style={[styles.card, isSelected && styles.cardSelected]}
                  >
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.providerInfo}>
                        <Text style={styles.typeTitle}>{renderTypeName(item.type)}</Text>
                        <Text style={styles.providerSubtitle}>{item.provider}</Text>
                      </View>
                    </View>

                    {metadata?.notes && metadata.notes.length > 0 && (
                      <View style={styles.notesBox}>
                        {metadata.notes.map((note, idx) => (
                          <Text key={idx} style={styles.noteText}>{note}</Text>
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
                            <Text style={styles.mapButtonText}>📍 {link.label}</Text>
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
                          <Text style={styles.bookButtonText}>Sprawdź bilety ↗</Text>
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
                    <Text style={styles.detailsSectionTitle}>{t.outbound} {startDate ? `(${startDate})` : ''}</Text>
                    
                    <View style={styles.fullWidthInputGroup}>
                      <Text style={styles.label}>{t.departureLocation}</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="..."
                        placeholderTextColor="#475569"
                        value={transportDetails.outboundDepartureLocation}
                        onChangeText={(txt) => setTransportDetails({ outboundDepartureLocation: txt })}
                        onBlur={() => handleCheckCommute(origin, transportDetails.outboundDepartureLocation, setOutboundDepDist)}
                      />
                      {outboundDepDist !== null && outboundDepDist > 2 && (
                        <Text style={styles.commuteWarning}>
                          {t.commuteHint.replace('{{city}}', origin).replace('{{dist}}', String(outboundDepDist))}
                        </Text>
                      )}
                    </View>

                    <View style={styles.fullWidthInputGroup}>
                      <Text style={styles.label}>{t.arrivalLocation}</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="..."
                        placeholderTextColor="#475569"
                        value={transportDetails.outboundArrivalLocation}
                        onChangeText={(txt) => setTransportDetails({ outboundArrivalLocation: txt })}
                        onBlur={() => handleCheckCommute(destination, transportDetails.outboundArrivalLocation, setOutboundArrDist)}
                      />
                      {outboundArrDist !== null && outboundArrDist > 2 && (
                        <Text style={styles.commuteWarning}>
                          {t.commuteHint.replace('{{city}}', destination).replace('{{dist}}', String(outboundArrDist))}
                        </Text>
                      )}
                    </View>

                    <View style={styles.rowGroup}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t.departureTime}</Text>
                        <TextInput
                          style={styles.timeInput}
                          placeholder={t.timePlaceholder}
                          placeholderTextColor="#475569"
                          value={transportDetails.outboundDepartureTime}
                          onChangeText={(txt) => setTransportDetails({ outboundDepartureTime: txt })}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t.arrivalTime}</Text>
                        <TextInput
                          style={styles.timeInput}
                          placeholder={t.timePlaceholder}
                          placeholderTextColor="#475569"
                          value={transportDetails.outboundArrivalTime}
                          onChangeText={(txt) => setTransportDetails({ outboundArrivalTime: txt })}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                    </View>

                    {/* TRASA Z POWROTEM */}
                    {endDate ? (
                      <>
                        <View style={styles.divider} />
                        <Text style={styles.detailsSectionTitle}>{t.return} ({endDate})</Text>
                        
                        <View style={styles.fullWidthInputGroup}>
                          <Text style={styles.label}>{t.departureLocation}</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="..."
                            placeholderTextColor="#475569"
                            value={transportDetails.returnDepartureLocation}
                            onChangeText={(txt) => setTransportDetails({ returnDepartureLocation: txt })}
                            onBlur={() => handleCheckCommute(destination, transportDetails.returnDepartureLocation, setReturnDepDist)}
                          />
                          {returnDepDist !== null && returnDepDist > 2 && (
                            <Text style={styles.commuteWarning}>
                              {t.commuteHint.replace('{{city}}', destination).replace('{{dist}}', String(returnDepDist))}
                            </Text>
                          )}
                        </View>

                        <View style={styles.fullWidthInputGroup}>
                          <Text style={styles.label}>{t.arrivalLocation}</Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="..."
                            placeholderTextColor="#475569"
                            value={transportDetails.returnArrivalLocation}
                            onChangeText={(txt) => setTransportDetails({ returnArrivalLocation: txt })}
                            onBlur={() => handleCheckCommute(origin, transportDetails.returnArrivalLocation, setReturnArrDist)}
                          />
                          {returnArrDist !== null && returnArrDist > 2 && (
                            <Text style={styles.commuteWarning}>
                              {t.commuteHint.replace('{{city}}', origin).replace('{{dist}}', String(returnArrDist))}
                            </Text>
                          )}
                        </View>

                        <View style={styles.rowGroup}>
                          <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t.departureTime}</Text>
                            <TextInput
                              style={styles.timeInput}
                              placeholder={t.timePlaceholder}
                              placeholderTextColor="#475569"
                              value={transportDetails.returnDepartureTime}
                              onChangeText={(txt) => setTransportDetails({ returnDepartureTime: txt })}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                            />
                          </View>
                          <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t.arrivalTime}</Text>
                            <TextInput
                              style={styles.timeInput}
                              placeholder={t.timePlaceholder}
                              placeholderTextColor="#475569"
                              value={transportDetails.returnArrivalTime}
                              onChangeText={(txt) => setTransportDetails({ returnArrivalTime: txt })}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                            />
                          </View>
                        </View>
                      </>
                    ) : null}

                    {/* WGRYWANIE BILETU */}
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={() => Alert.alert('Sejf Offline', 'Funkcja dodawania biletów (PDF/Zdjęcia) będzie dostępna wkrótce!')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.uploadButtonText}>📎 {t.uploadTicket}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.primaryButton, !transport.selectedOption && { opacity: 0.5 }]}
            disabled={!transport.selectedOption}
            onPress={() => navigation?.navigate('Step3')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>{commonT.button_nextStep}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation?.goBack()} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>{commonT.button_goBack}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  routeSubtitle: { fontSize: 14, fontWeight: '700', color: '#F59E0B', marginTop: 4, letterSpacing: 0.5 },
  desc: { fontSize: 13, color: '#94A3B8', marginTop: 4, lineHeight: 18 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  loaderText: { color: '#94A3B8', marginTop: 12, fontSize: 14, fontWeight: '500' },
  errorBox: { backgroundColor: 'rgba(248, 113, 113, 0.08)', borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.35)', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorTitle: { color: '#F87171', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  errorText: { color: '#CBD5E1', fontSize: 12, lineHeight: 17 },
  emptyBox: { backgroundColor: '#111827', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1E293B' },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#1E293B' },
  cardSelected: { borderColor: '#F59E0B', backgroundColor: '#162032' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  providerInfo: { flex: 1, marginRight: 10 },
  typeTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  providerSubtitle: { color: '#94A3B8', fontSize: 13, marginTop: 2, fontWeight: '500' },
  notesBox: { marginBottom: 12, paddingHorizontal: 2 },
  noteText: { color: '#F59E0B', fontSize: 12, lineHeight: 17, fontStyle: 'italic', fontWeight: '600' },
  mapButton: { backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
  mapButtonText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12, marginTop: 8 },
  bookButton: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#38BDF8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  bookButtonText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  bottomActions: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1E293B', backgroundColor: '#0B1120' },
  primaryButton: { backgroundColor: '#F59E0B', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  secondaryButton: { height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  
  detailsContainer: { marginTop: 16 },
  detailsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  detailsCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  detailsSectionTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase' },
  fullWidthInputGroup: { marginBottom: 12 },
  textInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#F8FAFC', paddingHorizontal: 12, height: 44, fontSize: 14 },
  commuteWarning: { color: '#F59E0B', fontSize: 11, marginTop: 6, fontWeight: '600' },
  rowGroup: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  inputGroup: { flex: 1 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginBottom: 6 },
  timeInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#F8FAFC', paddingHorizontal: 12, height: 44, fontSize: 14, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#1E293B', marginVertical: 16 },
  uploadButton: { marginTop: 20, backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  uploadButtonText: { color: '#38BDF8', fontSize: 13, fontWeight: '700' },
});