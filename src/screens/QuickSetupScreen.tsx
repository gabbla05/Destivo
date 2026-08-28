import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePowerSync } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../store/authStore';
import { LiveDestination } from '../lib/liveExplore';
import { translations } from '../i18n/translations';

export const QuickSetupScreen: React.FC<{ route: any, navigation: any }> = ({ route, navigation }) => {
  const { destData } = route.params as { destData: LiveDestination };
  const { user, isGuest, language } = useAuthStore();
  const t = translations[language].quickSetup;
  const db = usePowerSync();

  const [origin, setOrigin] = useState('');
  const [startDate, setStartDate] = useState(destData.proposedTrip?.startDate || '');
  const [endDate, setEndDate] = useState(destData.proposedTrip?.endDate || '');
  const [lodging, setLodging] = useState('');
  const handleSaveTrip = async () => {
    try {
      const userId = user?.id || 'guest';

      if (isGuest || user?.isGuest) {
        const existingTrips = await db.execute(
          'SELECT 1 FROM trips WHERE user_id = ? LIMIT 1',
          [userId]
        );

        if ((existingTrips.rows?.length ?? 0) > 0) {
          Alert.alert('DESTIVO', t.error_guestTripExists);
          return;
        }
      }

      const tripId = Crypto.randomUUID();
    const transportJson = JSON.stringify({ selectedOption: { type: destData.recommendedTransport } });
    const lodgingJson = JSON.stringify({ lodgingAddress: lodging });
    
    // Pobranie płaskiej listy atrakcji z proponowanego planu
    const flatAttractions = destData.proposedTrip?.itinerary.flatMap(day => day.attractions) || [];
    
    // TWORZENIE PULI DLA TIMELINE SCREEN
    const generatedPool = flatAttractions.map((attr, index) => ({
      id: `qs_pool_${index}`,
      name: attr,
      imageUrl: destData.coverImage // Fallback na zdjęcie miasta
    }));

    // Zmodyfikowany obiekt JSON zapisujący 'selected' oraz 'pool'
    const attractionsJson = JSON.stringify({ 
      selected: flatAttractions,
      pool: generatedPool 
    });

    await db.execute(
      `INSERT INTO trips 
      (id, user_id, trip_name, origin, destination, start_date, end_date, transport_data, lodging_data, attractions_data, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tripId,
        userId,
        `${t.tripNamePrefix}${destData.city}`,
        origin || t.noValue,
        destData.city,
        startDate || t.noDate,
        endDate || t.noDate,
        transportJson,
        lodgingJson,
        attractionsJson, // Zastąpiono surowy flatAttractions gotowym obiektem
      ]
    );
    
    Alert.alert('DESTIVO', t.saveSuccess);
    navigation.navigate('MainTabs', { screen: 'Trips' });
  } catch (error) {
    console.error('Błąd zapisu podróży w QuickSetupScreen:', error);
    Alert.alert('DESTIVO', t.saveError);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle.replace('{{city}}', destData.city)}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.originLabel}</Text>
            <TextInput style={styles.input} placeholder={t.originPlaceholder} placeholderTextColor="#475569" value={origin} onChangeText={setOrigin} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>{t.departureDateLabel}</Text>
              <TextInput style={styles.input} placeholder={t.datePlaceholder} placeholderTextColor="#475569" value={startDate} onChangeText={setStartDate} />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>{t.returnDateLabel}</Text>
              <TextInput style={styles.input} placeholder={t.datePlaceholder} placeholderTextColor="#475569" value={endDate} onChangeText={setEndDate} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.lodgingLabel}</Text>
            <TextInput style={styles.input} placeholder={t.lodgingPlaceholder} placeholderTextColor="#475569" value={lodging} onChangeText={setLodging} />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveTrip}>
            <Text style={styles.primaryButtonText}>{t.saveAndFinish}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryButtonText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  content: { padding: 24, paddingTop: 40 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginBottom: 30 },
  inputGroup: { marginBottom: 20 },
  row: { flexDirection: 'row' },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, color: '#FFF', paddingHorizontal: 16, height: 50 },
  primaryButton: { backgroundColor: '#F59E0B', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' }
});