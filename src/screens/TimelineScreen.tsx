// src/screens/TimelineScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { useFocusEffect } from '@react-navigation/native';

const { height: screenHeight } = Dimensions.get('window');

// Typy pomocnicze dla osi czasu
type TimelineEventType = 'DEPARTURE' | 'LODGING' | 'ATTRACTION' | 'RETURN' | 'END';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  dateStr: string;   // DD-MM-YYYY
  timeStr?: string;  // HH:MM
  parsedDate: Date;
  isPast?: boolean;
  isCurrent?: boolean;
}

interface TripRecord {
  id: string;
  user_id: string;
  title: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
  transport_type: string;
  accommodation_address: string;
  attractions_data: string;
  created_at: string;
}

// Funkcja parsująca datę z bazy (YYYY-MM-DD) na obiekt Date
const parseDate = (dateStr: string | null, timeStr?: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (timeStr) {
    const [hours, minutes] = timeStr.split(':');
    date.setHours(Number(hours), Number(minutes));
  }
  return date;
};

// Funkcja zamieniająca YYYY-MM-DD z powrotem na DD-MM-YYYY dla widoku
const formatForDisplay = (dateStr: string | null): string => {
  if (!dateStr) return 'Brak daty';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`; 
  }
  return dateStr;
};

export const TimelineScreen = ({ navigation, route }: any) => {
  const { user } = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [tripName, setTripName] = useState('');
  
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<{ [key: string]: number }>({});

  useFocusEffect(
    React.useCallback(() => {
      fetchTimelineData();
    }, [user?.id])
  );

  const fetchTimelineData = async () => {
    try {
      const isUserGuest = user?.isGuest || !user;
      const tripIdToFetch = route.params?.tripId; // ODCZYTUJEMY ID Z PARAMETRU!
      let trip: TripRecord | null = null;

      if (isUserGuest) {
        const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
        if (storedTrips) {
          const trips: TripRecord[] = JSON.parse(storedTrips);
          // Szukamy po ID, jeśli go nie ma (bo weszliśmy bezpośrednio po utworzeniu), bierzemy ostatnią
          if (tripIdToFetch) {
             trip = trips.find(t => t.id === tripIdToFetch) || null;
          } else {
             trip = trips[trips.length - 1] || null; 
          }
        }
      } else {
        // Zapytanie do Supabase (szukamy po ID jeśli jest, jak nie to najnowszą)
        let query = supabase.from('trips').select('*').eq('user_id', user.id);
        
        if (tripIdToFetch) {
           query = query.eq('id', tripIdToFetch);
        } else {
           query = query.order('created_at', { ascending: false }).limit(1);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          trip = data[0] as TripRecord;
        }
      }

      if (trip) {
        setTripName(trip.title); // Zmiana z trip_name na title
        
        // Atrakcje to wciąż JSON
        const attractions = JSON.parse(trip.attractions_data || '{"selected": []}');
        const selectedAttractions: string[] = attractions.selected || [];

        const generatedEvents: TimelineEvent[] = [];

        // 1. WYJAZD
        generatedEvents.push({
          id: 'evt_dep',
          type: 'DEPARTURE',
          title: `Wyjazd: ${trip.origin || 'Dom'} ➔ ${trip.destination}`,
          subtitle: trip.transport_type ? `Transport: ${trip.transport_type.toUpperCase()}` : 'Rozpoczęcie podróży',
          dateStr: formatForDisplay(trip.start_date),
          timeStr: '08:00', 
          parsedDate: parseDate(trip.start_date, '08:00'),
        });

        // 2. ZAKWATEROWANIE
        if (trip.accommodation_address) {
          generatedEvents.push({
            id: 'evt_lodging',
            type: 'LODGING',
            title: 'Zakwaterowanie',
            subtitle: trip.accommodation_address,
            dateStr: formatForDisplay(trip.start_date),
            timeStr: '14:00',
            parsedDate: parseDate(trip.start_date, '14:00'),
          });
        }

        // 3. ATRAKCJE 
        selectedAttractions.forEach((attr, idx) => {
          const attrDate = parseDate(trip!.start_date);
          attrDate.setDate(attrDate.getDate() + 1);
          const formattedAttrDate = `${String(attrDate.getDate()).padStart(2, '0')}-${String(attrDate.getMonth() + 1).padStart(2, '0')}-${attrDate.getFullYear()}`;

          generatedEvents.push({
            id: `evt_attr_${idx}`,
            type: 'ATTRACTION',
            title: attr,
            subtitle: 'Zwiedzanie',
            dateStr: formattedAttrDate,
            timeStr: `${10 + (idx % 8)}:00`,
            parsedDate: parseDate(trip!.start_date, `${10 + (idx % 8)}:00`), // Poprawione parsowanie
          });
        });

        // 4. POWRÓT
        generatedEvents.push({
          id: 'evt_return',
          type: 'RETURN',
          title: `Powrót: ${trip.destination} ➔ ${trip.origin || 'Dom'}`,
          subtitle: 'Zakończenie podróży',
          dateStr: formatForDisplay(trip.end_date),
          timeStr: '12:00',
          parsedDate: parseDate(trip.end_date, '12:00'),
        });

        generatedEvents.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

        // ... reszta kodu zostaje (currentFound itp)

        const now = new Date();
        let currentFound = false;

        const finalizedEvents = generatedEvents.map(evt => {
          if (evt.parsedDate < now) {
            return { ...evt, isPast: true };
          } else if (!currentFound) {
            currentFound = true;
            return { ...evt, isCurrent: true, isPast: false };
          }
          return { ...evt, isPast: false, isCurrent: false };
        });

        if (!currentFound && finalizedEvents.length > 0) {
          finalizedEvents[0].isCurrent = true;
        }

        setEvents(finalizedEvents);
      }
    } catch (e) {
      console.error('Błąd pobierania osi czasu:', e);
    } finally {
      setLoading(false);
    }
  };

  // Automatyczny scroll do "Obecnego" momentu
  const scrollToCurrent = () => {
    const currentEvent = events.find(e => e.isCurrent);
    if (currentEvent && scrollViewRef.current && itemLayouts.current[currentEvent.id]) {
      const yPosition = itemLayouts.current[currentEvent.id];
      // Scrollujemy tak, aby element był na środku (mniej więcej)
      scrollViewRef.current.scrollTo({ y: yPosition - screenHeight / 3, animated: true });
    }
  };

  useEffect(() => {
    if (!loading && events.length > 0) {
      setTimeout(scrollToCurrent, 300); // Mały delay dla pewności że layout się wyrenderował
    }
  }, [loading, events]);

  const renderIcon = (type: TimelineEventType, isPast: boolean) => {
    let icon = '📍';
    if (type === 'DEPARTURE') icon = '✈️';
    if (type === 'LODGING') icon = '🏨';
    if (type === 'ATTRACTION') icon = '📸';
    if (type === 'RETURN') icon = '🏠';

    return (
      <View style={[styles.iconContainer, isPast && styles.iconContainerPast]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Nagłówek */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            // Docelowo zmienisz to na: navigation.navigate('TripsList')
            // gdy stworzysz ekran z listą wszystkich podróży.
            if (navigation?.canGoBack()) {
              navigation.goBack();
            } else {
              navigation?.navigate('Explore');
            }
          }} 
          style={styles.backToListButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backToListText}>← Wróć do listy</Text>
        </TouchableOpacity>
        
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Oś czasu</Text>
          <Text style={styles.headerSubtitle}>{tripName || 'Brak aktywnej podróży'}</Text>
        </View>
        
        {/* Niewidoczny blok dla wyśrodkowania tytułu (musi mieć szerokość zbliżoną do lewego przycisku) */}
        <View style={{ width: 110 }} /> 
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Ładowanie osi czasu...</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Nie masz jeszcze zaplanowanej podróży.</Text>
        </View>
      ) : (
        <ScrollView 
          ref={scrollViewRef} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Główna linia osi */}
          <View style={styles.timelineLine} />

          {events.map((evt, index) => {
            const isLast = index === events.length - 1;

            return (
              <View 
                key={evt.id} 
                style={styles.eventRow}
                onLayout={(e) => {
                  itemLayouts.current[evt.id] = e.nativeEvent.layout.y;
                }}
              >
                {/* Lewa strona - data i godzina */}
                <View style={styles.dateTimeColumn}>
                  <Text style={[styles.timeText, evt.isPast && styles.textPast]}>
                    {evt.timeStr}
                  </Text>
                  <Text style={[styles.dateText, evt.isPast && styles.textPast]}>
                    {evt.dateStr}
                  </Text>
                </View>

                {/* Środek - kropka/ikona na linii */}
                <View style={styles.nodeColumn}>
                  {renderIcon(evt.type, evt.isPast || false)}
                  {evt.isCurrent && (
                    <View style={styles.currentNodePulse} />
                  )}
                </View>

                {/* Prawa strona - Karta wydarzenia */}
                <View style={[styles.eventCard, evt.isCurrent && styles.eventCardCurrent]}>
                  <Text style={[styles.eventTitle, evt.isPast && styles.textPast]}>
                    {evt.title}
                  </Text>
                  {evt.subtitle ? (
                    <Text style={styles.eventSubtitle}>{evt.subtitle}</Text>
                  ) : null}
                  
                  {evt.isCurrent && (
                    <Text style={styles.currentBadge}>TERAZ / NASTĘPNE</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0B1120',
    zIndex: 10,
  },
  backToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    width: 110,
  },
  backToListText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  headerTextContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 15,
  },
  scrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 85, // precyzyjnie wyliczone zeby być pod kropkami
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#1E293B',
  },
  eventRow: {
    flexDirection: 'row',
    marginBottom: 40,
    alignItems: 'flex-start',
  },
  dateTimeColumn: {
    width: 65,
    alignItems: 'flex-end',
    paddingTop: 8,
  },
  timeText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  dateText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  nodeColumn: {
    width: 40,
    alignItems: 'center',
    position: 'relative',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 3,
    borderColor: '#0B1120',
    zIndex: 2,
  },
  iconContainerPast: {
    backgroundColor: '#334155',
  },
  iconText: {
    fontSize: 14,
  },
  currentNodePulse: {
    position: 'absolute',
    top: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    zIndex: 1,
  },
  eventCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginLeft: 8,
  },
  eventCardCurrent: {
    borderColor: '#F59E0B',
    backgroundColor: '#162032',
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  textPast: {
    color: '#64748B',
  },
  currentBadge: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 10,
  }
});