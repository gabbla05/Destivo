import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ImageBackground,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import { generateLiveRecommendations, LiveDestination } from '../lib/liveExplore';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

export const HomeScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { isGuest, user, language } = useAuthStore();
  const t = translations[language].homeScreen;
  const destinationNames = t.destinationNames as Record<string, string>;

  const [recommendations, setRecommendations] = useState<LiveDestination[]>([]);
  const [loading, setLoading] = useState(true);

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
        Alert.alert(t.gpsErrorTitle, t.gpsErrorMessage);
      } finally {
        setLoading(false);
      }
    }
    loadExplore();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        
        {/* NAGŁÓWEK */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>
            {isGuest ? t.header_greetingGuest : `${t.header_greetingUser}, ${userName}!`}
          </Text>
          <Text style={styles.subText}>{t.header_subtitle}</Text>
        </View>

        {/* PRZYCISKI GŁÓWNE */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.primaryButton} 
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('TripCreator')}
          >
            <Text style={styles.primaryButtonText}>{t.button_planNewTrip}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>{t.button_goToMyTrips}</Text>
          </TouchableOpacity>
        </View>

        {/* SEKCJA EXPLORE LIVE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.section_liveTitle}</Text>
          <Text style={styles.sectionSubtitle}>{t.section_liveSubtitle}</Text>
          
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loaderText}>{t.loader_explore}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.exploreList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.exploreProjectsContainer}
            >
              {recommendations.length > 0 ? recommendations.map((dest) => (
                <TouchableOpacity 
                  key={dest.id} 
                  activeOpacity={0.9}
                  onPress={() => navigation?.navigate('ExploreDetails', { destData: dest })}
                >
                  <ImageBackground 
                    source={{ uri: dest.coverImage }} 
                    style={styles.exploreProjectCard}
                    imageStyle={{ borderRadius: 18 }}
                  >
                    {dest.proposedTrip && (
                      <View style={styles.weatherBadge}>
                        <Text style={styles.weatherText}>
                          🗓️ {dest.proposedTrip.startDate.slice(0, 5)} - {dest.proposedTrip.endDate.slice(0, 5)} | ~{dest.proposedTrip.estimatedTemp}°C
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
            </ScrollView>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subText: {
    fontSize: 15,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '400',
  },
  actionsContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 14,
  },
  primaryButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginTop: 32,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingHorizontal: 24,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  exploreProjectsContainer: {
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  exploreList: {
    flex: 1,
  },
  exploreProjectCard: {
    width: CARD_WIDTH, // <-- DYNAMICZNA SZEROKOŚĆ (Taka sama jak przyciski)
    height: 350, // <-- Trochę wyższy, żeby ładnie wyglądał
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
  },
  cardOverlay: {
    backgroundColor: 'rgba(11, 17, 32, 0.75)',
    padding: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  cardCity: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  cardCountry: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  weatherBadge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(11, 17, 32, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    margin: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  weatherText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loaderText: {
    color: '#94A3B8',
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    width: CARD_WIDTH, // <-- DYNAMICZNA SZEROKOŚĆ
    height: 350,
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyCardText: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  }
});