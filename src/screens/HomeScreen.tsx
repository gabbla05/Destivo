import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';

export const HomeScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { isGuest, user, language, toggleLanguage } = useAuthStore();
  
  const t = translations[language].homeScreen;

  const userName = isGuest
    ? undefined
    : user?.name || user?.email?.split('@')[0] || t.header_fallbackTraveler;

  // Symulacja: czy dzisiejsza data pokrywa się z datą wyjazdu
  const [hasActiveTrip, setHasActiveTrip] = useState(false);

  const exploreCards = [
    {
      id: '1',
      title: t.explore_card1_title,
      description: t.explore_card1_desc,
    },
    {
      id: '2',
      title: t.explore_card2_title,
      description: t.explore_card2_desc,
    },
    {
      id: '3',
      title: t.explore_card3_title,
      description: t.explore_card3_desc,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.langButton} onPress={toggleLanguage} activeOpacity={0.7}>
            <Text style={styles.langButtonText}>{t.button_languageSwitchLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* 1. SEKCJA GÓRNA: POWITANIE UŻYTKOWNIKA POD PRZYCISKIEM JĘZYKA */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>
            {isGuest ? t.header_greetingGuest : `${t.header_greetingUser}, ${userName}! 👋`}
          </Text>
          <Text style={styles.subText}>{t.header_subtitle}</Text>
        </View>

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

        <View style={styles.section}>
          <View style={styles.exploreProjectsContainer}>
            {exploreCards.map((card) => (
              <View key={card.id} style={styles.exploreProjectCard} />
            ))}
          </View>
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
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langButtonText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
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
  activeTripCard: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  activeTripTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  activeTripSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  widgetsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  widget: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#334155',
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  exploreProjectsContainer: {
    gap: 16,
  },
  exploreProjectCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#1E293B',
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
});