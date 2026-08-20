// src/screens/TripCreator/Step4AttractionsScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  StatusBar,
  Alert,
  ImageBackground
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import Constants from 'expo-constants';

import { useAuthStore } from '../../store/authStore';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { translations } from '../../i18n/translations';

import { usePowerSync } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';

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
  const navigation = useNavigation();
  const { language } = useAuthStore();
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
  const db = usePowerSync();

  const handleFinishPlanning = async () => {
    try {
      const tripId = Crypto.randomUUID();
      const userId = user?.id || 'guest';

      // Serializacja obiektów z Zustand do JSON, by zapisać je w PowerSync
      const transportJson = JSON.stringify({ transport, transportDetails });
      const lodgingJson = JSON.stringify({ lodging, lodgingAddress });
      const attractionsJson = JSON.stringify(storeAttractions);

      // Zapis do lokalnej bazy (PowerSync zsynchronizuje to z Supabase w tle)
      await db.execute(
        `INSERT INTO trips 
        (id, user_id, trip_name, origin, destination, start_date, end_date, transport_data, lodging_data, attractions_data, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          tripId,
          userId,
          tripName || `Podróż do ${destination}`,
          origin,
          destination,
          startDate,
          endDate,
          transportJson,
          lodgingJson,
          attractionsJson
        ]
      );

      Alert.alert('DESTIVO', 'Podróż została pomyślnie zapisana!');
      reset(); // Czyści dane ze store'a, żeby był pusty dla nowej wycieczki
      navigation.navigate('Explore' as never); // W przyszłości podmienisz to na nawigację do Osi Czasu (Trips)
      
    } catch (error) {
      console.error("Błąd zapisu wycieczki:", error);
      Alert.alert('Błąd', 'Nie udało się zapisać podróży w Sejfie.');
    }
  };

  const [radius, setRadius] = useState<number>(5.0); 
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GooglePlaceAttraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Stan do śledzenia aktualnie wybranej atrakcji (interakcja mapa <-> lista)
  const [selectedAttractionId, setSelectedAttractionId] = useState<string | null>(null);

  const [lodgingCoords, setLodgingCoords] = useState<{lat: number, lon: number} | null>(null);
  
  const mapRef = useRef<MapView>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const cardLayouts = useRef<{ [key: string]: number }>({});

  const googleApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || '';

  // 1. Inicjalizacja lokalizacji
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
        Alert.alert('DESTIVO', 'Brak poprawnego klucza Google API w app.json.');
        setLoading(false);
        return;
      }

      const radiusMeters = Math.min(radius * 1000, 50000);
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lodgingCoords.lat},${lodgingCoords.lon}&radius=${radiusMeters}&type=tourist_attraction&key=${googleApiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && Array.isArray(data.results)) {
        const mapped: GooglePlaceAttraction[] = data.results.map((place: any) => {
          const pLat = place.geometry.location.lat;
          const pLon = place.geometry.location.lng;
          const dist = calculateDistanceKm(lodgingCoords.lat, lodgingCoords.lon, pLat, pLon);

          let photoUrl = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=600';
          if (place.photos && place.photos.length > 0) {
            const photoReference = place.photos[0].photo_reference;
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photoReference}&key=${googleApiKey}`;
          }

          return {
            id: place.place_id,
            name: place.name,
            address: place.vicinity || place.formatted_address || 'Google Maps Location',
            type: 'ATRAKCJA GOOGLE',
            distance: dist,
            lat: pLat,
            lon: pLon,
            rating: place.rating || 4.5,
            imageUrl: photoUrl
          };
        });

        setResults(mapped.sort((a, b) => a.distance - b.distance));
      } else {
        setResults([]);
      }
    } catch (error) {
      console.warn("Błąd pobierania z Google Places:", error);
    } finally {
      setLoading(false);
    }
  };

  // INTERAKCJA 1: Kliknięcie kafelka na liście -> Wyśrodkowanie mapy na pinezce
  const handleCardPress = (item: GooglePlaceAttraction) => {
    setSelectedAttractionId(item.id);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: item.lat,
        longitude: item.lon,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  // INTERAKCJA 2: Kliknięcie pinezki na mapie -> Przesunięcie listy do odpowiedniego kafelka
  const handleMarkerPress = (item: GooglePlaceAttraction) => {
    setSelectedAttractionId(item.id);
    const yPosition = cardLayouts.current[item.id];
    if (yPosition !== undefined && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: yPosition - 20, animated: true });
    }
  };

  const filteredResults = results.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* 1. SEKCJA MAPY */}
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
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={{ latitude: lodgingCoords.lat, longitude: lodgingCoords.lon }} pinColor="#0EA5E9" title="Twój nocleg" />
            <Circle 
              center={{ latitude: lodgingCoords.lat, longitude: lodgingCoords.lon }} 
              radius={radius * 1000} 
              fillColor="rgba(245, 158, 11, 0.15)" 
              strokeColor="#F59E0B" 
              strokeWidth={1} 
            />
            {filteredResults.map(item => {
              const isChosen = selectedAttractionId === item.id;
              return (
                <Marker 
                  key={item.id} 
                  coordinate={{ latitude: item.lat, longitude: item.lon }} 
                  pinColor={isChosen ? '#38BDF8' : '#F59E0B'} // Zmiana koloru aktywnej pinezki
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
            <Text style={{color: '#808D9E', marginTop: 10}}>{commonT.label_loading}</Text>
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
        
        {/* KARTA KONTROLNA */}
        <View style={styles.controlsCard}>
          <View style={styles.radiusHeaderRow}>
            <Text style={styles.controlsLabel}>{t.radius_selection}</Text>
            <Text style={styles.radiusValue}>{radius.toFixed(1)} km</Text>
          </View>
          
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={1}
            maximumValue={20}
            step={0.5}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor="#F59E0B"
            maximumTrackTintColor="#1E293B"
            thumbTintColor="#F59E0B"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>1 KM</Text>
            <Text style={styles.sliderLabelText}>10 KM</Text>
            <Text style={styles.sliderLabelText}>20 KM</Text>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchInputContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput 
                style={styles.searchInput}
                placeholder={t.search_placeholder}
                placeholderTextColor="#606D80"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity 
              style={[styles.filterButton, loading && {opacity: 0.5}]} 
              onPress={fetchGooglePlacesAttractions}
              disabled={loading || !lodgingCoords}
            >
              <Text style={styles.filterIcon}>🎯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* WYNIKI I KAFELKI */}
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent} 
          bounces={false} 
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resultsHeader}>
            <View>
              <Text style={styles.resultsTitle}>{t.nearby_spots}</Text>
              <Text style={styles.resultsSubtitle}>
                {t.showing_x_within_y.replace('{{count}}', String(filteredResults.length)).replace('{{radius}}', String(radius))}
              </Text>
            </View>
            <Text style={styles.sortText}>{t.sort_by_distance}</Text>
          </View>

          <View style={styles.listContainer}>
            {loading ? (
              <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 40 }} />
            ) : filteredResults.length === 0 ? (
              <Text style={styles.emptyText}>{t.empty_results}</Text>
            ) : (
              filteredResults.map((item) => {
                const isSelected = storeAttractions.selected.includes(item.name);
                const isHighlighted = selectedAttractionId === item.id;
                
                return (
                  <TouchableOpacity 
                    key={item.id} 
                    activeOpacity={0.95}
                    onPress={() => handleCardPress(item)}
                    onLayout={(event) => {
                      cardLayouts.current[item.id] = event.nativeEvent.layout.y;
                    }}
                    style={[styles.card, isHighlighted && styles.cardHighlighted]}
                  >
                    <ImageBackground source={{ uri: item.imageUrl }} style={styles.cardImage} imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.starIcon}>★</Text>
                        <Text style={styles.ratingText}>{item.rating}</Text>
                      </View>
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagText}>{item.type}</Text>
                      </View>
                    </ImageBackground>

                    <View style={styles.cardBody}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                      </View>
                      
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        📍 {item.address}
                      </Text>
                      
                      <View style={styles.metaRow}>
                        <Text style={styles.metaText}>📏 {item.distance.toFixed(1)} km od noclegu</Text>
                      </View>

                      <TouchableOpacity 
                        style={[styles.actionButton, isSelected && styles.actionButtonAdded]}
                        onPress={() => toggleAttraction(item.name)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.actionButtonText, isSelected && styles.actionButtonTextAdded]}>
                          {isSelected ? '✓ ' + t.button_removeFromTimeline : '⊕ ' + t.button_addToTimeline}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

      {/* PŁYWAJĄCY PRZYCISK ZAKOŃCZENIA */}
      <View style={styles.floatingFooter}>
        <TouchableOpacity style={styles.finishButton} onPress={handleFinishPlanning} activeOpacity={0.9}>
          <Text style={styles.finishButtonText}>{t.button_finishPlanning}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#0B1120' },
  
  mapHeader: { width: '100%', height: '45%', zIndex: 1 },
  mapFallback: { backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  
  topNav: { position: 'absolute', top: 0, width: '100%', paddingHorizontal: 20, paddingTop: 10, zIndex: 10 },
  backButton: { width: 44, height: 44, backgroundColor: 'rgba(11, 17, 32, 0.7)', borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  backIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: '300', lineHeight: 24 },

  bottomSheet: { 
    flex: 1, 
    marginTop: -24, 
    backgroundColor: '#0B1120', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    zIndex: 10, 
    elevation: 10 
  },
  
  scrollContent: { paddingBottom: 100 },

  controlsCard: { 
    backgroundColor: '#111827', 
    borderRadius: 24, 
    padding: 20, 
    marginHorizontal: 20, 
    marginTop: -40, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 15, 
    zIndex: 15,
    borderWidth: 1, 
    borderColor: '#1E293B' 
  },
  radiusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  controlsLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  radiusValue: { color: '#F59E0B', fontSize: 16, fontWeight: '700' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -5 },
  sliderLabelText: { color: '#64748B', fontSize: 10, fontWeight: '700' },

  searchRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, paddingHorizontal: 16, height: 50 },
  searchIcon: { fontSize: 16, color: '#64748B', marginRight: 10 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  filterButton: { width: 50, height: 50, backgroundColor: '#F59E0B', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  filterIcon: { color: '#0F172A', fontSize: 18 },

  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  resultsTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  resultsSubtitle: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  sortText: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  listContainer: { paddingHorizontal: 20 },
  emptyText: { color: '#94A3B8', textAlign: 'center', marginTop: 40 },

  card: { backgroundColor: '#111827', borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B' },
  cardHighlighted: { borderColor: '#38BDF8', borderWidth: 2, backgroundColor: '#162238' }, // Podświetlenie wybranego kafelka
  cardImage: { width: '100%', height: 140, justifyContent: 'space-between', padding: 12, flexDirection: 'row' },
  tagBadge: { alignSelf: 'flex-start', backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { color: '#0F172A', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  ratingBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(11, 17, 32, 0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  starIcon: { color: '#F59E0B', fontSize: 12, marginRight: 4 },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  
  cardBody: { padding: 16 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  cardDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  metaText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  
  actionButton: { backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionButtonAdded: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#F59E0B' },
  actionButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  actionButtonTextAdded: { color: '#F59E0B' },

  floatingFooter: { position: 'absolute', bottom: 0, width: '100%', padding: 20, backgroundColor: 'rgba(11, 17, 32, 0.95)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  finishButton: { backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  finishButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '800' }
});