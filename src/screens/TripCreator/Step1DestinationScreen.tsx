import React, { useState } from 'react';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { translations } from '../../i18n/translations';

// --- POMOCNICZA FUNKCJA DO PARSOWANIA DATY DD-MM-YYYY ---
const parseDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr || !dateStr.trim()) return null;
  const regex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateStr.trim().match(regex);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // Miesiące w JS są od 0 do 11
  const year = parseInt(match[3], 10);

  const date = new Date(year, month, day);
  // Sprawdzamy, czy JS nie "przekręcił" daty (np. 31-02-2026 -> 03-03-2026)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

// --- POMOCNICZA FUNKCJA DO FORMATOWANIA DATY DD-MM-YYYY ---
const formatDDMMYYYY = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// --- POMOCNICZA FUNKCJA DO WERYFIKACJI MIASTA (OPENSTREETMAP NOMINATIM) ---
const checkDestinationExists = async (query: string): Promise<boolean> => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DestivoApp/1.0', // Nominatim wymaga nagłówka User-Agent
      },
    });
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    // Jeśli brak internetu (Offline-First), nie blokujemy użytkownika!
    return true;
  }
};

export const Step1DestinationScreen: React.FC<{ navigation?: any }> = ({
  navigation,
}) => {
  const { language, toggleLanguage } = useAuthStore();
  const t = translations[language].tripCreatorStep1;
  const commonT = translations[language].common;

  const {
    tripName: storedName,
    origin: storedOrigin,
    destination: storedDest,
    startDate: storedStart,
    endDate: storedEnd,
    setStep1Data,
  } = useTripCreatorStore();

  const [tripName, setTripName] = useState(storedName);
  const [origin, setOrigin] = useState(storedOrigin);
  const [destination, setDestination] = useState(storedDest);
  const [startDate, setStartDate] = useState(storedStart);
  const [endDate, setEndDate] = useState(storedEnd);

  // Stan ładowania podczas sprawdzania miejscowości w API
  const [isValidating, setIsValidating] = useState(false);

  // --- OBSŁUGA KALENDARZA SYSTEMOWEGO ---
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(
    null
  );

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentTarget = activePicker;
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }

    if (event.type === 'set' && selectedDate && currentTarget) {
      const formatted = formatDDMMYYYY(selectedDate);
      if (currentTarget === 'start') {
        setStartDate(formatted);
      } else {
        setEndDate(formatted);
      }
    }
  };

