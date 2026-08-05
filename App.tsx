import React, { useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native'; // <-- DODANO: Wymagane dla BottomTabNavigator

import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { LoginRegisterScreen } from './src/screens/auth/LoginRegisterScreen'; // <-- ZOSTAWIONE: Poprawny import bez klamer
import { useAuthStore } from './src/store/authStore';
import { BottomTabNavigator } from './src/navigation/BottomTabNavigator';

export default function App() {
  const { user, isGuest } = useAuthStore();
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'auth'>('welcome');
  const [authScreenMode, setAuthScreenMode] = useState<'login' | 'register'>('register');

  // 1. Jeśli użytkownik jest zalogowany LUB wszedł jako gość -> uruchamiamy Dolne Menu (Dashboard, Podróże, Sejf, Profil)
  if (user || isGuest) {
    return (
      <NavigationContainer>
        <BottomTabNavigator />
      </NavigationContainer>
    );
  }

  // 2. Jeśli jesteśmy na ekranie logowania/rejestracji
  if (currentScreen === 'auth') {
    return (
      <LoginRegisterScreen
        initialMode={authScreenMode}
        onSuccess={() => {
          // Po udanym zalogowaniu/rejestracji stan w authStore się zmieni,
          // co automatycznie przełączy aplikację do warunku nr 1 (BottomTabNavigator)
        }}
      />
    );
  }

  // 3. Domyślny ekran startowy (WelcomeScreen)
  return (
    <WelcomeScreen
      onNavigateToAuth={(mode) => {
        setAuthScreenMode(mode);
        setCurrentScreen('auth');
      }}
    />
  );
}