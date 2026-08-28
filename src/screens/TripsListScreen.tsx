// src/screens/TripsListScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface TripRecord {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
}

export const TripsListScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRecord[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      fetchTrips();
    }, [user?.id])
  );

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const isUserGuest = user?.isGuest || !user;
      
      if (isUserGuest) {
        const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
        if (storedTrips) {
          setTrips(JSON.parse(storedTrips));
        } else {
          setTrips([]);
        }
      } else {
        const { data, error } = await supabase
          .from('trips')
          .select('id, title, origin, destination, start_date, end_date')
          .eq('user_id', user.id)
          .order('start_date', { ascending: true }); // sortowanie od najbliższego wyjazdu

        if (error) throw error;
        setTrips(data || []);
      }
    } catch (e) {
      console.error('Błąd pobierania listy podróży:', e);
      Alert.alert('Błąd', 'Nie udało się wczytać listy podróży.');
    } finally {
      setLoading(false);
    }
  };

  const handleTripPress = (tripId: string) => {
    navigation.navigate('Timeline', { tripId }); // Przechodzimy na oś czasu i przekazujemy ID wycieczki!
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dateStr;
  };

  // Rozdzielamy na archiwalne i nadchodzące
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingTrips = trips.filter((t) => {
    if (!t.end_date) return true;
    const [y, m, d] = t.end_date.split('-');
    const endDate = new Date(Number(y), Number(m) - 1, Number(d));
    return endDate >= now;
  });

  const pastTrips = trips.filter((t) => {
    if (!t.end_date) return false;
    const [y, m, d] = t.end_date.split('-');
    const endDate = new Date(Number(y), Number(m) - 1, Number(d));
    return endDate < now;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Twoje podróże</Text>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Nie masz jeszcze żadnych podróży.</Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Explore')}
          >
            <Text style={styles.primaryButtonText}>Zaplanuj coś!</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {upcomingTrips.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Nadchodzące</Text>
              {upcomingTrips.map((trip) => (
                <TouchableOpacity 
                  key={trip.id} 
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => handleTripPress(trip.id)}
                >
                  <Text style={styles.cardTitle}>{trip.title}</Text>
                  <Text style={styles.cardRoute}>{trip.origin || 'Dom'} ➔ {trip.destination}</Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardDate}>
                      {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                    </Text>
                    <Text style={styles.arrowIcon}>→</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {pastTrips.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Archiwalne</Text>
              {pastTrips.map((trip) => (
                <TouchableOpacity 
                  key={trip.id} 
                  style={[styles.card, styles.cardPast]}
                  activeOpacity={0.8}
                  onPress={() => handleTripPress(trip.id)}
                >
                  <Text style={styles.cardTitle}>{trip.title}</Text>
                  <Text style={styles.cardRoute}>{trip.origin || 'Dom'} ➔ {trip.destination}</Text>
                  <Text style={styles.cardDate}>
                    {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B', backgroundColor: '#0B1120' },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#94A3B8', fontSize: 16, marginBottom: 20 },
  primaryButton: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { color: '#F59E0B', fontSize: 14, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E293B' },
  cardPast: { opacity: 0.7 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardRoute: { color: '#94A3B8', fontSize: 14, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { color: '#38BDF8', fontSize: 13, fontWeight: '600' },
  arrowIcon: { color: '#F59E0B', fontSize: 18, fontWeight: 'bold' }
});