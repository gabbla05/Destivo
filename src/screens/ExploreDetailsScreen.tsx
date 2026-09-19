import React from 'react';
import { View, Text, StyleSheet, ScrollView, ImageBackground, TouchableOpacity, Linking, Alert, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveDestination } from '../lib/liveExplore';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import { useTripCreatorStore } from '../store/tripCreatorStore';

export const ExploreDetailsScreen: React.FC<{ route: any, navigation: any }> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { destData } = route.params as { destData: LiveDestination };
  const trip = destData.proposedTrip;
  const { language } = useAuthStore();
  const t = translations[language].exploreDetails;
  const homeT = translations[language].homeScreen;
  const destinationNames = homeT.destinationNames as Record<string, string> | undefined;
  const localizedCity = (destinationNames && destinationNames[destData.city]) || destData.city;

  const translateCondition = (condition?: string) => {
    if (!condition || language === 'pl') return condition || '';
    if (condition === 'Bez opadów, idealnie na zwiedzanie') return t.weatherClear;
    if (condition === 'Mogą wystąpić opady - weź parasol') return t.weatherRain;
    return condition
      .replace(/bezchmurnie/gi, 'clear skies')
      .replace(/zachmurzenie duże/gi, 'overcast')
      .replace(/zachmurzenie małe/gi, 'partly cloudy')
      .replace(/zachmurzenie umiarkowane/gi, 'mostly cloudy')
      .replace(/deszcz/gi, 'rain')
      .replace(/mżawka/gi, 'drizzle')
      .replace(/śnieg/gi, 'snow')
      .replace(/burza/gi, 'storm');
  };

  const translateCrowd = (crowdLevel?: string) => {
    if (!crowdLevel || language === 'pl') return crowdLevel || '';
    if (crowdLevel === 'Bardzo popularne (duży tłum) - rezerwuj bilety wcześniej!') return t.crowdPopular;
    if (crowdLevel === 'Spokojniejsza okolica, mniej turystów') return t.crowdQuiet;
    return t.crowdModerate;
  };

  const description = language === 'en'
    ? (t.destinationDescriptions as Record<string, string>)[destData.city] || destData.shortDescription
    : destData.shortDescription;

  const handleCheckTransport = async () => {
    let url = '';
    const originAirport = (destData.nearestAirport || 'WAW').toLowerCase();
    const destCode = (destData.transportCode || destData.city).toLowerCase();

    if (destData.recommendedTransport === 'flight') {
      url = `https://www.skyscanner.pl/transport/loty/${originAirport}/${destCode}/`;
    } else if (destData.recommendedTransport === 'train') {
      url = 'https://koleo.pl';
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${destData.lat},${destData.lon}`;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('DESTIVO', t.transportError);
  };

  const handleCheckLodging = async () => {
    const url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destData.city)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('DESTIVO', t.lodgingError);
  };

  const normalizeDate = (d?: string) => (d ? d.replace(/[./]/g, '-') : '');

  const handleBuildCustomPlan = () => {
    useTripCreatorStore.getState().setStep1Data({
      tripName: `Wyprawa: ${destData.city}`,
      origin: destData.nearestAirport || 'Warszawa',
      destination: destData.city,
      startDate: normalizeDate(trip?.startDate),
      endDate: normalizeDate(trip?.endDate),
    });
    navigation.navigate('TripCreator');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ImageBackground source={{ uri: destData.coverImage }} style={styles.heroImage}>
        <SafeAreaView edges={['top']} style={styles.topNav}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} testID="explore-back-button">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.heroOverlay}>
          <Text style={styles.cityTitle}>{localizedCity}</Text>
          <Text style={styles.countryTitle}>
            {destData.country} • {t.heroSubtitle.replace('{{days}}', String(trip?.durationDays || 0))}
          </Text>
        </View>
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* BANNER TRANSPORTOWY (DOPASOWANY DO ODLEGŁOŚCI: LOT / POCIĄG / AUTO) */}
        <View style={[
          styles.transportBanner,
          destData.recommendedTransport === 'train' 
            ? styles.transportBannerTrain 
            : destData.recommendedTransport === 'car'
              ? styles.transportBannerCar
              : styles.transportBannerFlight
        ]}>
          <View style={[
            styles.transportIconCol,
            destData.recommendedTransport === 'train'
              ? styles.transportIconColTrain
              : destData.recommendedTransport === 'car'
                ? styles.transportIconColCar
                : styles.transportIconColFlight
          ]}>
            {destData.recommendedTransport === 'train' ? (
              <Ionicons name="train" size={24} color="#818CF8" />
            ) : destData.recommendedTransport === 'car' ? (
              <Ionicons name="car" size={24} color="#F59E0B" />
            ) : (
              <Ionicons name="airplane" size={24} color="#38BDF8" />
            )}
          </View>
          <View style={styles.transportTextCol}>
            <Text style={[
              styles.transportTitleText,
              destData.recommendedTransport === 'train'
                ? styles.transportTitleTrain
                : destData.recommendedTransport === 'car'
                  ? styles.transportTitleCar
                  : styles.transportTitleFlight
            ]}>
              {destData.recommendedTransport === 'flight'
                ? (t.transportFlightTitle || 'Połączenie lotnicze').replace('✈️ ', '')
                : destData.recommendedTransport === 'train'
                  ? (t.transportTrainTitle || 'Połączenie kolejowe').replace('🚆 ', '')
                  : (t.transportCarTitle || 'Podróż samochodem ({{distance}} km)').replace('🚗 ', '').replace('{{distance}}', String(destData.distanceKm || ''))}
            </Text>
            <Text style={styles.transportDescText}>
              {destData.recommendedTransport === 'flight'
                ? (t.transportFlightDesc || 'Wylot z lotniska: {{airport}} • Sprawdź dostępne loty na żywo').replace('{{airport}}', destData.nearestAirport || 'WAW')
                : destData.recommendedTransport === 'train'
                  ? (t.transportTrainDesc || 'Wygodny dojazd pociągiem PKP / Koleo • Sprawdź rozkład jazdy')
                  : (t.transportCarDesc || 'Szybki dojazd samochodem • Wyznacz trasę i nawigację w Google Maps')}
            </Text>
          </View>
        </View>

        {/* REKOMENDACJA POGODOWA I LOGISTYCZNA */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>{t.proposedTripTitle}</Text>
          <Text style={styles.highlightText}>{t.dateRange.replace('🗓️ ', '').replace('{{start}}', trip?.startDate || '').replace('{{end}}', trip?.endDate || '')}</Text>
          <Text style={styles.highlightText}>{t.forecast.replace('🌤️ ', '').replace('{{temp}}', String(trip?.estimatedTemp || 0)).replace('{{condition}}', translateCondition(trip?.condition))}</Text>
          <Text style={styles.highlightText}>{t.crowd.replace('👥 ', '').replace('{{level}}', translateCrowd(trip?.crowdLevel))}</Text>
        </View>

        <Text style={styles.description}>{description}</Text>

        {/* ETAP 3: PREDEFINIOWANY SZABLON WYCIECZKI vs WŁASNY PLAN */}
        {destData.hasPredefinedPlan ? (
          <>
            <View style={styles.readyPlanNoticeCard}>
              <Text style={styles.readyPlanNoticeText}>
                {t.readyPlanNotice || 'Dopasowano do bazy gotowych szablonów. Poniżej znajduje się pełny harmonogram dzień po dniu!'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>{t.readyPlanTitle}</Text>
            {trip?.itinerary?.map((dayPlan) => (
              <View key={dayPlan.day} style={styles.dayContainer}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayNumber}>{t.dayTitle.replace('{{day}}', String(dayPlan.day))}</Text>
                </View>
                <View style={styles.tagsContainer}>
                  {dayPlan.attractions.map((attr, idx) => (
                    <View key={idx} style={styles.tag}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="location-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                        <Text style={styles.tagText}>{attr}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : (
          /* BRAK PREDEFINIOWANEGO SZABLONU - ZBUDUJ WŁASNY PLAN W KREATORZE */
          <View style={styles.customPlanNoticeBox}>
            <View style={styles.customPlanHeaderRow}>
              <Ionicons name="bulb-outline" size={22} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={styles.customPlanNoticeTitle}>
                {t.customPlanNoticeTitle || 'Brak gotowego szablonu wycieczki'}
              </Text>
            </View>
            <Text style={styles.customPlanNoticeDesc}>
              {t.customPlanNoticeDesc || 'Dla tej destynacji znaleźliśmy promocyjny bilet lotniczy, ale w bazie nie ma jeszcze opracowanego szablonu zwiedzania. Możesz kupić tani bilet, a plan wyjazdu ułożyć samodzielnie w naszym kreatorze!'}
            </Text>
            <TouchableOpacity 
              style={styles.planOwnTripInlineBtn}
              activeOpacity={0.85}
              onPress={handleBuildCustomPlan}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="construct-outline" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                <Text style={styles.planOwnTripInlineBtnText}>
                  {(t.planOwnTripBtn || 'Zbuduj własny plan wycieczki').replace('🛠️ ', '')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* PRZYCISKI AKCJI NA DOLE */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCheckTransport}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons 
                name={destData.recommendedTransport === 'train' ? 'train-outline' : destData.recommendedTransport === 'car' ? 'car-outline' : 'airplane-outline'} 
                size={15} 
                color="#38BDF8" 
                style={{ marginRight: 6 }} 
              />
              <Text style={styles.actionButtonText}>
                {(destData.recommendedTransport === 'flight' ? t.checkFlights : 
                 destData.recommendedTransport === 'train' ? t.checkTrains : t.checkRoute)
                 .replace('✈️ ', '').replace('🚆 ', '').replace('🚗 ', '')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleCheckLodging}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="bed-outline" size={15} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.actionButtonText}>{t.lodging.replace('🏨 ', '')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {destData.hasPredefinedPlan ? (
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={() => navigation.navigate('QuickSetup', { destData })}
          >
            <Text style={styles.primaryButtonText}>{t.chooseTrip}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={handleBuildCustomPlan}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="construct-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>
                {(t.planOwnTripBtn || 'Zbuduj własny plan w kreatorze').replace('🛠️ ', '')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  heroImage: { width: '100%', height: 350, justifyContent: 'space-between' },
  topNav: { paddingHorizontal: 20, paddingTop: 10 },
  backButton: { width: 44, height: 44, backgroundColor: 'rgba(11, 17, 32, 0.7)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold' },
  heroOverlay: { padding: 24, backgroundColor: 'rgba(11, 17, 32, 0.75)' },
  cityTitle: { color: '#FFFFFF', fontSize: 36, fontWeight: '900' },
  countryTitle: { color: '#F59E0B', fontSize: 16, fontWeight: '700', marginTop: 4 },
  scrollContent: { padding: 24, paddingBottom: 160 },
  
  // Baner transportowy
  transportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  transportBannerFlight: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  transportBannerTrain: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  transportBannerCar: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  transportIconCol: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportIconColFlight: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  transportIconColTrain: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  transportIconColCar: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  transportIconText: {
    fontSize: 22,
  },
  transportTextCol: {
    flex: 1,
  },
  transportTitleText: {
    fontSize: 16,
    fontWeight: '800',
  },
  transportTitleFlight: {
    color: '#38BDF8',
  },
  transportTitleTrain: {
    color: '#818CF8',
  },
  transportTitleCar: {
    color: '#F59E0B',
  },
  transportDescText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  infoCard: { backgroundColor: '#111827', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  highlightText: { color: '#38BDF8', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  description: { color: '#CBD5E1', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  
  // Gotowy plan
  readyPlanNoticeCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  readyPlanNoticeText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  dayContainer: { marginBottom: 20 },
  dayHeader: { borderBottomWidth: 1, borderBottomColor: '#1E293B', paddingBottom: 8, marginBottom: 12 },
  dayNumber: { color: '#F59E0B', fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: { backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  tagText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  
  // Brak gotowego planu - własny plan w kreatorze
  customPlanNoticeBox: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  customPlanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  customPlanHeaderIcon: {
    fontSize: 20,
  },
  customPlanNoticeTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  customPlanNoticeDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  planOwnTripInlineBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  planOwnTripInlineBtnText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
  },

  bottomBar: { position: 'absolute', bottom: 0, width: '100%', padding: 20, backgroundColor: 'rgba(11, 17, 32, 0.95)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  rowButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionButton: { flex: 1, backgroundColor: '#1E293B', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  actionButtonText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  primaryButton: { backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '800' }
});