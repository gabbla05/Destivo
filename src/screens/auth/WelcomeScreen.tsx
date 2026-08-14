import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { translations } from '../../i18n/translations';
import { useAuthStore } from '../../store/authStore';

interface WelcomeScreenProps {
  onNavigateToAuth?: (mode: 'login' | 'register') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNavigateToAuth }) => {
  const { continueAsGuest, language } = useAuthStore();

  const t = translations[language].welcomeScreen;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <Image
            source={require('../../../assets/logo/logoBezTla.png')}
            style={[styles.logoImage, styles.logoImageTight]}
            resizeMode="contain"
          />

          {/*<Text style={styles.title}>{t.header_titleText}</Text>*/}

          <Image
            source={require('../../../assets/logo/NapisBezKropkiBialy.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.subtitleTop}>{t.header_subtitleTopLine}</Text>
          <Text style={styles.subtitleAccent}>
            {t.header_subtitleOrangeAccentLine}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          {/* Przycisk 1: Zarejestruj się (Główny akcent) */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onNavigateToAuth?.('register')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {t.button_registerNewAccount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onNavigateToAuth?.('login')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              {t.button_loginToExistingAccount}
            </Text>
          </TouchableOpacity>

          {/* Przycisk 3: Kontynuuj jako gość */}
          <TouchableOpacity
            style={styles.guestButton}
            onPress={continueAsGuest}
            activeOpacity={0.6}
          >
            <Text style={styles.guestButtonText}>
              {t.button_continueAsGuest}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
};








//STYLE
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120', 
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  logoImage: {
    width: 200,
    height: 200,
    marginBottom: 0,
  },
  logoImageTight: {
    marginBottom: -80,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  subtitleTop: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '400',
  },
  subtitleAccent: {
    fontSize: 15,
    color: '#F59E0B', // Bursztynowo-pomarańczowy akcent
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 2,
  },
  buttonContainer: {
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
  guestButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  guestButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
});