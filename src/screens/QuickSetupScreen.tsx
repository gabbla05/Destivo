import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../store/authStore';
import { LiveDestination } from '../lib/liveExplore';
import { translations } from '../i18n/translations';

export const QuickSetupScreen: React.FC<{ route: any, navigation: any }> = ({ route, navigation }) => {
  const { destData } = route.params as { destData: LiveDestination };
  const { user, language } = useAuthStore();
  const t = translations[language].quickSetup;

  const [origin, setOrigin] = useState('');
  const [startDate, setStartDate] = useState(destData.proposedTrip?.startDate || '');
  const [endDate, setEndDate] = useState(destData.proposedTrip?.endDate || '');
  const [lodging, setLodging] = useState('');
  const handleSaveTrip = async () => {
    try {
      const tripId = Crypto.randomUUID();
      const userId = user?.id || 'guest';

      const transportJson = JSON.stringify({ selectedOption: { type: destData.recommendedTransport } });
      const lodgingJson = JSON.stringify({ lodgingAddress: lodging });
      const flatAttractions = destData.proposedTrip?.itinerary.flatMap(day => day.attractions) || []; 
      const trip = {
        id: tripId,
        user_id: userId,
        trip_name: `${t.tripNamePrefix}${destData.city}`,
        origin: origin || t.noValue,
        destination: destData.city,
        start_date: startDate || t.noDate,
        end_date: endDate || t.noDate,
        transport_data: transportJson,
        lodging_data: lodgingJson,
        attractions_data: JSON.stringify({ selected: flatAttractions }),
        created_at: new Date().toISOString(),
      };
      const storageKey = `destivo-trips-${userId}`;
      const storedTrips = await AsyncStorage.getItem(storageKey);
      const trips = storedTrips ? JSON.parse(storedTrips) : [];
      await AsyncStorage.setItem(storageKey, JSON.stringify([...trips, trip]));

      Alert.alert('DESTIVO', t.saveSuccess);
      navigation.navigate('MainTabs', { screen: 'Explore' });
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