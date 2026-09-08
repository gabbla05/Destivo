import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar, 
  ImageBackground,
  ActivityIndicator,
  Alert,
  Dimensions,
  TextInput
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import { generateLiveRecommendations, LiveDestination } from '../lib/liveExplore';
import { useFocusEffect } from '@react-navigation/native';
import { usePowerSync } from '@powersync/react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase'; // DODANE: Do dual-write przy zapisywaniu wycieczki na osi

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

export const HomeScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { isGuest, user, language } = useAuthStore();
  const t = translations[language].homeScreen;
  const commonT = translations[language].common;
  const destinationNames = t.destinationNames as Record<string, string>;
  const db = usePowerSync();

  const [recommendations, setRecommendations] = useState<LiveDestination[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Stany dla Aktywnej Podróży
  const [activeTrip, setActiveTrip] = useState<any | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<any[]>([]);
  const [heroImageUri, setHeroImageUri] = useState<string>('https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null); // DODANE: Stan do rozwijania elementu
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // DODANE: Oś czasu

  // Fallback z tłumaczeń w razie braku imienia
  const userName = isGuest
    ? undefined
    : user?.name || user?.email?.split('@')[0] || t.header_fallbackTraveler;

  useEffect(() => {
    async function loadExplore() {
      try {
        const liveData = await generateLiveRecommendations();
        setRecommendations(liveData);
      } catch (error) {
        console.warn(error);
      } finally {
        setLoading(false);
      }
    }
    loadExplore();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const fetchActiveTrip = async () => {
        try {
          const userId = user?.id || 'guest';
          const result = await db.execute(`SELECT * FROM trips WHERE user_id = ?`, [userId]);
          const rows = ((result as any).array?.length > 0 
            ? (result as any).array 
            : (result.rows as any)?._array || (result.rows as any) || []) as any[];

          const now = new Date();
          now.setHours(0, 0, 0, 0);

          let currentFound = null;

          for (const trip of rows) {
            if (!trip.start_date || !trip.end_date) continue;
            
            const parseDate = (d: string) => {
              const parts = d.replace(/\./g, '-').split('-');
              if (parts.length !== 3) return new Date(0);
              if (parts[0].length === 4) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
              return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            };

            const startDate = parseDate(trip.start_date);
            const endDate = parseDate(trip.end_date);
            
            if (now >= startDate && now <= endDate) {
              currentFound = trip;
              break;
            }
          }

          if (currentFound) {
            setActiveTrip(currentFound);
            
            // Ekstrakcja wydarzeń do osi czasu z JSONa
            const attractionsData = JSON.parse(currentFound.attractions_data || '{}');
            let events = attractionsData.customTimeline || [];
            
            // Pobranie zdjęcia tła (Z Puli jeśli jest, lub użycie defaultowego)
            if (attractionsData.pool && attractionsData.pool.length > 0) {
              setHeroImageUri(attractionsData.pool[0].imageUrl);
            }
            
            // Jeśli nie ma customowej osi, generujemy prowizoryczną na podstawie danych
            if (events.length === 0) {
              const transportData = JSON.parse(currentFound.transport_data || '{}');
              const lodgingData = JSON.parse(currentFound.lodging_data || '{}');
              
              events = [
                { id: '1', type: 'DEPARTURE', title: t.defaultDepartureTitle.replace('{{destination}}', currentFound.destination), timeStr: '08:00', dateStr: currentFound.start_date, subtitle: transportData.selectedOption?.provider || t.defaultTransportSubtitle },
                { id: '2', type: 'LODGING', title: t.defaultLodgingTitle, timeStr: '14:00', dateStr: currentFound.start_date, subtitle: lodgingData.lodgingAddress || t.defaultLodgingSubtitle },
              ];
              
              const selectedAttrs = attractionsData.selected || [];
              selectedAttrs.forEach((attr: string, idx: number) => {
                events.push({ id: `a${idx}`, type: 'ATTRACTION', title: attr, timeStr: `${15 + idx}:00`, dateStr: currentFound.start_date, subtitle: t.defaultAttractionSubtitle });
              });
            }
            setActiveTimeline(events);
          } else {
            setActiveTrip(null);
          }

        } catch (error) {
          console.error('Błąd weryfikacji aktywnej podróży:', error);
        }
      };

      fetchActiveTrip();
    }, [user?.id])
  );

  const getCurrencyInfo = (destination: string) => {
    if (!destination) return t.widget_exchangeRate;
    const destLower = destination.toLowerCase();
    if (['londyn', 'london', 'edynburg', 'edinburgh'].some(c => destLower.includes(c))) return '🇬🇧 1 GBP = ~5.00 PLN';
    if (['praga', 'prague'].some(c => destLower.includes(c))) return '🇨🇿 100 CZK = ~16.80 PLN';
    if (['budapeszt', 'budapest'].some(c => destLower.includes(c))) return '🇭🇺 1000 HUF = ~11.00 PLN';
    if (['reykjavik', 'islandia'].some(c => destLower.includes(c))) return '🇮🇸 1000 ISK = ~28.50 PLN';
    if (['warszawa', 'kraków', 'krakow', 'gdańsk', 'gdansk', 'wrocław', 'wroclaw', 'polska', 'poland'].some(c => destLower.includes(c))) return null;
    return '🇪🇺 1 EUR = ~4.30 PLN';
  };

  const getTimelineIcon = (type: string) => {
    switch(type) {
      case 'DEPARTURE': return '🛫';
      case 'LODGING': return '🏨';
      case 'ATTRACTION': return '📸';
      case 'RETURN': return '🛬';
      default: return '📍';
    }
  };

  // --- ZARZĄDZANIE OSIĄ CZASU ---
  const handleEventEdit = (id: string, field: string, value: string) => {
    const updatedEvents = activeTimeline.map(evt => {
      if (evt.id === id) {
        return { ...evt, [field]: value };
      }
      return evt;
    });
    setActiveTimeline(updatedEvents);
    setHasUnsavedChanges(true);
  };

  const moveEvent = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === activeTimeline.length - 1) return;
    const newEvents = [...activeTimeline];
    const swapIndex = direction === 'UP' ? index - 1 : index + 1;
    
    const temp = newEvents[index];
    newEvents[index] = newEvents[swapIndex];
    newEvents[swapIndex] = temp;
    
    setActiveTimeline(newEvents);
    setHasUnsavedChanges(true);
  };

  const deleteEvent = (id: string) => {
    Alert.alert(t.deletePointTitle, t.deletePointMessage, [
      { text: commonT.button_cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: () => {
        const newEvents = activeTimeline.filter(e => e.id !== id);
        setActiveTimeline(newEvents);
        setHasUnsavedChanges(true);
      }}
    ]);
  };

  const saveTimelineChanges = async () => {
    if (!activeTrip) return;
    try {
      const isUserGuest = user?.isGuest || !user;
      const currentAttractions = JSON.parse(activeTrip.attractions_data || '{}');
      const updatedAttractions = {
        ...currentAttractions,
        customTimeline: activeTimeline
      };

      if (isUserGuest) {
        await db.execute(
          'UPDATE trips SET attractions_data = ? WHERE id = ?',
          [JSON.stringify(updatedAttractions), activeTrip.id]
        );
      } else {
        await db.execute(
          'UPDATE trips SET attractions_data = ? WHERE id = ?',
          [JSON.stringify(updatedAttractions), activeTrip.id]
        );
        const { error } = await supabase
          .from('trips')
          .update({ attractions_data: JSON.stringify(updatedAttractions) })
          .eq('id', activeTrip.id);
        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      Alert.alert(commonT.saveSuccess, t.saveSuccess);
    } catch (e) {
      console.error(e);
      Alert.alert(commonT.label_error, t.saveError);
    }
  };

  // ==========================================
  // WIDOK 1: TRWAJĄCA PODRÓŻ (MOCKUP STYLE)
  // ==========================================
  if (activeTrip) {
    return (
      <View style={styles.activeContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          {/* HERO SECTION Z OBRAZEM Z GOOGLE MAPS */}
          <ImageBackground 
            source={{ uri: heroImageUri }} 
            style={styles.heroImage}
          >
            <View style={styles.heroGradient}>
              <SafeAreaView edges={['top']}>
                <View style={styles.heroContent}>
                  <Text style={styles.currentJourneyLabel}>{t.activeTripLabel}</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>{activeTrip.trip_name}</Text>
                  
                  <View style={styles.heroRow}>
                    <Text style={styles.heroDates}>{activeTrip.start_date} — {activeTrip.end_date}</Text>
                    <View style={styles.weatherPill}>
                      <Text style={styles.weatherPillText}>☀️ 24°C</Text>
                    </View>
                  </View>

                  {/* WIDŻETY: WALUTA I SOS */}
                  <View style={styles.widgetsRow}>
                    {getCurrencyInfo(activeTrip.destination) && (
                      <View style={styles.widgetBadge}>
                        <Text style={styles.widgetBadgeText}>{getCurrencyInfo(activeTrip.destination)}</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.widgetBadgeSos} onPress={() => Alert.alert(t.sosAlertTitle, t.sosAlertMessage)}>
                      <Text style={styles.widgetBadgeSosText}>⚠️ SOS: 112</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </SafeAreaView>
            </View>
          </ImageBackground>

          {/* PRZYCISK DO SEJFU */}
          <View style={styles.vaultAccessSection}>
            <TouchableOpacity 
              style={styles.vaultAccessBtn} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Vault', { tripId: activeTrip.id })}
            >
              <Text style={styles.vaultAccessBtnText}>{t.openVault}</Text>
            </TouchableOpacity>
          </View>

          {/* OŚ CZASU */}
          <View style={styles.timelineSection}>
            <View style={styles.timelineLineAbsolute} />
            
            {activeTimeline.map((item, index) => {
              const isExpanded = expandedEventId === item.id;
              
              return (
                <View key={index} style={styles.timelineRow}>
                  <View style={styles.nodeColumn}>
                    <View style={[styles.nodeIconBg, item.type === 'DEPARTURE' && { backgroundColor: '#F59E0B', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
                      <Text style={styles.nodeIcon}>{getTimelineIcon(item.type)}</Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.timelineCard, isExpanded && styles.eventCardExpanded]} 
                    activeOpacity={0.8} 
                    onPress={() => setExpandedEventId(isExpanded ? null : item.id)}
                  >
                    <View style={styles.cardHeaderFlex}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.editIcon}>✏️</Text>
                    </View>
                    <Text style={styles.cardTime}>{item.timeStr} • {item.type === 'LODGING' ? t.lodgingCheckIn : t.timelinePoint}</Text>
                    <Text style={styles.cardDesc} numberOfLines={isExpanded ? 0 : 2}>{item.subtitle || t.noDetails}</Text>

                    {/* SEKCJA ROZWIJANA (EDYCJA) */}
                    {isExpanded && (
                      <View style={styles.expandedSection}>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>{t.dateLabel}</Text>
                          <TextInput 
                            style={styles.input} 
                            value={item.dateStr} 
                            onChangeText={(val) => handleEventEdit(item.id, 'dateStr', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>{t.timeLabel}</Text>
                          <TextInput 
                            style={styles.input} 
                            value={item.timeStr} 
                            onChangeText={(val) => handleEventEdit(item.id, 'timeStr', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>{t.eventTitleLabel}</Text>
                          <TextInput 
                            style={styles.input} 
                            value={item.title} 
                            onChangeText={(val) => handleEventEdit(item.id, 'title', val)}
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>{t.eventSubtitleLabel}</Text>
                          <TextInput 
                            style={styles.input} 
                            value={item.subtitle} 
                            onChangeText={(val) => handleEventEdit(item.id, 'subtitle', val)}
                          />
                        </View>
                        
                        {/* PRZYCISKI AKCJI (USUŃ I PRZESUŃ) */}
                        <View style={styles.cardActionsRow}>
                          <View style={styles.moveActions}>
                            <TouchableOpacity style={[styles.actionBtn, index === 0 && styles.actionBtnDisabled]} onPress={() => moveEvent(index, 'UP')}>
                              <Text style={styles.actionBtnText}>⬆️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, index === activeTimeline.length - 1 && styles.actionBtnDisabled]} onPress={() => moveEvent(index, 'DOWN')}>
                              <Text style={styles.actionBtnText}>⬇️</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteEvent(item.id)}>
                            <Text style={styles.deleteBtnText}>{t.delete}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* PRZYCISK ZAPISU (Pojawia się tylko gdy są zmiany) */}
        {hasUnsavedChanges && (
          <View style={styles.saveFooter}>
            <TouchableOpacity style={styles.saveButton} onPress={saveTimelineChanges}>
              <Text style={styles.saveButtonText}>{t.saveTimelineLayout}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ==========================================
  // WIDOK 2: STANDARDOWY EKRAN GŁÓWNY (EXPLORE)
  // ==========================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <Text style={styles.welcomeText}>
            {isGuest ? t.header_greetingGuest : `${t.header_greetingUser}, ${userName}!`}
          </Text>
          <Text style={styles.subText}>{t.header_subtitle}</Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8} onPress={() => navigation?.navigate('TripCreator')}>
            <Text style={styles.primaryButtonText}>{t.button_planNewTrip}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8} onPress={() => navigation?.navigate('Trips')}>
            <Text style={styles.secondaryButtonText}>{t.button_goToMyTrips}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.section_liveTitle}</Text>
          <Text style={styles.sectionSubtitle}>{t.section_liveSubtitle}</Text>
          
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loaderText}>{t.loader_explore}</Text>
            </View>
          ) : (
            <View style={styles.exploreProjectsContainer}>
              {recommendations.length > 0 ? recommendations.map((dest) => (
                <TouchableOpacity key={dest.id} activeOpacity={0.9} onPress={() => navigation?.navigate('ExploreDetails', { destData: dest })}>
                  <ImageBackground source={{ uri: dest.coverImage }} style={styles.exploreProjectCard} imageStyle={{ borderRadius: 18 }}>
                    {dest.proposedTrip && (
                      <View style={styles.weatherBadge}>
                        <Text style={styles.weatherText}>
                            {dest.proposedTrip.startDate.slice(0, 5)} - {dest.proposedTrip.endDate.slice(0, 5)} | ~{dest.proposedTrip.estimatedTemp}°C
                        </Text>
                      </View>
                    )}
                    <View style={styles.cardOverlay}>
                      <Text style={styles.cardCity}>{destinationNames[dest.city] || dest.city}</Text>
                      <Text style={styles.cardCountry}>
                        {dest.distanceKm} {t.distanceFromYou} • {
                           dest.recommendedTransport === 'flight' ? t.transportFlight : 
                           dest.recommendedTransport === 'train' ? t.transportTrain : t.transportCar
                        }
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              )) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>{t.empty_recommendations}</Text>
                </View>
              )}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // --- WSPÓLNE ---
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  container: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  
  // --- STANDARDOWY HOME ---
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  welcomeText: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  subText: { fontSize: 15, color: '#94A3B8', marginTop: 4, fontWeight: '400' },
  actionsContainer: { paddingHorizontal: 24, marginTop: 10, gap: 14 },
  primaryButton: { backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#1E293B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  secondaryButtonText: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
  section: { marginTop: 32, flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', paddingHorizontal: 24 },
  sectionSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, marginBottom: 16, paddingHorizontal: 24 },
  exploreProjectsContainer: { gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
  exploreList: { flex: 1 },
  exploreProjectCard: { width: CARD_WIDTH, height: 350, justifyContent: 'space-between', borderWidth: 1, borderColor: '#1E293B', borderRadius: 18 },
  cardOverlay: { backgroundColor: 'rgba(11, 17, 32, 0.75)', padding: 16, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  cardCity: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  cardCountry: { color: '#F59E0B', fontSize: 12, fontWeight: '600', marginTop: 4 },
  weatherBadge: { alignSelf: 'flex-end', backgroundColor: 'rgba(11, 17, 32, 0.85)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, margin: 12, borderWidth: 1, borderColor: '#334155' },
  weatherText: { color: '#F8FAFC', fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  loaderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50 },
  loaderText: { color: '#94A3B8', marginTop: 14, fontSize: 14, fontWeight: '600' },
  emptyCard: { width: CARD_WIDTH, height: 350, backgroundColor: '#111827', borderRadius: 18, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyCardText: { color: '#94A3B8', textAlign: 'center', fontSize: 14, lineHeight: 20 },

  // ==========================================
  // STYLIZACJA MOCKUPA (AKTYWNA PODRÓŻ)
  // ==========================================
  activeContainer: { flex: 1, backgroundColor: '#0B1120' },
  heroImage: { width: '100%', height: 320, justifyContent: 'flex-end' },
  heroGradient: { flex: 1, backgroundColor: 'rgba(11,17,32,0.6)', justifyContent: 'flex-end', paddingBottom: 20 },
  heroContent: { paddingHorizontal: 24 },
  currentJourneyLabel: { color: '#F59E0B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', lineHeight: 38, marginBottom: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroDates: { color: '#CBD5E1', fontSize: 14, fontWeight: '600' },
  weatherPill: { backgroundColor: 'rgba(11,17,32,0.8)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  weatherPillText: { color: '#F8FAFC', fontSize: 12, fontWeight: 'bold' },
  widgetsRow: { flexDirection: 'row', gap: 10 },
  widgetBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  widgetBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  widgetBadgeSos: { backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  widgetBadgeSosText: { color: '#FCA5A5', fontSize: 12, fontWeight: '800' },
  
  // ZMIANA ZGODNIE Z POLECENIEM (PRZYCISK DO SEJFU)
  vaultAccessSection: { paddingHorizontal: 24, marginTop: 24, marginBottom: 10 },
  vaultAccessBtn: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#38BDF8', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  vaultAccessBtnText: { color: '#38BDF8', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  timelineSection: { paddingHorizontal: 20, paddingTop: 15, position: 'relative' },
  timelineLineAbsolute: { position: 'absolute', left: 45, top: 25, bottom: 0, width: 2, backgroundColor: '#1E293B', zIndex: 0 },
  timelineRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'flex-start' },
  nodeColumn: { width: 50, alignItems: 'center', zIndex: 10 },
  nodeIconBg: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#334155', marginTop: 4 },
  nodeIcon: { fontSize: 14 },
  timelineCard: { flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  eventCardExpanded: { borderColor: '#38BDF8' }, // Podświetlenie otwartej karty
  cardHeaderFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 10 },
  editIcon: { fontSize: 14, opacity: 0.5 },
  cardTime: { color: '#F59E0B', fontSize: 11, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  cardDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },

  // STYLIZACJA ROZWIJANEGO MENU
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
  saveButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' }
});