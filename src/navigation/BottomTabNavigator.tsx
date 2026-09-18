import React from 'react';
import { View, Text, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; // DODANE
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { TripsListScreen } from '../screens/TripsListScreen'; // DODANE
import { TimelineScreen } from '../screens/TimelineScreen';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import { VaultScreen } from '../screens/Vault/VaultScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AccountSecurityScreen } from '../screens/AccountSecurityScreen';

const Tab = createBottomTabNavigator();
const TripsStack = createNativeStackNavigator(); // STOS DLA ZAKŁADKI TRIPS

// Tworzymy Stos, który zawiera Listę Podróży i Oś Czasu
const TripsStackNavigator = () => {
  return (
    <TripsStack.Navigator screenOptions={{ headerShown: false }}>
      <TripsStack.Screen name="TripsList" component={TripsListScreen} />
      <TripsStack.Screen name="Timeline" component={TimelineScreen} />
    </TripsStack.Navigator>
  );
};

const ProfileStack = createNativeStackNavigator();

const ProfileStackNavigator = () => {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="AccountSecurity" component={AccountSecurityScreen} />
    </ProfileStack.Navigator>
  );
};


export const BottomTabNavigator = () => {
  const { isGuest, logout, language } = useAuthStore();
  const t = translations[language].bottomTab;

  const handleProfilePress = (e: any, navigation: any) => {
    if (isGuest) {
      // Zatrzymujemy domyślne przejście do zakładki profilu
      e.preventDefault();
      Alert.alert(
        t.guestAlertTitle,
        t.guestAlertMessage,
        [
          { text: t.guestAlertCancel, style: "cancel" },
          { text: t.guestAlertLogin, onPress: () => logout() } // logout cofnie gościa do WelcomeScreen
        ]
      );
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#64748B',
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
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={22} color={color} />
          ),
          tabBarLabel: t.tab_explore,
        }} 
      />
      <Tab.Screen 
        name="Trips" 
        component={TripsStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} size={22} color={color} />
          ),
          tabBarLabel: t.tab_trips,
        }} 
      />
      <Tab.Screen 
        name="Vault" 
        component={VaultScreen} 
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "shield-checkmark" : "shield-checkmark-outline"} size={22} color={color} />
          ),
          tabBarLabel: t.tab_vault,
        }} 
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
          tabBarLabel: t.tab_profile,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleProfilePress(e, navigation),
        })}
      />
    </Tab.Navigator>
  );
};