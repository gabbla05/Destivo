// src/screens/TripsListScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
  Image,
  ImageBackground,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePowerSync } from '@powersync/react-native';
import { useAuthStore } from '../store/authStore';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

interface TripRecord {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
}

// Baza sprawdzonych, reprezentacyjnych zdjęć miast (fallback)
const CURATED_CITY_PHOTOS: { [key: string]: string } = {
  rzym: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800',
  rome: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800',
  paryż: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=800',
  paris: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=800',
  londyn: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=800',
  london: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=800',
  barcelona: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&q=80&w=800',
  madryt: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&q=80&w=800',
  madrid: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&q=80&w=800',
  warszawa: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=800',
  warsaw: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=800',
  kraków: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=800',
  krakow: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=800',
  berlin: 'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&q=80&w=800',
  wiedeń: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?auto=format&fit=crop&q=80&w=800',
  vienna: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?auto=format&fit=crop&q=80&w=800',
  wenecja: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&q=80&w=800',
  venice: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&q=80&w=800',
  praga: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&q=80&w=800',
  prague: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&q=80&w=800',
  tokio: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=800',
  tokyo: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=800',
  amsterdam: 'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&q=80&w=800',
  lizbona: 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?auto=format&fit=crop&q=80&w=800',
  lisbon: 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?auto=format&fit=crop&q=80&w=800',
  'nowy jork': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&q=80&w=800',
  'new york': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&q=80&w=800',
};

const DEFAULT_TRIP_PHOTO = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=800';

