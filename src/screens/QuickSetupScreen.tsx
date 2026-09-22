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
  const [endDate, setEndDate] = useState(normalizeDate(destData.proposedTrip?.endDate));
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
      } else {
        setEndDate(formatted);
      }
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
      const transportJson = JSON.stringify({ selectedOption: { type: destData.recommendedTransport } });
      const lodgingJson = JSON.stringify({ lodgingAddress: lodging });
      
      const flatAttractions = destData.proposedTrip?.itinerary.flatMap(day => day.attractions) || [];
      
      const generatedPool = flatAttractions.map((attr, index) => ({
        id: `qs_pool_${index}`,
        name: attr,
        imageUrl: destData.coverImage 
      }));

      const attractionsJson = JSON.stringify({ 
        selected: flatAttractions,
        pool: generatedPool 
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
            accommodation_address: lodging || '',
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
                ? (Platform.OS === 'android' ? 300 : keyboardHeight + 60)
                : 100
            }
          ]} 
          bounces={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
                  onChangeText={setStartDate}
                  maxLength={10}
                />
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>{t.returnDateLabel}</Text>
              <View style={styles.dateInputContainer}>
                <TouchableOpacity
                  onPress={() => setActivePicker('end')}
                  activeOpacity={0.7}
                  style={styles.dateIconTouch}
                >
                  <Ionicons name="calendar-outline" size={18} color="#F59E0B" />
                </TouchableOpacity>
                <TextInput
                  style={styles.dateInput}
                  placeholder={t.datePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={endDate}
                  onChangeText={setEndDate}
                  maxLength={10}
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.lodgingLabel}</Text>
            <TextInput style={styles.input} placeholder={t.lodgingPlaceholder} placeholderTextColor="#94A3B8" value={lodging} onChangeText={setLodging} />
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