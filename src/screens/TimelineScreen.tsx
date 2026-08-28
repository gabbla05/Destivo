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
  Alert,
  TextInput,
  Modal,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';

const { height: screenHeight } = Dimensions.get('window');

type TimelineEventType = 'DEPARTURE' | 'LODGING' | 'ATTRACTION' | 'RETURN' | 'END';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  dateStr: string;
  timeStr?: string;
  parsedDate: Date;
  isPast?: boolean;
  isCurrent?: boolean;
}

interface PoolAttraction {
  id: string;
  name: string;
  imageUrl?: string;
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

const parseDate = (dateStr: string | null, timeStr?: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (timeStr) {
    const [hours, minutes] = timeStr.split(':');
    date.setHours(Number(hours) || 0, Number(minutes) || 0);
  }
  return date;
};

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
  const [tripData, setTripData] = useState<TripRecord | null>(null);
  
  // Stan edycji
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Stan Modala do dodawania
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newDateStr, setNewDateStr] = useState('');
  const [newTimeStr, setNewTimeStr] = useState('');
  
  // Logika 3 kafelków atrakcji
  const [visibleAttractions, setVisibleAttractions] = useState<PoolAttraction[]>([]);
  const [reserveAttractions, setReserveAttractions] = useState<PoolAttraction[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<{ [key: string]: number }>({});

  useFocusEffect(
    React.useCallback(() => {
      fetchTimelineData();
    }, [user?.id])
  );

  const fetchRealAttractionsFromGoogle = async (locationQuery: string, usedTitles: string[]) => {
    try {
      const googleApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '';
      if (!googleApiKey || googleApiKey.includes('TYMCZASOWY')) return;

      // 1. Znalezienie współrzędnych miasta/noclegu
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationQuery)}&limit=1`, { headers: { 'User-Agent': 'DestivoApp/1.0' } });
      const geoData = await res.json();
      if (!Array.isArray(geoData) || geoData.length === 0) return;
      
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);

      // 2. Pobranie prawdziwych atrakcji z Google Places
      const placesRes = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=15000&type=tourist_attraction&key=${googleApiKey}`);
      const placesData = await placesRes.json();
      
      if (placesData.status === 'OK' && placesData.results) {
        const fetchedPool: PoolAttraction[] = placesData.results.map((r: any) => {
          let photoUrl = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=600';
          if (r.photos && r.photos.length > 0) {
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${r.photos[0].photo_reference}&key=${googleApiKey}`;
          }
          return { id: r.place_id, name: r.name, imageUrl: photoUrl };
        });

        // 3. Odrzucenie tych, które już są na Osi Czasu i zasilenie kafelków
        const filtered = fetchedPool.filter(attr => !usedTitles.includes(attr.name));
        const shuffled = filtered.sort(() => 0.5 - Math.random());
        setVisibleAttractions(shuffled.slice(0, 3));
        setReserveAttractions(shuffled.slice(3));
      }
    } catch (e) {
      console.warn("Błąd pobierania atrakcji z Google na Osi Czasu:", e);
    }
  };

  const fetchTimelineData = async () => {
    try {
      const isUserGuest = user?.isGuest || !user;
      const tripIdToFetch = route.params?.tripId;
      let trip: TripRecord | null = null;

      if (isUserGuest) {
        const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
        if (storedTrips) {
          const trips: TripRecord[] = JSON.parse(storedTrips);
          trip = tripIdToFetch ? trips.find(t => t.id === tripIdToFetch) || null : trips[trips.length - 1] || null;
        }
      } else {
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
        setTripData(trip);
        
        const attractions = JSON.parse(trip.attractions_data || '{}');
        const rawPool: PoolAttraction[] = attractions.pool || [];
        
        let currentEvents: TimelineEvent[] = [];

        // 1. Ładowanie istniejącej osi lub generowanie nowej
        if (attractions.customTimeline) {
          currentEvents = attractions.customTimeline.map((e: any) => ({
            ...e,
            parsedDate: new Date(e.parsedDate)
          }));
        } else {
          const selectedAttractions: string[] = attractions.selected || [];
          currentEvents.push({
            id: 'evt_dep',
            type: 'DEPARTURE',
            title: `Wyjazd: ${trip.origin || 'Dom'} ➔ ${trip.destination}`,
            subtitle: trip.transport_type ? `Transport: ${trip.transport_type.toUpperCase()}` : 'Rozpoczęcie podróży',
            dateStr: formatForDisplay(trip.start_date),
            timeStr: '08:00',
            parsedDate: parseDate(trip.start_date, '08:00'),
          });

          if (trip.accommodation_address) {
            currentEvents.push({
              id: 'evt_lodging',
              type: 'LODGING',
              title: 'Zakwaterowanie',
              subtitle: trip.accommodation_address,
              dateStr: formatForDisplay(trip.start_date),
              timeStr: '14:00',
              parsedDate: parseDate(trip.start_date, '14:00'),
            });
          }

          selectedAttractions.forEach((attr, idx) => {
            const attrDate = parseDate(trip!.start_date);
            attrDate.setDate(attrDate.getDate() + 1);
            const formattedAttrDate = `${String(attrDate.getDate()).padStart(2, '0')}-${String(attrDate.getMonth() + 1).padStart(2, '0')}-${attrDate.getFullYear()}`;
            
            currentEvents.push({
              id: `evt_attr_${idx}_${Date.now()}`,
              type: 'ATTRACTION',
              title: attr,
              subtitle: 'Zwiedzanie',
              dateStr: formattedAttrDate,
              timeStr: `${10 + (idx % 8)}:00`,
              parsedDate: parseDate(trip!.start_date, `${10 + (idx % 8)}:00`),
            });
          });

          currentEvents.push({
            id: 'evt_return',
            type: 'RETURN',
            title: `Powrót: ${trip.destination} ➔ ${trip.origin || 'Dom'}`,
            subtitle: 'Zakończenie podróży',
            dateStr: formatForDisplay(trip.end_date),
            timeStr: '12:00',
            parsedDate: parseDate(trip.end_date, '12:00'),
          });

          currentEvents.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
        }

        // 2. Filtrujemy pulę z zapisanych danych
        const usedTitles = currentEvents.map(e => e.title);
        let availablePool = rawPool.filter(attr => !usedTitles.includes(attr.name));

        // 3. Jeśli pula po odrzuceniu jest pusta, dociągamy prawdziwe dane z Google Places API!
        if (availablePool.length > 0) {
          const shuffledPool = availablePool.sort(() => 0.5 - Math.random());
          setVisibleAttractions(shuffledPool.slice(0, 3));
          setReserveAttractions(shuffledPool.slice(3));
        } else {
          const queryLocation = trip.accommodation_address || trip.destination || 'Rome';
          fetchRealAttractionsFromGoogle(queryLocation, usedTitles);
        }

        processAndSetEvents(currentEvents);
      }
    } catch (e) {
      console.error('Błąd pobierania osi czasu:', e);
    } finally {
      setLoading(false);
    }
  };

  const processAndSetEvents = (rawEvents: TimelineEvent[]) => {
    const now = new Date();
    let currentFound = false;

    const finalizedEvents = rawEvents.map(evt => {
      if (evt.parsedDate < now) {
        return { ...evt, isPast: true, isCurrent: false };
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
  };

  const scrollToCurrent = () => {
    const currentEvent = events.find(e => e.isCurrent);
    if (currentEvent && scrollViewRef.current && itemLayouts.current[currentEvent.id]) {
      const yPosition = itemLayouts.current[currentEvent.id];
      scrollViewRef.current.scrollTo({ y: yPosition - screenHeight / 3, animated: true });
    }
  };

  useEffect(() => {
    if (!loading && events.length > 0 && !hasUnsavedChanges) {
      setTimeout(scrollToCurrent, 300);
    }
  }, [loading, events, hasUnsavedChanges]);

  // --- ZARZĄDZANIE OŚKĄ CZASU ---
  
  const handleEventEdit = (id: string, field: keyof TimelineEvent, value: string) => {
    const updatedEvents = events.map(evt => {
      if (evt.id === id) {
        return { ...evt, [field]: value };
      }
      return evt;
    });
    setEvents(updatedEvents);
    setHasUnsavedChanges(true);
  };

  const moveEvent = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === events.length - 1) return;

    const newEvents = [...events];
    const swapIndex = direction === 'UP' ? index - 1 : index + 1;
    
    const temp = newEvents[index];
    newEvents[index] = newEvents[swapIndex];
    newEvents[swapIndex] = temp;

    setEvents(newEvents);
    setHasUnsavedChanges(true);
  };

  const deleteEvent = (id: string) => {
    Alert.alert("Usuń punkt", "Czy na pewno chcesz usunąć ten element z osi czasu?", [
      { text: "Anuluj", style: "cancel" },
      { text: "Usuń", style: "destructive", onPress: () => {
        const newEvents = events.filter(e => e.id !== id);
        setEvents(newEvents);
        setHasUnsavedChanges(true);
      }}
    ]);
  };

  // --- DODAWANIE Z PULI PRAWDZIWYCH ATRAKCJI ---
  const handleAddNewEvent = (isFromPool: boolean, poolAttr?: PoolAttraction) => {
    if (!newDateStr && !isFromPool) {
      Alert.alert('Błąd', 'Data jest wymagana (np. 15-08-2026)');
      return;
    }
    
    const theDate = newDateStr || formatForDisplay(tripData!.start_date);
    const theTitle = poolAttr ? poolAttr.name : (newTitle || 'Nowe wydarzenie');
    const theTime = newTimeStr || '12:00';

    const newEvent: TimelineEvent = {
      id: `evt_custom_${Date.now()}`,
      type: 'ATTRACTION',
      title: theTitle,
      subtitle: newSubtitle || (isFromPool ? 'Rekomendowane miejsce' : 'Dodano ręcznie'),
      dateStr: theDate,
      timeStr: theTime,
      parsedDate: parseDate(theDate.split('-').reverse().join('-'), theTime),
    };

    const newEvents = [...events, newEvent];
    newEvents.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
    
    processAndSetEvents(newEvents);
    setHasUnsavedChanges(true);

    if (isFromPool && poolAttr) {
      const currentVisibles = [...visibleAttractions];
      const poolIndex = currentVisibles.findIndex(a => a.id === poolAttr.id);
      
      if (poolIndex > -1) {
        if (reserveAttractions.length > 0) {
          const nextItem = reserveAttractions[0];
          currentVisibles[poolIndex] = nextItem;
          setReserveAttractions(reserveAttractions.slice(1));
        } else {
          currentVisibles.splice(poolIndex, 1);
        }
        setVisibleAttractions(currentVisibles);
      }
    } else {
      closeAddModal();
    }
  };

  const closeAddModal = () => {
    setIsAddModalVisible(false);
    setNewTitle('');
    setNewSubtitle('');
    setNewDateStr('');
    setNewTimeStr('');
  };

  const saveTimelineChanges = async () => {
    if (!tripData) return;
    try {
      const isUserGuest = user?.isGuest || !user;
      const currentAttractions = JSON.parse(tripData.attractions_data || '{}');
      const updatedAttractions = {
        ...currentAttractions,
        customTimeline: events
      };
      const updatedTrip = { ...tripData, attractions_data: JSON.stringify(updatedAttractions) };

      if (isUserGuest) {
        const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
        if (storedTrips) {
          const trips: TripRecord[] = JSON.parse(storedTrips);
          const newTrips = trips.map(t => t.id === tripData.id ? updatedTrip : t);
          await AsyncStorage.setItem('destivo-trips-guest', JSON.stringify(newTrips));
        }
      } else {
        const { error } = await supabase
          .from('trips')
          .update({ attractions_data: JSON.stringify(updatedAttractions) })
          .eq('id', tripData.id);
        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      Alert.alert('Sukces', 'Oś czasu została zaktualizowana.');
      processAndSetEvents(events); 
    } catch (e) {
      console.error(e);
      Alert.alert('Błąd', 'Nie udało się zapisać zmian.');
    }
  };

  const deleteEntireTrip = async () => {
    if (!tripData) return;
    Alert.alert("Usuwanie podróży", "Czy na pewno chcesz bezpowrotnie usunąć tę podróż i wszystkie jej dane?", [
      { text: "Anuluj", style: "cancel" },
      { text: "Usuń podróż", style: "destructive", onPress: async () => {
        try {
          const isUserGuest = user?.isGuest || !user;
          if (isUserGuest) {
            const storedTrips = await AsyncStorage.getItem('destivo-trips-guest');
            if (storedTrips) {
              const trips: TripRecord[] = JSON.parse(storedTrips);
              const newTrips = trips.filter(t => t.id !== tripData.id);
              await AsyncStorage.setItem('destivo-trips-guest', JSON.stringify(newTrips));
            }
          } else {
            await supabase.from('trips').delete().eq('id', tripData.id);
          }
          navigation.goBack();
        } catch (e) {
          Alert.alert('Błąd', 'Nie udało się usunąć podróży.');
        }
      }}
    ]);
  };

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
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (navigation?.canGoBack()) navigation.goBack();
            else navigation?.navigate('Explore');
          }} 
          style={styles.backToListButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backToListText}>← Wróć</Text>
        </TouchableOpacity>
        
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Oś czasu</Text>
          <Text style={styles.headerSubtitle}>{tripData?.title || 'Brak podróży'}</Text>
        </View>
        
        <TouchableOpacity style={styles.trashButton} onPress={deleteEntireTrip}>
          <Text style={styles.trashIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Nie masz jeszcze zaplanowanej podróży.</Text>
        </View>
      ) : (
        <>
          <ScrollView 
            ref={scrollViewRef} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.timelineLine} />

            {events.map((evt, index) => {
              const isExpanded = expandedEventId === evt.id;

              return (
                <View 
                  key={evt.id} 
                  style={styles.eventRow}
                  onLayout={(e) => { itemLayouts.current[evt.id] = e.nativeEvent.layout.y; }}
                >
                  <View style={styles.dateTimeColumn}>
                    <Text style={[styles.timeText, evt.isPast && styles.textPast]}>{evt.timeStr}</Text>
                    <Text style={[styles.dateText, evt.isPast && styles.textPast]}>{evt.dateStr}</Text>
                  </View>

                  <View style={styles.nodeColumn}>
                    {renderIcon(evt.type, evt.isPast || false)}
                    {evt.isCurrent && <View style={styles.currentNodePulse} />}
                  </View>

                  <TouchableOpacity 
                    style={[styles.eventCard, evt.isCurrent && styles.eventCardCurrent, isExpanded && styles.eventCardExpanded]}
                    activeOpacity={0.8}
                    onPress={() => setExpandedEventId(isExpanded ? null : evt.id)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderTexts}>
                        <Text style={[styles.eventTitle, evt.isPast && styles.textPast]}>{evt.title}</Text>
                        {evt.subtitle ? <Text style={styles.eventSubtitle}>{evt.subtitle}</Text> : null}
                      </View>
                      <View style={styles.dotsButton}>
                        <Text style={styles.dotsIcon}>⋮</Text>
                      </View>
                    </View>
                    
                    {evt.isCurrent && !isExpanded && (
                      <Text style={styles.currentBadge}>TERAZ / NASTĘPNE</Text>
                    )}

                    {isExpanded && (
                      <View style={styles.expandedSection}>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Data (DD-MM-YYYY)</Text>
                          <TextInput 
                            style={styles.input} 
                            value={evt.dateStr} 
                            onChangeText={(val) => handleEventEdit(evt.id, 'dateStr', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Czas (HH:MM)</Text>
                          <TextInput 
                            style={styles.input} 
                            value={evt.timeStr} 
                            onChangeText={(val) => handleEventEdit(evt.id, 'timeStr', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Tytuł wydarzenia</Text>
                          <TextInput 
                            style={styles.input} 
                            value={evt.title} 
                            onChangeText={(val) => handleEventEdit(evt.id, 'title', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Podtytuł / Opis</Text>
                          <TextInput 
                            style={styles.input} 
                            value={evt.subtitle} 
                            onChangeText={(val) => handleEventEdit(evt.id, 'subtitle', val)}
                          />
                        </View>

                        <View style={styles.cardActionsRow}>
                          <View style={styles.moveActions}>
                            <TouchableOpacity 
                              style={[styles.actionBtn, index === 0 && styles.actionBtnDisabled]} 
                              onPress={() => moveEvent(index, 'UP')}
                            >
                              <Text style={styles.actionBtnText}>🔼</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={[styles.actionBtn, index === events.length - 1 && styles.actionBtnDisabled]} 
                              onPress={() => moveEvent(index, 'DOWN')}
                            >
                              <Text style={styles.actionBtnText}>🔽</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteEvent(evt.id)}>
                            <Text style={styles.deleteBtnText}>Usuń</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.fabButton, hasUnsavedChanges && { bottom: 90 }]} 
            activeOpacity={0.8}
            onPress={() => setIsAddModalVisible(true)}
          >
            <Text style={styles.fabIcon}>+</Text>
          </TouchableOpacity>
        </>
      )}

      {hasUnsavedChanges && (
        <View style={styles.saveFooter}>
          <TouchableOpacity style={styles.saveButton} onPress={saveTimelineChanges}>
            <Text style={styles.saveButtonText}>Zapisz układ osi czasu</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dodaj punkt w trasie</Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              
              <Text style={styles.modalSectionTitle}>Propozycje z okolicy</Text>
              <Text style={styles.modalHint}>Kliknij, aby błyskawicznie dodać do planu.</Text>
              
              <View style={styles.poolContainer}>
                {visibleAttractions.length > 0 ? (
                    visibleAttractions.map((attr, index) => (
                        <TouchableOpacity 
                            key={attr.id || `fallback_${index}`} 
                            style={styles.poolCard} 
                            activeOpacity={0.8}
                            onPress={() => handleAddNewEvent(true, attr)} // Dodanie kliknięcia wywołującego zasilanie osi z Puli
                        >
                            <ImageBackground 
                                source={{ uri: attr.imageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828' }} 
                                style={styles.poolCardImage}
                                imageStyle={{ borderRadius: 12 }}
                            >
                                <View style={styles.poolCardOverlay}>
                                    <Text style={styles.poolCardText} numberOfLines={2}>{attr.name}</Text>
                                    <View style={styles.poolCardPlusCircle}>
                                        <Text style={styles.poolCardPlus}>+</Text>
                                    </View>
                                </View>
                            </ImageBackground>
                        </TouchableOpacity>
                    ))
                ) : (
    <Text style={{color: '#64748B', fontSize: 12}}>Brak więcej propozycji w okolicy.</Text>
  )}
</View>

              <View style={styles.divider} />

              <Text style={styles.modalSectionTitle}>Dodaj własne ręcznie</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tytuł *</Text>
                <TextInput style={styles.input} placeholder="np. Obiad w restauracji" placeholderTextColor="#475569" value={newTitle} onChangeText={setNewTitle} />
              </View>
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={[styles.inputGroup, {flex: 1}]}>
                  <Text style={styles.inputLabel}>Data (DD-MM-YYYY) *</Text>
                  <TextInput style={styles.input} placeholder="15-08-2026" placeholderTextColor="#475569" value={newDateStr} onChangeText={setNewDateStr} />
                </View>
                <View style={[styles.inputGroup, {flex: 1}]}>
                  <Text style={styles.inputLabel}>Godzina (HH:MM)</Text>
                  <TextInput style={styles.input} placeholder="12:00" placeholderTextColor="#475569" value={newTimeStr} onChangeText={setNewTimeStr} />
                </View>
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddNewEvent(false)}>
                <Text style={styles.addBtnText}>DODAJ</Text>
              </TouchableOpacity>
              <View style={{height: 30}}/>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1E293B', backgroundColor: '#0B1120', zIndex: 10 },
  backToListButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#334155', width: 80 },
  backToListText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  headerTextContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: '#F59E0B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  trashButton: { width: 40, height: 40, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  trashIcon: { fontSize: 16 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 15 },
  scrollContent: { paddingVertical: 30, paddingHorizontal: 16, position: 'relative' },
  timelineLine: { position: 'absolute', left: 78, top: 0, bottom: 0, width: 2, backgroundColor: '#1E293B' },
  eventRow: { flexDirection: 'row', marginBottom: 30, alignItems: 'flex-start' },
  dateTimeColumn: { width: 60, alignItems: 'flex-end', paddingTop: 8 },
  timeText: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  dateText: { color: '#64748B', fontSize: 10, fontWeight: '600', marginTop: 2 },
  nodeColumn: { width: 36, alignItems: 'center', position: 'relative' },
  iconContainer: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', marginTop: 4, borderWidth: 3, borderColor: '#0B1120', zIndex: 2 },
  iconContainerPast: { backgroundColor: '#334155' },
  iconText: { fontSize: 12 },
  currentNodePulse: { position: 'absolute', top: 1, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(245, 158, 11, 0.5)', zIndex: 1 },
  eventCard: { flex: 1, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, padding: 14, marginLeft: 8 },
  eventCardCurrent: { borderColor: '#F59E0B', backgroundColor: '#162032' },
  eventCardExpanded: { borderColor: '#38BDF8' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardHeaderTexts: { flex: 1, paddingRight: 10 },
  eventTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  eventSubtitle: { color: '#94A3B8', fontSize: 12, lineHeight: 16 },
  dotsButton: { padding: 4 },
  dotsIcon: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  textPast: { color: '#64748B' },
  currentBadge: { color: '#F59E0B', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 10 },
  expandedSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12 },
  inputGroup: { marginBottom: 10 },
  inputLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  input: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#F8FAFC', fontSize: 13, paddingHorizontal: 10, height: 38 },
  cardActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  moveActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnDisabled: { opacity: 0.3 },
  actionBtnText: { color: '#F8FAFC', fontSize: 11, fontWeight: '600' },
  deleteBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  deleteBtnText: { color: '#F87171', fontSize: 11, fontWeight: '700' },
  saveFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(11, 17, 32, 0.95)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  saveButton: { backgroundColor: '#F59E0B', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  
  fabButton: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  fabIcon: { color: '#0F172A', fontSize: 32, fontWeight: '300', marginTop: -2 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11, 17, 32, 0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: '#1E293B' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  closeIcon: { color: '#94A3B8', fontSize: 24, fontWeight: '300' },
  modalSectionTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  modalHint: { color: '#64748B', fontSize: 12, marginBottom: 12 },
  divider: { height: 1, backgroundColor: '#1E293B', marginVertical: 20 },
  addBtn: { backgroundColor: '#F59E0B', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  addBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  
  poolContainer: { gap: 12 },
  poolCard: { height: 100, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  poolCardImage: { width: '100%', height: '100%', justifyContent: 'flex-end' },
  poolCardOverlay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(11, 17, 32, 0.75)', padding: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  poolCardText: { color: '#F8FAFC', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 10 },
  poolCardPlusCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  poolCardPlus: { color: '#0F172A', fontSize: 18, fontWeight: 'bold', marginTop: -2 }
});