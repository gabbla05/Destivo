import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { usePowerSync } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { LiveDestination } from '../lib/liveExplore';
import { translations } from '../i18n/translations';
import { checkTripCollision } from '../lib/tripCollision';
import AsyncStorage from '@react-native-async-storage/async-storage';

const parseDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr || !dateStr.trim()) return null;
  const normalized = dateStr.trim().replace(/[./]/g, '-');
  const parts = normalized.split('-');
  if (parts.length !== 3) return null;
  let day: number, month: number, year: number;
  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
  }
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
};

const formatDDMMYYYY = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

export const QuickSetupScreen: React.FC<{ route: any, navigation: any }> = ({ route, navigation }) => {
  const { destData } = route.params as { destData: LiveDestination };
  const { user, isGuest, language } = useAuthStore();
  const t = translations[language].quickSetup;
  const db = usePowerSync();
  const tripTitle = destData.city.trim();

  const normalizeDate = (d?: string) => (d ? d.replace(/[./]/g, '-') : '');

  const [origin, setOrigin] = useState('');
  const [startDate, setStartDate] = useState(normalizeDate(destData.proposedTrip?.startDate));
  const [endDate, setEndDate] = useState(
    destData.isDayTrip
      ? normalizeDate(destData.proposedTrip?.startDate)
      : normalizeDate(destData.proposedTrip?.endDate)
  );
  const [lodging, setLodging] = useState('');
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

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentTarget = activePicker;
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selectedDate && currentTarget) {
      const formatted = formatDDMMYYYY(selectedDate);
      if (currentTarget === 'start') {
        setStartDate(formatted);
        if (destData.isDayTrip) {
          setEndDate(formatted);
        }
      } else {
        setEndDate(formatted);
      }
    }
  };

  const handleStartDateTextChange = (text: string) => {
    setStartDate(text);
    if (destData.isDayTrip) {
      setEndDate(text);
    }
  };

  const formatToDBDate = (dateStr: string) => {
    if (!dateStr) return '';
    const normalized = dateStr.replace(/\./g, '-');
    const parts = normalized.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return normalized;
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return normalized;
  };

  const handleSaveTrip = async () => {
    try {
      const userId = user?.id || 'guest';
      if (isGuest || user?.isGuest || !user) {
        const existingTrips = await db.execute(
          'SELECT 1 FROM trips WHERE user_id = ? LIMIT 1',
          [userId]
        );
        const rows = ((existingTrips as any)?.array || (existingTrips as any)?.rows?._array || (existingTrips as any)?.rows || []) as any[];
        if (rows.length > 0) {
          Alert.alert('DESTIVO', t.error_guestTripExists);
          return;
        }
      }

      // Walidacja kolizji dat z istniejącymi podróżami (dwie podróże nie mogą trwać w tym samym czasie)
      const collidingTrip = await checkTripCollision(db, userId, startDate, endDate);
      if (collidingTrip) {
        const errorMsg = (t.error_overlappingTrip || 'W tym terminie masz już zaplanowaną inną podróż ({{trip}}: {{range}}). Podróże nie mogą się nakładać.')
          .replace('{{trip}}', collidingTrip.trip_name)
          .replace('{{range}}', collidingTrip.formattedRange);
        Alert.alert('DESTIVO', errorMsg);
        return;
      }
      
      const tripId = Crypto.randomUUID();
      const cleanLodging = lodging && !['ok', 'brak', 'none', '-'].includes(lodging.trim().toLowerCase()) ? lodging.trim() : '';
      const transportJson = JSON.stringify({ selectedOption: { type: destData.recommendedTransport } });
      const lodgingJson = JSON.stringify({ lodgingAddress: cleanLodging });
      
      const flatAttractions = destData.proposedTrip?.itinerary.flatMap(day => day.attractions) || [];
      
      const generatedPool = flatAttractions.map((attr, index) => ({
        id: `qs_pool_${index}`,
        name: attr,
        imageUrl: destData.coverImage 
      }));

      // Budujemy kompletną oś czasu (customTimeline) zoptymalizowaną przez TSP z noclegami o 22:00
      const timelineT = (translations[language] as any)?.timeline || {};
      const initialTimeline: any[] = [];
      const startParsed = parseDDMMYYYY(startDate) || new Date();
      const endParsed = parseDDMMYYYY(endDate) || startParsed;
      const diffTime = Math.max(0, endParsed.getTime() - startParsed.getTime());
      const diffDays = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

      // 1. Wyjazd (DEPARTURE)
      const depDate = new Date(startParsed);
      depDate.setHours(8, 0, 0, 0);
      initialTimeline.push({
        id: 'evt_dep',
        type: 'DEPARTURE',
        title: (timelineT.departurePrefix || 'Wyjazd: {{origin}} ➔ {{destination}}')
          .replace('{{origin}}', origin || timelineT.home || 'Start')
          .replace('{{destination}}', destData.city),
        subtitle: destData.isDayTrip
          ? (language === 'pl' ? 'Wyprawa samochodem (1 dzień bez noclegu)' : 'Car road trip (1 day without overnight stay)')
          : `Podróż (${(destData.recommendedTransport || 'flight').toUpperCase()})`,
        dateStr: startDate,
        timeStr: '08:00',
        parsedDate: depDate.toISOString(),
      });

      // 2. Zameldowanie (LODGING)
      if (cleanLodging && !destData.isDayTrip) {
        const checkinDate = new Date(startParsed);
        checkinDate.setHours(14, 0, 0, 0);
        initialTimeline.push({
          id: 'evt_lodging',
          type: 'LODGING',
          title: timelineT.lodging || 'Zakwaterowanie',
          subtitle: cleanLodging,
          dateStr: startDate,
          timeStr: '14:00',
          parsedDate: checkinDate.toISOString(),
        });
      }

      // 3. Atrakcje ułożone według planu podróży z podziałem na dni
      const itinerary = destData.proposedTrip?.itinerary || [];
      itinerary.forEach((dayPlan, dayIdx) => {
        const dayDate = new Date(startParsed);
        dayDate.setDate(dayDate.getDate() + dayIdx);
        const dayDateStr = formatDDMMYYYY(dayDate);

        dayPlan.attractions.forEach((attrName, attrIdx) => {
          const hour = 10 + attrIdx * 2;
          const attrTime = `${String(Math.min(20, hour)).padStart(2, '0')}:00`;
          const attrParsed = new Date(dayDate);
          attrParsed.setHours(Math.min(20, hour), 0, 0, 0);

          initialTimeline.push({
            id: `evt_attr_${dayIdx}_${attrIdx}_${Date.now()}`,
            type: 'ATTRACTION',
            title: attrName,
            subtitle: timelineT.sightseeing || 'Zwiedzanie',
            dateStr: dayDateStr,
            timeStr: attrTime,
            parsedDate: attrParsed.toISOString(),
          });
        });
      });

      // 4. Noclegi pomiędzy dniami podróży (22:00, user może edytować)
      if (diffDays >= 1 && !destData.isDayTrip) {
        for (let d = 0; d < diffDays; d++) {
          const nightDate = new Date(startParsed);
          nightDate.setDate(nightDate.getDate() + d);
          nightDate.setHours(22, 0, 0, 0);
          const nightDateStr = formatDDMMYYYY(nightDate);

          initialTimeline.push({
            id: `evt_night_${d}_${Date.now()}`,
            type: 'LODGING',
            title: timelineT.lodgingNightTitle || 'Nocleg',
            subtitle: cleanLodging,
            dateStr: nightDateStr,
            timeStr: '22:00',
            parsedDate: nightDate.toISOString(),
          });
        }
      }

      // 5. Powrót (RETURN)
      const retDate = new Date(endParsed);
      retDate.setHours(18, 0, 0, 0);
      initialTimeline.push({
        id: 'evt_return',
        type: 'RETURN',
        title: (timelineT.returnPrefix || 'Powrót: {{destination}} ➔ {{origin}}')
          .replace('{{destination}}', destData.city)
          .replace('{{origin}}', origin || timelineT.home || 'Koniec'),
        subtitle: destData.isDayTrip
          ? (language === 'pl' ? 'Powrót tego samego dnia' : 'Same-day return')
          : timelineT.returnTrip || 'Podróż powrotna',
        dateStr: endDate,
        timeStr: '18:00',
        parsedDate: retDate.toISOString(),
      });

      initialTimeline.sort((a, b) => new Date(a.parsedDate).getTime() - new Date(b.parsedDate).getTime());

      const attractionsJson = JSON.stringify({ 
        selected: flatAttractions,
        pool: generatedPool,
        customTimeline: initialTimeline
      });
      const dbStartDate = formatToDBDate(startDate);
      const dbEndDate = formatToDBDate(endDate);

      await db.execute(
        `INSERT INTO trips
         (id, user_id, trip_name, origin, destination, start_date, end_date, transport_data, lodging_data, attractions_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          tripId,
          userId,
          tripTitle,
          origin || '',
          destData.city,
          dbStartDate,
          dbEndDate,
          transportJson,
          lodgingJson,
          attractionsJson,
        ]
      );

      if (user && !isGuest && !user.isGuest) {
        const { error: supabaseError } = await supabase
          .from('trips')
          .insert([{
            id: tripId,
            user_id: userId,
            title: tripTitle,
            origin: origin || '',
            destination: destData.city,
            start_date: dbStartDate,
            end_date: dbEndDate,
            transport_type: destData.recommendedTransport || 'flight',
            accommodation_address: cleanLodging,
            attractions_data: attractionsJson,
          }]);

        if (supabaseError) {
          console.warn('Błąd bezpośredniego zapisu do Supabase:', supabaseError);
        }
      }
      
      // Kopia zapasowa w AsyncStorage
      try {
        const cacheKey = `destivo_cached_trips_${userId}`;
        const existingCacheStr = await AsyncStorage.getItem(cacheKey);
        const existingCache = existingCacheStr ? JSON.parse(existingCacheStr) : [];
        const newTripRecord = {
          id: tripId,
          title: tripTitle,
          origin: origin || '',
          destination: destData.city,
          start_date: dbStartDate,
          end_date: dbEndDate,
        };
        const updatedCache = [newTripRecord, ...existingCache.filter((t: any) => t.id !== tripId)];
        await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedCache));
      } catch (cacheErr) {
        console.warn('Błąd zapisu do cache AsyncStorage w QuickSetup:', cacheErr);
      }

      Alert.alert('DESTIVO', t.saveSuccess);
      navigation.navigate('MainTabs', { screen: 'Trips' });
    } catch (error) {
      console.error('Błąd zapisu podróży w QuickSetupScreen:', error);
      Alert.alert('DESTIVO', t.saveError);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: isKeyboardVisible 
                ? (Platform.OS === 'android' ? 400 : keyboardHeight + 80)
                : 100
            }
          ]} 
          bounces={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle.replace('{{city}}', destData.city)}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.tripNameLabel}</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyInputText}>{tripTitle}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.originLabel}</Text>
            <TextInput style={styles.input} placeholder={t.originPlaceholder} placeholderTextColor="#94A3B8" value={origin} onChangeText={setOrigin} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>{t.departureDateLabel}</Text>
              <View style={styles.dateInputContainer}>
                <TouchableOpacity
                  onPress={() => setActivePicker('start')}
                  activeOpacity={0.7}
                  style={styles.dateIconTouch}
                >
                  <Ionicons name="calendar-outline" size={18} color="#F59E0B" />
                </TouchableOpacity>
                <TextInput
                  style={styles.dateInput}
                  placeholder={t.datePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={startDate}
                  onChangeText={handleStartDateTextChange}
                  maxLength={10}
                />
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>
                {t.returnDateLabel} {destData.isDayTrip && `(${t.dayTripReturnHint || 'Ten sam dzień'})`}
              </Text>
              <View style={styles.dateInputContainer}>
                <TouchableOpacity
                  onPress={() => {
                    if (!destData.isDayTrip) setActivePicker('end');
                  }}
                  activeOpacity={destData.isDayTrip ? 1 : 0.7}
                  style={styles.dateIconTouch}
                >
                  <Ionicons name="calendar-outline" size={18} color="#F59E0B" />
                </TouchableOpacity>
                <TextInput
                  style={[styles.dateInput, destData.isDayTrip && { color: '#94A3B8' }]}
                  placeholder={t.datePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={endDate}
                  onChangeText={setEndDate}
                  editable={!destData.isDayTrip}
                  maxLength={10}
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {destData.isDayTrip
                ? (t.dayTripLodgingLabel || (language === 'pl' ? 'ADRES / PRZYSTANEK (Opcjonalnie - brak noclegu)' : 'ADDRESS / STOP (Optional - no overnight stay)'))
                : t.lodgingLabel}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={destData.isDayTrip
                ? (t.dayTripLodgingPlaceholder || (language === 'pl' ? 'np. Parking pod zamkiem, restauracja...' : 'e.g. Castle parking, restaurant...'))
                : t.lodgingPlaceholder}
              placeholderTextColor="#94A3B8"
              value={lodging}
              onChangeText={setLodging}
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveTrip}>
            <Text style={styles.primaryButtonText}>{t.saveAndFinish}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#0B1120' },
  content: { padding: 24, paddingTop: 20, paddingBottom: 100, flexGrow: 1 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#CBD5E1', fontSize: 14, lineHeight: 20, marginBottom: 30 },
  inputGroup: { marginBottom: 20 },
  row: { flexDirection: 'row' },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, color: '#FFF', paddingHorizontal: 16, height: 50 },
  dateInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, height: 50, paddingHorizontal: 12 },
  dateIconTouch: { marginRight: 8 },
  dateInput: { flex: 1, color: '#FFF', fontSize: 14, height: '100%' },
  readOnlyInput: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 16, height: 50, justifyContent: 'center' },
  readOnlyInputText: { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  primaryButton: { backgroundColor: '#F59E0B', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 10, backgroundColor: 'transparent' },
  secondaryButtonText: { color: '#F59E0B', fontSize: 14, fontWeight: '700' }
});