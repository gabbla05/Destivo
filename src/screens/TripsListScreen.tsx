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
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePowerSync } from '@powersync/react-native';
import { useAuthStore } from '../store/authStore';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';

interface TripRecord {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
}

export const TripsListScreen = ({ navigation }: any) => {
  const { user, language } = useAuthStore();
  const t = translations[language].trips;
  const commonT = translations[language].common;
  const db = usePowerSync();
  const [loading, setLoading] = useState(false); // Zmieniono z true na false
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const userId = user?.id || 'guest';
      const result = await db.execute(
        `SELECT id, trip_name, origin, destination, start_date, end_date
         FROM trips WHERE user_id = ? ORDER BY start_date ASC`,
        [userId]
      );
      const localRows = ((result as any).array?.length > 0
        ? (result as any).array
        : (result.rows as any)?._array || (result.rows as any) || []) as any[];
      const localTrips = localRows.map((trip: any) => ({
        id: trip.id,
        title: trip.trip_name || trip.title || t.untitled,
        origin: trip.origin || '',
        destination: trip.destination || '',
        start_date: trip.start_date || '',
        end_date: trip.end_date || '',
      }));

      const tripsById = new Map(localTrips.map((trip) => [trip.id, trip]));

      try {
        const { data } = await supabase
          .from('trips')
          .select('id, title, trip_name, origin, destination, start_date, end_date')
          .eq('user_id', userId)
          .order('start_date', { ascending: true });
        (data || []).forEach((trip: any) => {
          if (!tripsById.has(trip.id)) {
            tripsById.set(trip.id, {
              id: trip.id,
              title: trip.title || trip.trip_name || t.untitled,
              origin: trip.origin || '',
              destination: trip.destination || '',
              start_date: trip.start_date || '',
              end_date: trip.end_date || '',
            });
          }
        });
      } catch {
        // Local PowerSync data remains available when the network is offline.
      }

      if (user?.isGuest || !user) {
        const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
        (storedTrips ? JSON.parse(storedTrips) : []).forEach((trip: any) => {
          if (!tripsById.has(trip.id)) {
            tripsById.set(trip.id, {
              id: trip.id,
              title: trip.title || trip.trip_name || t.untitled,
              origin: trip.origin || '',
              destination: trip.destination || '',
              start_date: trip.start_date || '',
              end_date: trip.end_date || '',
            });
          }
        });
      }

      setTrips(Array.from(tripsById.values()));
    } catch (e) {
      Alert.alert(commonT.label_error, t.loadError);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchTrips();
    }, [user?.id])
  );
  
  // ... reszta kodu ekranu

  const handleTripPress = (tripId: string) => {
    navigation.navigate('Timeline', { tripId });
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.replace(/\./g, '-').split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[2]}.${parts[1]}.${parts[0]}`;
      return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }
    return dateStr;
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingTrips = trips.filter((t) => {
    if (!t.end_date) return true;
    const [first, second, third] = t.end_date.replace(/\./g, '-').split('-');
    const [y, m, d] = first.length === 4 ? [first, second, third] : [third, second, first];
    const endDate = new Date(Number(y), Number(m) - 1, Number(d));
    return endDate >= now;
  });

  const pastTrips = trips.filter((t) => {
    if (!t.end_date) return false;
    const [first, second, third] = t.end_date.replace(/\./g, '-').split('-');
    const [y, m, d] = first.length === 4 ? [first, second, third] : [third, second, first];
    const endDate = new Date(Number(y), Number(m) - 1, Number(d));
    return endDate < now;
  });

  // Obliczanie statystyk dla archiwalnych podróży
  const uniquePlacesCount = new Set(pastTrips.map(t => t.destination)).size;
  const totalDaysTraveled = pastTrips.reduce((total, trip) => {
    if (!trip.start_date || !trip.end_date) return total;
    const startParts = trip.start_date.split('-');
    const endParts = trip.end_date.split('-');
    const start = startParts[0].length === 4
      ? new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]))
      : new Date(Number(startParts[2]), Number(startParts[1]) - 1, Number(startParts[0]));
    const end = endParts[0].length === 4
      ? new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]))
      : new Date(Number(endParts[2]), Number(endParts[1]) - 1, Number(endParts[0]));
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return total + (diffDays > 0 ? diffDays : 1); // Minimum 1 dzień
  }, 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.title}</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'upcoming' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>{t.upcoming}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'past' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>{t.archived}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>{t.empty}</Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Explore')}
          >
            <Text style={styles.primaryButtonText}>{t.plan}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* ZAKŁADKA NADCHODZĄCE */}
          {activeTab === 'upcoming' && (
            <>
              {upcomingTrips.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>{t.noUpcoming}</Text>
                </View>
              ) : (
                upcomingTrips.map((trip) => (
                  <TouchableOpacity 
                    key={trip.id} 
                    style={styles.card}
                    activeOpacity={0.8}
                    onPress={() => handleTripPress(trip.id)}
                  >
                    <Text style={styles.cardTitle}>{trip.title}</Text>
                    <Text style={styles.cardRoute}>{trip.origin || t.home} ➔ {trip.destination}</Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardDate}>
                        {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                      </Text>
                      <Text style={styles.arrowIcon}>➔</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* ZAKŁADKA ARCHIWALNE */}
          {activeTab === 'past' && (
            <>
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>{t.memories}</Text>
                <Text style={styles.statsSubtitle}>
                  {t.memoriesDesc}
                </Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statValue}>{uniquePlacesCount}</Text>
                    <Text style={styles.statLabel}>{t.visited}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statValue}>{totalDaysTraveled}</Text>
                    <Text style={styles.statLabel}>{t.days}</Text>
                  </View>
                </View>
              </View>

              {pastTrips.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>{t.noArchived}</Text>
                </View>
              ) : (
                pastTrips.map((trip) => (
                  <View key={trip.id} style={styles.archivalCard}>
                    <ImageBackground 
                      source={{ uri: `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=800` }} // Fallback image for memory card
                      style={styles.archivalImage}
                    >
                      <View style={styles.archivalImageOverlay} />
                    </ImageBackground>
                    
                    <View style={styles.archivalInfo}>
                      <Text style={styles.archivalTripTitle}>{trip.title}</Text>
                      <Text style={styles.archivalTripDate}>
                        📅 {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                      </Text>
                      <TouchableOpacity 
                        style={styles.archivalButton}
                        activeOpacity={0.8}
                        onPress={() => handleTripPress(trip.id)}
                      >
                        <Text style={styles.archivalButtonText}>{t.viewMemories}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { padding: 20, paddingBottom: 10, backgroundColor: '#0B1120' },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  
  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 12 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#0B1120' },
  tabButtonActive: { backgroundColor: '#1E293B', borderColor: '#38BDF8' },
  tabText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#38BDF8' },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 40 },
  emptyText: { color: '#94A3B8', fontSize: 15, marginBottom: 20 },
  primaryButton: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  // Card - Upcoming
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E293B' },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardRoute: { color: '#94A3B8', fontSize: 14, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { color: '#38BDF8', fontSize: 13, fontWeight: '600' },
  arrowIcon: { color: '#F59E0B', fontSize: 18, fontWeight: 'bold' },

  // Stats Card
  statsCard: { backgroundColor: '#111827', borderRadius: 16, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  statsTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  statsSubtitle: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'center', alignItems: 'center' },
  statCol: { alignItems: 'center', flex: 1 },
  statValue: { color: '#F59E0B', fontSize: 24, fontWeight: '900' },
  statLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#1E293B' },

  // Archival Card
  archivalCard: { backgroundColor: '#111827', borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1E293B', overflow: 'hidden' },
  archivalImage: { width: '100%', height: 160 },
  archivalImageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 17, 32, 0.3)' },
  archivalInfo: { padding: 16 },
  archivalTripTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  archivalTripDate: { color: '#94A3B8', fontSize: 12, marginBottom: 16, fontWeight: '600' },
  archivalButton: { backgroundColor: '#F59E0B', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  archivalButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
});