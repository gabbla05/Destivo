import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // <-- 1. Naprawiony WARN (nowy import)

import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { LoginRegisterScreen } from './src/screens/auth/LoginRegisterScreen'; // <-- 2. Naprawiony ERROR (import bez klamer!)
import { useAuthStore } from './src/store/authStore';

export default function App() {
  const { user, isGuest, logout } = useAuthStore();
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'auth'>('welcome');
  const [authScreenMode, setAuthScreenMode] = useState<'login' | 'register'>('register');

  // 1. Jeśli użytkownik jest zalogowany lub wszedł jako gość -> pokaż ekran główny / Home
  if (user || isGuest) {
    return (
      <SafeAreaView style={styles.homeContainer}>
        <View style={styles.homeContent}>
          <Text style={styles.homeTitle}>🎉 Jesteś w Sejfie DESTIVO!</Text>
          <Text style={styles.homeSubtitle}>
            {isGuest
              ? 'Sesja gościnna (dane tylko offline)'
              : `Zalogowano jako: ${user?.email}`}
          </Text>

          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>Wyloguj / Wyjdź</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Jeśli jesteśmy na ekranie logowania/rejestracji
  if (currentScreen === 'auth') {
    return (
      <LoginRegisterScreen
        initialMode={authScreenMode}
        onSuccess={() => {
          // Po sukcesie Zustand automatycznie przełączy widok na punkt 1
        }}
      />
    );
  }

  // 3. Domyślny ekran startowy
  return (
    <WelcomeScreen
      onNavigateToAuth={(mode) => {
        setAuthScreenMode(mode);
        setCurrentScreen('auth');
      }}
    />
  );
}

const styles = StyleSheet.create({
  homeContainer: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  homeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  homeTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  homeSubtitle: {
    color: '#F59E0B',
    fontSize: 14,
    marginBottom: 40,
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
});