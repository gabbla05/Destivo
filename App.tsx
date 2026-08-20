import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; // <-- 1. Importujemy Stack Navigator

import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { LoginRegisterScreen } from './src/screens/auth/LoginRegisterScreen';
import { useAuthStore } from './src/store/authStore';
import { BottomTabNavigator } from './src/navigation/BottomTabNavigator';
import { TripCreatorNavigator } from './src/navigation/TripCreatorNavigator';
import { ExploreDetailsScreen } from './src/screens/ExploreDetailsScreen';
import { QuickSetupScreen } from './src/screens/QuickSetupScreen';

const RootStack = createNativeStackNavigator();

export default function App() {
  const { user, isGuest } = useAuthStore();
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'auth'>('welcome');
  const [authScreenMode, setAuthScreenMode] = useState<'login' | 'register'>('register');

  // 1. Jeśli użytkownik jest zalogowany LUB wszedł jako gość -> uruchamiamy Root Stack (Dolne menu + Kreator)
  if (user || isGuest) {
    return (
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {/* Główny ekran z dolnymi zakładkami */}
          <RootStack.Screen name="MainTabs" component={BottomTabNavigator} />
          {/* Ekran Kreatora Podróży otwierany na wierzchu zakładek */}
          <RootStack.Screen name="TripCreator" component={TripCreatorNavigator} />
          <RootStack.Screen name="ExploreDetails" component={ExploreDetailsScreen} />
          <RootStack.Screen name="QuickSetup" component={QuickSetupScreen} />
        </RootStack.Navigator>
      </NavigationContainer>
    );
  }

  // 2. Jeśli jesteśmy na ekranie logowania/rejestracji
  if (currentScreen === 'auth') {
    return (
      <LoginRegisterScreen
        initialMode={authScreenMode}
        onBack={() => setCurrentScreen('welcome')} // <-- DODAJ TE STRZALKE WSTECZ TUTAJ
        onSuccess={() => {
          // Po udanym zalogowaniu/rejestracji stan w authStore się zmieni i otworzy RootStack
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