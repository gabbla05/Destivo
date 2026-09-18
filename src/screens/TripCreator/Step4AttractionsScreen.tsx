// src/screens/TripCreator/Step4AttractionsScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  StatusBar,
  Alert,
  ImageBackground,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { usePowerSync } from '@powersync/react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { useAuthStore } from '../../store/authStore';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { translations } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';

import * as Crypto from 'expo-crypto';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_PADDING = 16;
const CARD_GAP = 12;
const CARD_WIDTH = Math.round(SCREEN_WIDTH - HORIZONTAL_PADDING * 2);

interface GooglePlaceAttraction {
  id: string;
  name: string;
  address: string;
  type: string;
  distance: number;
  lat: number;
  lon: number;
  rating: number;
  imageUrl: string;
}

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const mapDarkStyle = [
  { elementType: "geometry", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#808D9E" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B1120" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1E293B" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#162032" }] },
];

export const Step4AttractionsScreen = () => {
  const navigation = useNavigation<any>();
  const db = usePowerSync();
  const { language, isGuest } = useAuthStore();
  const t = translations[language].tripCreatorStep4;
  const commonT = translations[language].common;
  
  const {
    tripName,
    origin,
    destination,
    startDate,
    endDate,
    transport,
    transportDetails,
    lodging,
    lodgingAddress,
    attractions: storeAttractions,
    toggleAttraction,
    reset
  } = useTripCreatorStore();

  const { user } = useAuthStore();

  const [radius, setRadius] = useState<number>(5.0); 
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GooglePlaceAttraction[]>([]);
  
  // Sortowanie wg odległości (domyślnie rosnąco od najbliższych)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Stan wybranej atrakcji na mapie / w karuzeli
  const [selectedAttractionId, setSelectedAttractionId] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);

  // Zakładki: 'discover' (do wyboru) lub 'planned' (zaplanowane)
  const [activeTab, setActiveTab] = useState<'discover' | 'planned'>('discover');

  // Fallback dla obrazków, które mogłyby się nie załadować
  const [imageErrors, setImageErrors] = useState<{ [id: string]: boolean }>({});

  const [lodgingCoords, setLodgingCoords] = useState<{lat: number, lon: number} | null>(null);
  
  const mapRef = useRef<MapView>(null);
  const carouselScrollViewRef = useRef<ScrollView>(null);

  // Trwały cache wszystkich znalezionych atrakcji (by nie gubić obiektów przy zmianie promienia)
  const allFetchedAttractionsCache = useRef<Map<string, GooglePlaceAttraction>>(new Map());

  const googleConfigKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  const googleApiKey =
    googleConfigKey !== undefined
      ? googleConfigKey
      : (process.env.EXPO_PUBLIC_GOOGLE_API_KEY || 'AIzaSyAFeiDtoS013DQEmkjDsJkzBC7O_pu-ZOQ');

  // 1. Inicjalizacja lokalizacji noclegu
  useEffect(() => {
    const initLocation = async () => {
      const locationQuery = lodgingAddress.trim() || destination.trim() || 'Rome';
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationQuery)}&limit=1`,
          { headers: { 'User-Agent': 'DestivoApp/1.0' } }
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setLodgingCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
        } else {
          setLodgingCoords({ lat: 41.9028, lon: 12.4964 });
        }
      } catch (e) {
        setLodgingCoords({ lat: 41.9028, lon: 12.4964 });
      }
    };
    initLocation();
  }, [lodgingAddress, destination]);

  // 2. Pobieranie danych z Google Places
  useEffect(() => {
    if (lodgingCoords) {
      fetchGooglePlacesAttractions();
    }
  }, [lodgingCoords, radius]);

  const fetchGooglePlacesAttractions = async () => {
    if (!lodgingCoords) return;
    setLoading(true);

    try {
      if (!googleApiKey || googleApiKey.includes('TYMCZASOWY')) {
        Alert.alert('DESTIVO', t.googleApiKeyMissing);
        setLoading(false);
        return;
      }

      const radiusMeters = Math.min(radius * 1000, 50000);
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lodgingCoords.lat},${lodgingCoords.lon}&radius=${radiusMeters}&type=tourist_attraction&key=${googleApiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && Array.isArray(data.results)) {
        const mapped: GooglePlaceAttraction[] = data.results.map((place: any) => {
          const pLat = place.geometry?.location?.lat ?? lodgingCoords.lat;
          const pLon = place.geometry?.location?.lng ?? lodgingCoords.lon;
          const dist = calculateDistanceKm(lodgingCoords.lat, lodgingCoords.lon, pLat, pLon);

          let photoUrl = 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=800';
          if (place.photos && place.photos.length > 0) {
            const photoReference = place.photos[0].photo_reference;
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${googleApiKey}`;
          }

          const vicinity = place.vicinity || place.formatted_address || destination;

          const item: GooglePlaceAttraction = {
            id: place.place_id,
            name: place.name,
            address: vicinity,
            type: t.googleAttractionType,
            distance: dist,
            lat: pLat,
            lon: pLon,
            rating: place.rating || 4.5,
            imageUrl: photoUrl,
          };

          allFetchedAttractionsCache.current.set(item.name, item);
          return item;
        });

        // Dokładne filtrowanie po wybranym promieniu
        const filtered = mapped.filter((item) => item.distance <= radius * 1.05);

        setResults(filtered);
        if (filtered.length > 0) {
          setSelectedAttractionId(filtered[0].id);
          setActiveCardIndex(0);
        }
      } else {
        setResults([]);
        setSelectedAttractionId(null);
      }
    } catch (error) {
      console.warn("Błąd pobierania z Google Places:", error);
    } finally {
      setLoading(false);
    }
  };

  // Przełącznik sortowania wg odległości (rosnąco / malejąco)
  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    setActiveCardIndex(0);
    if (carouselScrollViewRef.current) {
      carouselScrollViewRef.current.scrollTo({ x: 0, animated: true });
    }
  };

  // Lista nieodznaczonych atrakcji (gdy dodasz atrakcję, znika z kolejki wyboru, a na jej miejsce wchodzi kolejna)
  const unselectedResults = useMemo(() => {
    const unselected = results.filter((item) => !storeAttractions.selected.includes(item.name));
    return unselected.sort((a, b) => (sortOrder === 'asc' ? a.distance - b.distance : b.distance - a.distance));
  }, [results, storeAttractions.selected, sortOrder]);

  // Lista już dodanych atrakcji (gwarantowane pobieranie wszystkich dodanych elementów)
  const plannedResults = useMemo(() => {
    const list: GooglePlaceAttraction[] = [];
    storeAttractions.selected.forEach((name) => {
      const fromResults = results.find((r) => r.name === name);
      if (fromResults) {
        list.push(fromResults);
      } else if (allFetchedAttractionsCache.current.has(name)) {
        list.push(allFetchedAttractionsCache.current.get(name)!);
      } else {
        list.push({
          id: `saved-${name}`,
          name,
          address: destination,
          type: t.googleAttractionType,
          distance: 0,
          lat: lodgingCoords?.lat || 41.9028,
          lon: lodgingCoords?.lon || 12.4964,
          rating: 4.8,
          imageUrl: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=800',
        });
      }
    });
    return list.sort((a, b) => (sortOrder === 'asc' ? a.distance - b.distance : b.distance - a.distance));
  }, [results, storeAttractions.selected, destination, lodgingCoords, sortOrder]);

  // Lista aktualnie prezentowana na kafelkach
  const displayList = activeTab === 'discover' ? unselectedResults : plannedResults;

  // Przełączanie zakładek z bezpiecznym przewinięciem na początek
  const handleTabChange = (newTab: 'discover' | 'planned') => {
    setActiveTab(newTab);
    setActiveCardIndex(0);
    if (carouselScrollViewRef.current) {
      carouselScrollViewRef.current.scrollTo({ x: 0, animated: false });
    }
    const targetList = newTab === 'discover' ? unselectedResults : plannedResults;
    if (targetList.length > 0) {
      setSelectedAttractionId(targetList[0].id);
      centerMapOn(targetList[0].lat, targetList[0].lon);
    }
  };

  // Centrowanie mapy na wybranej atrakcji
  const centerMapOn = (lat: number, lon: number) => {
    if (mapRef.current && lat && lon) {
      mapRef.current.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 400);
    }
  };

  // Obsługa kliknięcia pinezki na mapie -> Przewinięcie karuzeli do tego kafelka
  const handleMarkerPress = (item: GooglePlaceAttraction) => {
    setSelectedAttractionId(item.id);
    centerMapOn(item.lat, item.lon);
    
    const index = displayList.findIndex((r) => r.id === item.id || r.name === item.name);
    if (index !== -1 && carouselScrollViewRef.current) {
      setActiveCardIndex(index);
      carouselScrollViewRef.current.scrollTo({
        x: index * (CARD_WIDTH + CARD_GAP),
        animated: true,
      });
    }
  };

  // Przewijanie strzałkami lewo/prawo
  const handleScrollTo = (index: number) => {
    if (index < 0 || index >= displayList.length) return;
    setActiveCardIndex(index);
    const target = displayList[index];
    if (target) {
      setSelectedAttractionId(target.id);
      centerMapOn(target.lat, target.lon);
    }
    if (carouselScrollViewRef.current) {
      carouselScrollViewRef.current.scrollTo({
        x: index * (CARD_WIDTH + CARD_GAP),
        animated: true,
      });
    }
  };

  // Obsługa przewijania gestem
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_GAP));
    if (index >= 0 && index < displayList.length) {
      setActiveCardIndex(index);
      const target = displayList[index];
      if (target) {
        setSelectedAttractionId(target.id);
        centerMapOn(target.lat, target.lon);
      }
    }
  };

  // Kliknięcie dodania/usunięcia atrakcji
  const handleToggleAttraction = (item: GooglePlaceAttraction) => {
    toggleAttraction(item.name);
  };

  // Zapis całej wycieczki
  const handleFinishPlanning = async () => {
    try {
      const userId = user?.id || 'guest';
      const isUserGuest = isGuest || user?.isGuest;

      // Zabezpieczenie dla gościa - maksymalnie 1 podróż
      if (isUserGuest) {
        const existingTrips = await db.execute(
          'SELECT 1 FROM trips WHERE user_id = ? LIMIT 1',
          [userId]
        );
        if ((existingTrips?.rows?.length ?? 0) > 0) {
          Alert.alert('DESTIVO', t.error_guestTripExists || 'Gość może mieć tylko jedną podróż.');
          return;
        }
      }

      const tripId = Crypto.randomUUID();
      
      const extendedAttractions = {
        selected: storeAttractions.selected,
        pool: results.map((r) => ({
          id: r.id,
          name: r.name,
          imageUrl: r.imageUrl,
          address: r.address,
          rating: r.rating,
          lat: r.lat,
          lon: r.lon,
        })),
      };

      const attractionsJson = JSON.stringify(extendedAttractions);

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

      const vaultFiles = transportDetails?.ticketFile ? [transportDetails.ticketFile] : [];
      const transportJson = JSON.stringify({
        ...(transport || {}),
        details: transportDetails || {},
      });
      const lodgingJson = JSON.stringify({
        ...lodging,
        lodgingAddress: lodgingAddress || '',
        vaultFiles,
      });

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

      await db.execute(
        `INSERT INTO trips
        (id, user_id, trip_name, origin, destination, start_date, end_date, transport_data, lodging_data, attractions_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          tripId,
          userId,
          tripName || t.defaultTripName.replace('{{destination}}', destination),
          origin,
          destination,
          formatToDBDate(startDate),
          formatToDBDate(endDate),
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
            trip_name: tripName || t.defaultTripName.replace('{{destination}}', destination),
            origin: origin || '',
            destination,
            start_date: formatToDBDate(startDate),
            end_date: formatToDBDate(endDate),
            transport_data: transportJson,
            lodging_data: lodgingJson,
            attractions_data: attractionsJson,
          }]);

        if (supabaseError) {
          console.warn('Błąd bezpośredniego zapisu do Supabase w Step4:', supabaseError);
        }
      }

      Alert.alert('DESTIVO', t.saveSuccess);
      reset(); 
      navigation.navigate('MainTabs' as never, { screen: 'Trips' } as never);

    } catch (error) {
      console.error("Błąd zapisu wycieczki:", error);
      Alert.alert(commonT.error, t.saveError);
    }
  };

  const handleSkip = () => {
    handleFinishPlanning();
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* HEADER Z PASKIEM POSTĘPU */}
      <SafeAreaView edges={['top']} style={styles.progressSafeArea}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>{t.step_indicator}</Text>
          <Text style={styles.progressStepName}>{t.step_title}</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '100%' }]} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* 1. SEKCJA MAPY (Zwarta wysokość ~34%) */}
        <View style={styles.mapHeader}>
          {lodgingCoords ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFillObject}
              customMapStyle={mapDarkStyle}
              initialRegion={{
                latitude: lodgingCoords.lat,
                longitude: lodgingCoords.lon,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
              }}
            >
              <Marker
                coordinate={{ latitude: lodgingCoords.lat, longitude: lodgingCoords.lon }}
                pinColor="#0EA5E9"
                title={t.yourLodging}
              />
              <Circle 
                center={{ latitude: lodgingCoords.lat, longitude: lodgingCoords.lon }} 
                radius={radius * 1000} 
                fillColor="rgba(245, 158, 11, 0.15)" 
                strokeColor="#F59E0B" 
                strokeWidth={1.5} 
              />
              {results.map((item) => {
                const isChosen = selectedAttractionId === item.id;
                const isAdded = storeAttractions.selected.includes(item.name);
                return (
                  <Marker 
                    key={item.id} 
                    coordinate={{ latitude: item.lat, longitude: item.lon }} 
                    pinColor={isChosen ? '#38BDF8' : isAdded ? '#10B981' : '#F59E0B'}
                    title={item.name}
                    description={`${item.distance.toFixed(1)} km`}
                    onPress={() => handleMarkerPress(item)}
                  />
                );
              })}
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.mapFallback]}>
              <ActivityIndicator color="#F59E0B" />
              <Text style={{ color: '#808D9E', marginTop: 10 }}>{commonT.label_loading}</Text>
            </View>
          )}

          <SafeAreaView edges={['top']} style={styles.topNav} pointerEvents="box-none">
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* 2. SEKCJA INTERFEJSU */}
        <View style={styles.bottomSheet}>
          
          {/* KOMPAKTOWY WYBÓR PROMIENIA */}
          <View style={styles.compactRadiusCard}>
            <View style={styles.radiusHeaderRow}>
              <View style={styles.radiusLabelBox}>
                <Ionicons name="locate-outline" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                <Text style={styles.controlsLabel}>{t.radius_selection}</Text>
              </View>
              <Text style={styles.radiusValue}>{radius.toFixed(1)} km</Text>
            </View>

            <Slider
              style={{ width: '100%', height: 26 }}
              minimumValue={1}
              maximumValue={20}
              step={0.5}
              value={radius}
              onValueChange={setRadius}
              minimumTrackTintColor="#F59E0B"
              maximumTrackTintColor="#1E293B"
              thumbTintColor="#F59E0B"
            />
          </View>

          {/* PASEK ZAKŁADEK I KONTROLEK */}
          <View style={styles.subHeaderBar}>
            <View style={styles.tabsRow}>
              <TouchableOpacity
                onPress={() => handleTabChange('discover')}
                style={[styles.tabBtn, activeTab === 'discover' && styles.tabBtnActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>
                  {t.tab_discover} ({unselectedResults.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleTabChange('planned')}
                style={[styles.tabBtn, activeTab === 'planned' && styles.tabBtnActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'planned' && styles.tabTextActive]}>
                  {t.tab_planned} ({plannedResults.length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navControlsRow}>
              {/* INTERAKTYWNY PRZYCISK SORTOWANIA WG ODLEGŁOŚCI */}
              <TouchableOpacity
                onPress={toggleSortOrder}
                style={styles.sortBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={sortOrder === 'asc' ? "arrow-up" : "arrow-down"}
                  size={12}
                  color="#F59E0B"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.sortText}>{t.sort_by_distance}</Text>
              </TouchableOpacity>

              {displayList.length > 0 && (
                <View style={styles.arrowsBox}>
                  <TouchableOpacity
                    onPress={() => handleScrollTo(activeCardIndex - 1)}
                    disabled={activeCardIndex <= 0}
                    style={[styles.arrowBtn, activeCardIndex <= 0 && { opacity: 0.3 }]}
                  >
                    <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <Text style={styles.counterText}>
                    {activeCardIndex + 1}/{displayList.length}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleScrollTo(activeCardIndex + 1)}
                    disabled={activeCardIndex >= displayList.length - 1}
                    style={[styles.arrowBtn, activeCardIndex >= displayList.length - 1 && { opacity: 0.3 }]}
                  >
                    <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* GŁÓWNA KARUZELA KAFELKÓW ATRAKCJI */}
          <View style={styles.carouselContainer}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#F59E0B" />
                <Text style={styles.loadingText}>{commonT.label_loading}</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="compass-outline" size={40} color="#64748B" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>{t.empty_results}</Text>
              </View>
            ) : displayList.length === 0 && activeTab === 'discover' ? (
              <View style={styles.allAddedBox}>
                <Ionicons name="checkmark-done-circle" size={44} color="#10B981" style={{ marginBottom: 8 }} />
                <Text style={styles.allAddedTitle}>{t.all_added}</Text>
                <Text style={styles.allAddedSubtitle}>{t.all_added_desc}</Text>
                <TouchableOpacity
                  onPress={() => handleTabChange('planned')}
                  style={styles.switchTabLinkBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.switchTabLinkText}>
                    {(t.seePlanned || 'Zobacz zaplanowane ({{count}})').replace('{{count}}', String(plannedResults.length))}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : displayList.length === 0 && activeTab === 'planned' ? (
              <View style={styles.allAddedBox}>
                <Ionicons name="calendar-outline" size={40} color="#64748B" style={{ marginBottom: 8 }} />
                <Text style={styles.allAddedTitle}>{t.noPlannedTitle || 'Brak jeszcze atrakcji w planie'}</Text>
                <Text style={styles.allAddedSubtitle}>{t.noPlannedDesc || 'Wybierz ciekawe miejsca z zakładki "Do wyboru" i dodaj je do podróży.'}</Text>
                <TouchableOpacity
                  onPress={() => handleTabChange('discover')}
                  style={styles.switchTabLinkBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.switchTabLinkText}>{t.goToDiscover || 'Przejdź do wyboru atrakcji'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                ref={carouselScrollViewRef}
                horizontal
                pagingEnabled={false}
                snapToInterval={CARD_WIDTH + CARD_GAP}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
                onMomentumScrollEnd={handleMomentumScrollEnd}
              >
                {displayList.map((item) => {
                  const isSelected = storeAttractions.selected.includes(item.name);
                  const fallbackImage = 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=800';

                  return (
                    <View key={item.id} style={styles.cardWrapper}>
                      <View style={styles.card}>
                        {/* ZDJĘCIE DOPASOWANE W 100% DO KAFELKA (bez luk) */}
                        <ImageBackground
                          source={{ uri: imageErrors[item.id] ? fallbackImage : item.imageUrl }}
                          style={styles.cardImage}
                          imageStyle={styles.cardImageInner}
                          resizeMode="cover"
                          onError={() => setImageErrors((prev) => ({ ...prev, [item.id]: true }))}
                        >
                          <View style={styles.imageOverlayTop}>
                            <View style={styles.ratingBadge}>
                              <Ionicons name="star" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                              <Text style={styles.ratingText}>{item.rating}</Text>
                            </View>
                            <View style={styles.distanceBadge}>
                              <Ionicons name="navigate-outline" size={13} color="#38BDF8" style={{ marginRight: 4 }} />
                              <Text style={styles.distanceText}>
                                {t.distanceFromLodging.replace('{{distance}}', item.distance.toFixed(1))}
                              </Text>
                            </View>
                          </View>
                        </ImageBackground>

                        {/* CIAŁO KAFELKA */}
                        <View style={styles.cardBody}>
                          <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                          </View>

                          <View style={styles.addressRow}>
                            <Ionicons name="location-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                            <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>
                          </View>

                          {/* PROSTY, ELEGANCKI PRZYCISK DODAJ / USUŃ Z PLANU */}
                          <TouchableOpacity 
                            style={[styles.actionButton, isSelected && styles.actionButtonAdded]}
                            onPress={() => handleToggleAttraction(item)}
                            activeOpacity={0.8}
                          >
                            <Ionicons 
                              name={isSelected ? "checkmark" : "add"} 
                              size={18} 
                              color={isSelected ? "#F59E0B" : "#0F172A"} 
                              style={{ marginRight: 6 }} 
                            />
                            <Text style={[styles.actionButtonText, isSelected && styles.actionButtonTextAdded]}>
                              {isSelected ? t.button_removeFromTimeline : t.button_addToTimeline}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        {/* DOLNY PASEK ZAPISU / POMINIĘCIA */}
        <View style={styles.floatingFooter}>
          <TouchableOpacity style={styles.finishButton} onPress={handleFinishPlanning} activeOpacity={0.9}>
            <Text style={styles.finishButtonText}>{t.button_saveTrip}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.8}>
            <Text style={styles.skipButtonText}>{commonT.button_skip}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#0B1120' },

  progressSafeArea: { backgroundColor: '#0B1120', paddingHorizontal: 20 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#F59E0B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  progressStepName: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 4, backgroundColor: '#1E293B', borderRadius: 2, marginBottom: 8 },
  progressBarFill: { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  
  // Zbalansowana wysokość mapy (34%), by zostawić komfortową przestrzeń na karty atrakcji
  mapHeader: { width: '100%', height: '34%', zIndex: 1 },
  mapFallback: { backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  
  topNav: { position: 'absolute', top: 0, width: '100%', paddingHorizontal: 20, paddingTop: 10, zIndex: 10 },
  backButton: { width: 44, height: 44, backgroundColor: 'rgba(11, 17, 32, 0.7)', borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  backIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: '300', lineHeight: 24 },

  bottomSheet: { 
    flex: 1, 
    marginTop: -16, 
    backgroundColor: '#0B1120', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    zIndex: 10, 
    elevation: 10,
    paddingBottom: 110,
  },

  // Zwarty, kompaktowy suwak promienia
  compactRadiusCard: { 
    backgroundColor: '#111827', 
    borderRadius: 16, 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    marginHorizontal: HORIZONTAL_PADDING, 
    marginTop: -16, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 8, 
    elevation: 12, 
    zIndex: 15,
    borderWidth: 1, 
    borderColor: '#1E293B',
  },
  radiusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  radiusLabelBox: { flexDirection: 'row', alignItems: 'center' },
  controlsLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  radiusValue: { color: '#F59E0B', fontSize: 14, fontWeight: '800' },

  // Pasek zakładek i kontrolek
  subHeaderBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: HORIZONTAL_PADDING, 
    marginTop: 10, 
    marginBottom: 8 
  },
  tabsRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1E293B' },
  tabBtnActive: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' },
  tabText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#F59E0B', fontWeight: '700' },

  navControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#1E293B' },
  sortText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  arrowsBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 8, borderWidth: 1, borderColor: '#1E293B', paddingHorizontal: 4 },
  arrowBtn: { padding: 4 },
  counterText: { color: '#CBD5E1', fontSize: 11, fontWeight: '700', marginHorizontal: 4 },

  // Karuzela i kafelki - IDEALNIE DOPASOWANE BEZ LUK
  carouselContainer: { flex: 1, justifyContent: 'center' },
  carouselContent: { paddingHorizontal: HORIZONTAL_PADDING, alignItems: 'center' },
  cardWrapper: { width: CARD_WIDTH, marginRight: CARD_GAP, height: 255 },
  card: { flex: 1, width: '100%', backgroundColor: '#111827', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B', justifyContent: 'space-between' },
  
  cardImage: { width: '100%', height: 145, justifyContent: 'space-between', padding: 10 },
  cardImageInner: { width: '100%', height: '100%', resizeMode: 'cover', borderTopLeftRadius: 15, borderTopRightRadius: 15 },
  imageOverlayTop: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  ratingBadge: { backgroundColor: 'rgba(11, 17, 32, 0.85)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  distanceBadge: { backgroundColor: 'rgba(11, 17, 32, 0.85)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  distanceText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },

  cardBody: { paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'space-between', flex: 1 },
  cardTitleRow: { marginBottom: 2 },
  cardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  addressText: { color: '#94A3B8', fontSize: 12, flex: 1 },

  actionButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 12 },
  actionButtonAdded: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#F59E0B' },
  actionButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  actionButtonTextAdded: { color: '#F59E0B' },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { color: '#94A3B8', marginTop: 10, fontSize: 13 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyText: { color: '#94A3B8', textAlign: 'center', fontSize: 13 },
  allAddedBox: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  allAddedTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  allAddedSubtitle: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  switchTabLinkBtn: { backgroundColor: 'rgba(56, 189, 248, 0.1)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)' },
  switchTabLinkText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },

  floatingFooter: { position: 'absolute', bottom: 0, width: '100%', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: 'rgba(11, 17, 32, 0.96)', borderTopWidth: 1, borderTopColor: '#1E293B', zIndex: 20, elevation: 20 },
  finishButton: { backgroundColor: '#F59E0B', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  finishButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  skipButton: { alignItems: 'center', paddingVertical: 8 },
  skipButtonText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' }
});