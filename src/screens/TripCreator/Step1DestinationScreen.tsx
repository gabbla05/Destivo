import React, { useState, useEffect } from 'react';
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
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { translations } from '../../i18n/translations';
import { usePowerSync } from '@powersync/react-native';

// --- POMOCNICZA FUNKCJA DO AUTOMATYCZNEJ DUŻEJ LITERY W NAZWACH MIAST ---
export const capitalizeCity = (str: string): string => {
  if (!str) return '';
  return str.replace(/(^|[\s\-])(\S)/g, (_, sep, char) => sep + char.toUpperCase());
};

// --- POMOCNICZA FUNKCJA DO PARSOWANIA DATY DD-MM-YYYY ---
const parseDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr || !dateStr.trim()) return null;
  const regex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateStr.trim().match(regex);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; 
  const year = parseInt(match[3], 10);
  const date = new Date(year, month, day);
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
        'User-Agent': 'DestivoApp/1.0',
      },
    });
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    return true;
  }
};

export const Step1DestinationScreen: React.FC<{ navigation?: any }> = ({
  navigation,
}) => {
  const { language, isGuest, user, logout } = useAuthStore();
  const t = translations[language].tripCreatorStep1;
  const commonT = translations[language].common;
  const db = usePowerSync();

  const {
    tripName: storedName,
    origin: storedOrigin,
    destination: storedDest,
    startDate: storedStart,
    endDate: storedEnd,
    setStep1Data,
  } = useTripCreatorStore();

  const normalizeDateInput = (val?: string) => (val ? val.trim().replace(/[./]/g, '-') : '');

  const [tripName, setTripName] = useState(storedName);
  const [origin, setOrigin] = useState(capitalizeCity(storedOrigin));
  const [destination, setDestination] = useState(capitalizeCity(storedDest));
  const [startDate, setStartDate] = useState(normalizeDateInput(storedStart));
  const [endDate, setEndDate] = useState(normalizeDateInput(storedEnd));

  const [isValidating, setIsValidating] = useState(false);
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates?.height || 280);
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

  const checkGuestTripLimit = async (): Promise<boolean> => {
    if (isGuest || user?.isGuest || !user) {
      try {
        const userId = user?.id || 'guest';
        const result = await db.execute('SELECT 1 FROM trips WHERE user_id = ? LIMIT 1', [userId]);
        const rows = (((result as any).array?.length > 0
          ? (result as any).array
          : (result.rows as any)?._array || (result.rows as any) || [])) as any[];
        if (rows.length > 0) {
          Alert.alert(
            t.guestLimitTitle,
            t.guestLimitMessage,
            [
              { text: commonT.button_cancel, style: 'cancel', onPress: () => navigation?.goBack() },
              { text: t.guestLimitGoToTrips, onPress: () => navigation?.navigate('MainTabs', { screen: 'Trips' }) },
              { text: t.guestLimitLogin, onPress: () => logout() }
            ]
          );
          return false;
        }
      } catch (e) {
        console.warn('Błąd sprawdzania limitu gościa:', e);
      }
    }
    return true;
  };

  useEffect(() => {
    checkGuestTripLimit();
  }, []);

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
    // 0. Sprawdzenie limitu konta gościa
    const canProceed = await checkGuestTripLimit();
    if (!canProceed) return;

    const formattedDestination = capitalizeCity(destination.trim());
    const formattedOrigin = capitalizeCity(origin.trim());

    // 1. Sprawdzenie czy wpisano miejsca
    if (!formattedDestination) {
      Alert.alert('DESTIVO', t.error_destinationRequired);
      return;
    }

    // 2. Walidacja dat
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

    // 3. Weryfikacja czy miejscowości istnieją
    setIsValidating(true);
    const [destExists, originExists] = await Promise.all([
      checkDestinationExists(formattedDestination),
      formattedOrigin ? checkDestinationExists(formattedOrigin) : Promise.resolve(true),
    ]);
    setIsValidating(false);

    if (!destExists || !originExists) {
      Alert.alert('DESTIVO', t.error_placeNotFound);
      return;
    }

    // 4. Zapisujemy do store'a i przechodzimy dalej
    setStep1Data({
      tripName: tripName.trim() || `${t.default_tripNamePrefix}${formattedDestination}`,
      origin: formattedOrigin,
      destination: formattedDestination,
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: isKeyboardVisible ? (Platform.OS === 'android' ? 240 : keyboardHeight + 40) : 100 }
          ]} 
          bounces={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
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

            {/* SKĄD WYRUSZASZ (Musi być pierwsze, żeby było intuicyjne!) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {t.input_originLabel.toUpperCase()}
                </Text>
                <Text style={styles.requiredBadge}>{t.badge_required}</Text>
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="navigate-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t.input_originPlaceholder}
                  placeholderTextColor="#475569"
                  value={origin}
                  onChangeText={(val) => setOrigin(capitalizeCity(val))}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* CEL PODRÓŻY */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {t.input_destinationLabel.toUpperCase()}
                </Text>
                <Text style={styles.requiredBadge}>{t.badge_required}</Text>
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="location-outline" size={18} color="#F59E0B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t.input_destinationPlaceholder}
                  placeholderTextColor="#475569"
                  value={destination}
                  onChangeText={(val) => setDestination(capitalizeCity(val))}
                  autoCapitalize="words"
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
                <Ionicons name="bookmark-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t.input_tripNamePlaceholder}
                  placeholderTextColor="#475569"
                  value={tripName}
                  onChangeText={setTripName}
                  autoCapitalize="sentences"
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
                  <TouchableOpacity onPress={() => setActivePicker('start')} activeOpacity={0.7} style={styles.dateIconTouch}>
                    <Ionicons name="calendar-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
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
                  <TouchableOpacity onPress={() => setActivePicker('end')} activeOpacity={0.7} style={styles.dateIconTouch}>
                    <Ionicons name="calendar-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
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

            {/* PRZYCISKI AKCJI */}
            <TouchableOpacity
              style={[styles.primaryButton, isValidating && { opacity: 0.7 }]}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={isValidating}
            >
              {isValidating ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <View style={styles.buttonRowContent}>
                  <Text style={styles.primaryButtonText}>
                    {commonT.button_nextStep}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#0F172A" style={{ marginLeft: 6 }} />
                </View>
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
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  langButton: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#1E293B', borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  langButtonText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#F59E0B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  progressStepName: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 4, backgroundColor: '#1E293B', borderRadius: 2, marginBottom: 20 },
  progressBarFill: { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  card: { backgroundColor: '#111827', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#1E293B' },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#94A3B8', marginBottom: 24, lineHeight: 20 },
  inputGroup: { marginBottom: 16 },
  rowGroup: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  requiredBadge: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, paddingHorizontal: 12, height: 48 },
  inputIcon: { marginRight: 10 },
  dateIconTouch: { justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, color: '#F8FAFC', fontSize: 14 },
  primaryButton: { backgroundColor: '#F59E0B', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  buttonRowContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  secondaryButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});