import React from 'react';
import { View, Text, StyleSheet, ScrollView, ImageBackground, TouchableOpacity, Linking, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveDestination } from '../lib/liveExplore';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';

export const ExploreDetailsScreen: React.FC<{ route: any, navigation: any }> = ({ route, navigation }) => {
  const { destData } = route.params as { destData: LiveDestination };
  const trip = destData.proposedTrip;
  const { language } = useAuthStore();
  const t = translations[language].exploreDetails;

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
    if (destData.recommendedTransport === 'flight') {
      url = `https://www.skyscanner.pl/transport/loty/waw/${destData.transportCode}/`;
    } else if (destData.recommendedTransport === 'train') {
      url = `https://koleo.pl/rozklad/warszawa-glowna/${encodeURIComponent(destData.transportCode)}/`;
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ImageBackground source={{ uri: destData.coverImage }} style={styles.heroImage}>
        <SafeAreaView edges={['top']} style={styles.topNav}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.heroOverlay}>
          <Text style={styles.cityTitle}>{destData.city}</Text>
          <Text style={styles.countryTitle}>{t.heroSubtitle.replace('{{days}}', String(trip?.durationDays || 0))}</Text>
        </View>
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* REKOMENDACJA */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>{t.proposedTripTitle}</Text>
          <Text style={styles.highlightText}>{t.dateRange.replace('{{start}}', trip?.startDate || '').replace('{{end}}', trip?.endDate || '')}</Text>
          <Text style={styles.highlightText}>{t.forecast.replace('{{temp}}', String(trip?.estimatedTemp || 0)).replace('{{condition}}', translateCondition(trip?.condition))}</Text>
          <Text style={styles.highlightText}>{t.crowd.replace('{{level}}', translateCrowd(trip?.crowdLevel))}</Text>
        </View>

        <Text style={styles.description}>{description}</Text>

        {/* GOTOWY PLAN PO DNIACH */}
        <Text style={styles.sectionTitle}>{t.readyPlanTitle}</Text>
        {trip?.itinerary.map((dayPlan) => (
          <View key={dayPlan.day} style={styles.dayContainer}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayNumber}>{t.dayTitle.replace('{{day}}', String(dayPlan.day))}</Text>
            </View>
            <View style={styles.tagsContainer}>
              {dayPlan.attractions.map((attr, idx) => (
                <View key={idx} style={styles.tag}>
                  <Text style={styles.tagText}>📍 {attr}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* PRZYCISKI AKCJI NA DOLE */}
      <View style={styles.bottomBar}>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCheckTransport}>
            <Text style={styles.actionButtonText}>
              {destData.recommendedTransport === 'flight' ? t.checkFlights : 
               destData.recommendedTransport === 'train' ? t.checkTrains : t.checkRoute}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleCheckLodging}>
            <Text style={styles.actionButtonText}>{t.lodging}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={() => navigation.navigate('QuickSetup', { destData })}
        >
          <Text style={styles.primaryButtonText}>{t.chooseTrip}</Text>
        </TouchableOpacity>
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
  scrollContent: { padding: 24, paddingBottom: 140 },
  infoCard: { backgroundColor: '#111827', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  highlightText: { color: '#38BDF8', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  description: { color: '#CBD5E1', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  dayContainer: { marginBottom: 20 },
  dayHeader: { borderBottomWidth: 1, borderBottomColor: '#1E293B', paddingBottom: 8, marginBottom: 12 },
  dayNumber: { color: '#F59E0B', fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: { backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  tagText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, width: '100%', padding: 20, backgroundColor: 'rgba(11, 17, 32, 0.95)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  rowButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionButton: { flex: 1, backgroundColor: '#1E293B', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  actionButtonText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  primaryButton: { backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '800' }
});