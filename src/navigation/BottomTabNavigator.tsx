import React from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';

const Tab = createBottomTabNavigator();

// Tymczasowe ekrany-zaślepki pod kolejne etapy:
const TripsPlaceholder = () => <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Lista Podróży (CRUD)</Text></View>;
const VaultPlaceholder = () => <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Sejf Offline (PIN)</Text></View>;
const ProfilePlaceholder = () => <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Twój Profil</Text></View>;

export const BottomTabNavigator = () => {
  const { isGuest, logout, language } = useAuthStore();
  const t = translations[language].bottomTab;

  const handleProfilePress = (e: any, navigation: any) => {
    if (isGuest) {
      // Zatrzymujemy domyślne przejście do zakładki profilu
      e.preventDefault();
      Alert.alert(
        "Konto Gościa",
        "Aby uzyskać dostęp do profilu i synchronizacji w chmurze, zaloguj się lub zarejestruj.",
        [
          { text: "Anuluj", style: "cancel" },
          { text: "Zaloguj się", onPress: () => logout() } // logout cofnie gościa do WelcomeScreen
        ]
      );
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#F8FAFC',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#0B1120',
          borderTopColor: '#334155',
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen 
        name="Explore" 
        component={HomeScreen} 
        options={{ tabBarIcon: () => <Text>🏠</Text>, tabBarLabel: t.tab_explore }} 
      />
      <Tab.Screen 
        name="Trips" 
        component={TripsPlaceholder} 
        options={{ tabBarIcon: () => <Text>✈️</Text>, tabBarLabel: t.tab_trips }} 
      />
      <Tab.Screen 
        name="Vault" 
        component={VaultPlaceholder} 
        options={{ tabBarIcon: () => <Text>🔒</Text>, tabBarLabel: t.tab_vault }} 
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfilePlaceholder} 
        options={{ 
          tabBarIcon: () => <Text>👤</Text>, 
          tabBarLabel: t.tab_profile,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleProfilePress(e, navigation),
        })}
      />
    </Tab.Navigator>
  );
};