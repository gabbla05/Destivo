import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; // <-- 1. Importujemy Stack Navigator
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Linking } from 'react-native';

import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { LoginRegisterScreen } from './src/screens/auth/LoginRegisterScreen';
import { useAuthStore } from './src/store/authStore';
import { BottomTabNavigator } from './src/navigation/BottomTabNavigator';
import { TripCreatorNavigator } from './src/navigation/TripCreatorNavigator';
import { ExploreDetailsScreen } from './src/screens/ExploreDetailsScreen';
import { QuickSetupScreen } from './src/screens/QuickSetupScreen';
import { PowerSyncContext } from '@powersync/react-native';
import { powerSync } from './src/lib/powersync';

const RootStack = createNativeStackNavigator();

export default function App() {
  const { user, isGuest } = useAuthStore();
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'auth'>('welcome');
  const [authScreenMode, setAuthScreenMode] = useState<'login' | 'register'>('register');

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (url && url.includes('destivo://')) {
        setCurrentScreen('auth');
        setAuthScreenMode('login');
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const renderContent = () => {
    // 1. Jeśli użytkownik jest zalogowany LUB wszedł jako gość -> uruchamiamy Root Stack (Dolne menu + Kreator)
    if (user || isGuest) {
      return (
        <PowerSyncContext.Provider value={powerSync}>
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
        </PowerSyncContext.Provider>
      );
    }

    // 2. Jeśli jesteśmy na ekranie logowania/rejestracji
    if (currentScreen === 'auth') {
      return (
        <LoginRegisterScreen
          initialMode={authScreenMode}
          onBack={() => setCurrentScreen('welcome')}
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
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#0B1120' }}>
      {renderContent()}
    </SafeAreaProvider>
  );
}