const handleNext = async () => {
    // 1. Sprawdzenie czy wpisano cel (wymagane)
    if (!destination.trim()) {
      Alert.alert('DESTIVO', t.error_destinationRequired);
      return;
    }

    // 2. Walidacja dat (jeśli użytkownik je wpisał)
    const parsedStart = parseDDMMYYYY(startDate);
    const parsedEnd = parseDDMMYYYY(endDate);

    if (startDate.trim().length > 0) {
      if (!parsedStart) {
        Alert.alert('DESTIVO', t.error_invalidDateFormat);
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (parsedStart < today) {
        Alert.alert('DESTIVO', t.error_pastDate);
        return;
      }
    }

    if (endDate.trim().length > 0) {
      if (!parsedEnd) {
        Alert.alert('DESTIVO', t.error_invalidDateFormat);
        return;
      }
      if (parsedStart && parsedEnd < parsedStart) {
        Alert.alert('DESTIVO', t.error_dateOrder);
        return;
      }
    }

    // 3. Weryfikacja czy miejscowości istnieją (API Nominatim - równolegle dla wydajności)
    setIsValidating(true);

    const hasOrigin = origin.trim().length > 0;

    // Odpytujemy API dla destination, a jeśli podano origin — również dla origin
    const [destExists, originExists] = await Promise.all([
      checkDestinationExists(destination.trim()),
      hasOrigin ? checkDestinationExists(origin.trim()) : Promise.resolve(true),
    ]);

    setIsValidating(false);

    // Jeśli cel podróży LUB miejsce wyjazdu nie istnieje — pokazujemy ten sam błąd
    if (!destExists || (hasOrigin && !originExists)) {
      Alert.alert('DESTIVO', t.error_placeNotFound);
      return;
    }

    // 4. Zapisujemy do store'a i przechodzimy dalej
    setStep1Data({
      tripName:
        tripName.trim() || `${t.default_tripNamePrefix}${destination.trim()}`,
      origin: origin.trim(),
      destination: destination.trim(),
      startDate: startDate.trim(),
      endDate: endDate.trim(),
    });

    if (navigation) {
      navigation.navigate('Step2Transport');
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
          {/* GÓRNY PASEK Z PRZEŁĄCZNIKIEM JĘZYKA */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.langButton}
              onPress={toggleLanguage}
              activeOpacity={0.7}
            >
              <Text style={styles.langButtonText}>
                {t.button_languageSwitchLabel}
              </Text>
            </TouchableOpacity>
          </View>

          {/* PASEK POSTĘPU KREATORA */}
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>{t.step_indicator}</Text>
            <Text style={styles.progressStepName}>{t.step_title}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '25%' }]} />
          </View>

          {/* GŁÓWNA KARTA FORMULARZA */}
          <View style={styles.card}>
            <Text style={styles.title}>{t.header_title}</Text>
            <Text style={styles.subtitle}>{t.header_subtitle}</Text>

            {/* CEL PODRÓŻY (WYMAGANY) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {t.input_destinationLabel.toUpperCase()}
                </Text>
                <Text style={styles.requiredBadge}>{t.badge_required}</Text>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>📍</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t.input_destinationPlaceholder}
                  placeholderTextColor="#475569"
                  value={destination}
                  onChangeText={setDestination}
                />
              </View>
            </View>

            {/* SKĄD WYRUSZASZ (OPCJONALNE) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {t.input_originLabel.toUpperCase()}
                </Text>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>🏠</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t.input_originPlaceholder}
                  placeholderTextColor="#475569"
                  value={origin}
                  onChangeText={setOrigin}
                />
              </View>
            </View>

            {/* NAZWA PODRÓŻY (OPCJONALNE) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {t.input_tripNameLabel.toUpperCase()}
                </Text>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>✈️</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t.input_tripNamePlaceholder}
                  placeholderTextColor="#475569"
                  value={tripName}
                  onChangeText={setTripName}
                />
              </View>
            </View>

            {/* DATA WYJAZDU I POWROTU */}
            <View style={styles.rowGroup}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>
                  {t.input_startDateLabel.toUpperCase()}
                </Text>
                <View style={styles.inputContainer}>
                  {/* Kliknięcie otworzy kalendarz wyjazdu */}
                  <TouchableOpacity onPress={() => setActivePicker('start')}>
                    <Text style={styles.inputIcon}>📅</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    placeholder={t.date_placeholder}
                    placeholderTextColor="#475569"
                    value={startDate}
                    onChangeText={setStartDate}
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>
                  {t.input_endDateLabel.toUpperCase()}
                </Text>
                <View style={styles.inputContainer}>
                  {/* Kliknięcie otworzy kalendarz powrotu */}
                  <TouchableOpacity onPress={() => setActivePicker('end')}>
                    <Text style={styles.inputIcon}>📅</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    placeholder={t.date_placeholder}
                    placeholderTextColor="#475569"
                    value={endDate}
                    onChangeText={setEndDate}
                    maxLength={10}
                  />
                </View>
              </View>
            </View>

            {/* PRZYCISKI AKCJI (Z OBSŁUGĄ ŁADOWANIA) */}
            <TouchableOpacity
              style={[styles.primaryButton, isValidating && { opacity: 0.7 }]}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={isValidating}
            >
              {isValidating ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {commonT.button_nextStep} →
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation?.goBack()}
              activeOpacity={0.8}
              disabled={isValidating}
            >
              <Text style={styles.secondaryButtonText}>
                {commonT.button_cancel}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SYSTEMOWY KALENDARZ */}
      {activePicker !== null && (
        <DateTimePicker
          value={
            (activePicker === 'start'
              ? parseDDMMYYYY(startDate)
              : parseDDMMYYYY(endDate)) || new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}
      
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langButtonText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  progressStepName: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1E293B',
    borderRadius: 2,
    marginBottom: 20,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#F59E0B',
    borderRadius: 2,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,     
    borderColor: '#1E293B',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  rowGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  requiredBadge: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
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
  inputIcon: {
    fontSize: 15,
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
  },
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
  primaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
});