export const TripsListScreen = ({ navigation }: any) => {
  const { user, language } = useAuthStore();
  const t = translations[language].trips;
  const commonT = translations[language].common;
  const db = usePowerSync();
  const [loading, setLoading] = useState(false);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cityPhotos, setCityPhotos] = useState<{ [cityKey: string]: string }>({});

  const cityPhotoCache = useRef<Map<string, string>>(new Map());

  const googleConfigKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  const googleApiKey =
    googleConfigKey !== undefined
      ? googleConfigKey
      : (process.env.EXPO_PUBLIC_GOOGLE_API_KEY || 'AIzaSyAFeiDtoS013DQEmkjDsJkzBC7O_pu-ZOQ');

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

  // Pobieranie zdjęć miast z Google Places
  useEffect(() => {
    const fetchPhotosForTrips = async () => {
      const destinations = Array.from(new Set(trips.map((t) => t.destination.trim()).filter(Boolean)));
      const newPhotos: { [key: string]: string } = {};

      for (const dest of destinations) {
        const key = dest.toLowerCase();
        if (cityPhotoCache.current.has(key)) {
          newPhotos[key] = cityPhotoCache.current.get(key)!;
          continue;
        }

        // Sprawdzamy czy mamy zdefiniowane lokalnie sprawdzone zdjęcie
        let photoFound: string | null = null;
        for (const [cKey, cUrl] of Object.entries(CURATED_CITY_PHOTOS)) {
          if (key.includes(cKey)) {
            photoFound = cUrl;
            break;
          }
        }

        // Jeśli mamy klucz Google Places, próbujemy pobrać prawdziwe zdjęcie z Google Places
        if (googleApiKey && !googleApiKey.includes('TYMCZASOWY')) {
          try {
            const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(dest + ' tourism landmark')}&key=${googleApiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
              const withPhoto = data.results.find((p: any) => Array.isArray(p.photos) && p.photos.length > 0);
              if (withPhoto && withPhoto.photos[0]?.photo_reference) {
                photoFound = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${withPhoto.photos[0].photo_reference}&key=${googleApiKey}`;
              }
            }
          } catch {
            // Ignorujemy błędy sieciowe
          }
        }

        const finalPhoto = photoFound || DEFAULT_TRIP_PHOTO;
        cityPhotoCache.current.set(key, finalPhoto);
        newPhotos[key] = finalPhoto;
      }

      setCityPhotos((prev) => ({ ...prev, ...newPhotos }));
    };

    if (trips.length > 0) {
      fetchPhotosForTrips();
    }
  }, [trips, googleApiKey]);

  const getTripPhoto = (destination: string) => {
    const key = destination?.trim().toLowerCase() || '';
    if (cityPhotos[key]) return cityPhotos[key];
    if (cityPhotoCache.current.has(key)) return cityPhotoCache.current.get(key)!;
    for (const [cKey, cUrl] of Object.entries(CURATED_CITY_PHOTOS)) {
      if (key.includes(cKey)) return cUrl;
    }
    return DEFAULT_TRIP_PHOTO;
  };

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

  // Filtrowanie podróży wyszukiwarką po nazwie i destynacji
  const filterTrips = (list: TripRecord[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (trip) =>
        trip.title.toLowerCase().includes(q) ||
        trip.destination.toLowerCase().includes(q) ||
        trip.origin.toLowerCase().includes(q)
    );
  };

  const displayedUpcoming = filterTrips(upcomingTrips);
  const displayedPast = filterTrips(pastTrips);

  // Obliczanie statystyk dla archiwalnych podróży
  const uniquePlacesCount = new Set(pastTrips.map((t) => t.destination)).size;
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
    return total + (diffDays > 0 ? diffDays : 1);
  }, 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* LOGO DESTIVO NA GÓRZE NA ŚRODKU (spójne z HomeScreen) */}
      <View style={styles.topLogoContainer}>
        <Image
          source={require('../../assets/logo/NapisKropkaBialy.png')}
          style={styles.topLogo}
          resizeMode="contain"
          testID="destivo-top-logo"
        />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.title}</Text>
      </View>

      {/* ZAKŁADKI UPCOMING / ARCHIVED */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'upcoming' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('upcoming')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            {t.upcoming}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'past' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('past')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            {t.archived}
          </Text>
        </TouchableOpacity>
      </View>

      {/* WYSZUKIWARKA POD ZAKŁADKAMI */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t.searchPlaceholder || "Szukaj podróży po nazwie..."}
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.trim().length > 0 && (
          <TouchableOpacity 
            onPress={() => setSearchQuery('')}
            style={styles.clearSearchBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
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
            activeOpacity={0.8}
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
              ) : displayedUpcoming.length === 0 ? (
                <View style={styles.noResultsBox}>
                  <Ionicons name="search-outline" size={36} color="#64748B" style={{ marginBottom: 8 }} />
                  <Text style={styles.noResultsText}>
                    {t.noSearchResults || 'Brak podróży pasujących do wyszukiwania.'}
                  </Text>
                </View>
              ) : (
                displayedUpcoming.map((trip) => {
                  const photoUri = getTripPhoto(trip.destination);
                  return (
                    <TouchableOpacity 
                      key={trip.id} 
                      style={styles.card}
                      activeOpacity={0.88}
                      onPress={() => handleTripPress(trip.id)}
                    >
                      <Image 
                        source={{ uri: photoUri }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                      <View style={styles.cardScrim} />

                      <View style={styles.cardContent}>
                        {/* Pigułki na zdjęciu */}
                        <View style={styles.cardTopRow}>
                          <View style={styles.destinationPill}>
                            <Ionicons name="location" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.destinationPillText} numberOfLines={1}>{trip.destination}</Text>
                          </View>
                          <View style={styles.datePill}>
                            <Ionicons name="calendar-outline" size={12} color="#E2E8F0" style={{ marginRight: 4 }} />
                            <Text style={styles.datePillText}>
                              {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                            </Text>
                          </View>
                        </View>

                        {/* Treść kafelka */}
                        <View style={styles.cardBottomRow}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{trip.title}</Text>
                          <View style={styles.routeContainer}>
                            <Ionicons name="navigate-outline" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                            <Text style={styles.cardRoute}>
                              {trip.origin || t.home} ➔ {trip.destination}
                            </Text>
                          </View>
                          <View style={styles.cardFooter}>
                            <Text style={styles.cardDate}>
                              {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                            </Text>
                            <View style={styles.arrowCircle}>
                              <Ionicons name="arrow-forward" size={14} color="#0F172A" />
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {/* ZAKŁADKA ARCHIWALNE */}
          {activeTab === 'past' && (
            <>
              {/* KARTA STATYSTYK */}
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>{t.memories}</Text>
                <Text style={styles.statsSubtitle}>{t.memoriesDesc}</Text>
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
              ) : displayedPast.length === 0 ? (
                <View style={styles.noResultsBox}>
                  <Ionicons name="search-outline" size={36} color="#64748B" style={{ marginBottom: 8 }} />
                  <Text style={styles.noResultsText}>
                    {t.noSearchResults || 'Brak podróży pasujących do wyszukiwania.'}
                  </Text>
                </View>
              ) : (
                displayedPast.map((trip) => {
                  const photoUri = getTripPhoto(trip.destination);
                  return (
                    <TouchableOpacity 
                      key={trip.id} 
                      style={styles.card}
                      activeOpacity={0.88}
                      onPress={() => handleTripPress(trip.id)}
                    >
                      <Image 
                        source={{ uri: photoUri }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                      <View style={styles.cardScrim} />

                      <View style={styles.cardContent}>
                        <View style={styles.cardTopRow}>
                          <View style={styles.destinationPill}>
                            <Ionicons name="location" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.destinationPillText} numberOfLines={1}>{trip.destination}</Text>
                          </View>
                          <View style={styles.datePill}>
                            <Ionicons name="checkmark-circle-outline" size={12} color="#10B981" style={{ marginRight: 4 }} />
                            <Text style={styles.datePillText}>
                              {formatDisplayDate(trip.start_date)} - {formatDisplayDate(trip.end_date)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardBottomRow}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{trip.title}</Text>
                          <View style={styles.routeContainer}>
                            <Ionicons name="navigate-outline" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                            <Text style={styles.cardRoute}>
                              {trip.origin || t.home} ➔ {trip.destination}
                            </Text>
                          </View>
                          <View style={styles.cardActionRow}>
                            <Text style={styles.archivalButtonText}>{t.viewMemories}</Text>
                            <View style={styles.arrowCircle}>
                              <Ionicons name="arrow-forward" size={14} color="#0F172A" />
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
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
  
  // Logo Destivo na górze
  topLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  topLogo: {
    width: 120,
    height: 28,
  },

  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, backgroundColor: '#0B1120' },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  
  // Zakładki
  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 10 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#111827' },
  tabButtonActive: { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: '#38BDF8' },
  tabText: { color: '#CBD5E1', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#38BDF8' },

  // Wyszukiwarka
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#F8FAFC', fontSize: 14, height: '100%' },
  clearSearchBtn: { padding: 4 },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 40 },
  emptyText: { color: '#CBD5E1', fontSize: 15, marginBottom: 20 },
  primaryButton: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  noResultsBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  noResultsText: { color: '#CBD5E1', fontSize: 14 },

  // Kafelki podróży ze zdjęciem w tle (atrakcyjny wygląd)
  card: { 
    height: 180, 
    borderRadius: 20, 
    marginBottom: 16, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#1E293B',
    backgroundColor: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    position: 'relative',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardScrim: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(11, 17, 32, 0.58)', 
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 14,
    zIndex: 2,
  },

  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 },
  destinationPill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(11, 17, 32, 0.82)', 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  destinationPillText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  datePill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(11, 17, 32, 0.82)', 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  datePillText: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },

  cardBottomRow: { zIndex: 2 },
  cardTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4, letterSpacing: 0.3 },
  routeContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardRoute: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardDate: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  arrowCircle: { 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    backgroundColor: '#F59E0B', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  arrowIcon: { color: '#0F172A', fontSize: 14, fontWeight: '900', lineHeight: 16 },

  cardActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  archivalButtonText: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },

  // Karta statystyk
  statsCard: { backgroundColor: '#111827', borderRadius: 20, padding: 22, marginBottom: 20, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  statsTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  statsSubtitle: { color: '#CBD5E1', fontSize: 13, textAlign: 'center', marginBottom: 18, paddingHorizontal: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'center', alignItems: 'center' },
  statCol: { alignItems: 'center', flex: 1 },
  statValue: { color: '#F59E0B', fontSize: 24, fontWeight: '900' },
  statLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: '#1E293B' },
});