import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import ekranów i stworzonego providera
import { Step1DestinationScreen } from '../screens/TripCreator/Step1DestinationScreen';
import { Step2TransportScreen } from '../screens/TripCreator/Step2TransportScreen';
import { supabaseTransportProvider } from '../lib/transportProvider';

const Stack = createNativeStackNavigator();

const Step3LodgingScreen = ({ navigation }: any) => (
  <SafeAreaView style={styles.placeholderContainer}>
    <Text style={styles.placeholderTitle}>STEP 3 OF 4 - Lodging (Booking)</Text>
    <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Step4')}>
      <Text style={styles.buttonText}>Dalej – Krok 4</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
      <Text style={styles.backButtonText}>← Cofnij</Text>
    </TouchableOpacity>
  </SafeAreaView>
);

const Step4AttractionsScreen = ({ navigation }: any) => (
  <SafeAreaView style={styles.placeholderContainer}>
    <Text style={styles.placeholderTitle}>STEP 4 OF 4 - Attractions</Text>
    <TouchableOpacity style={styles.button} onPress={() => navigation.popToTop()}>
      <Text style={styles.buttonText}>Zakończ i wróć na start</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
      <Text style={styles.backButtonText}>← Cofnij</Text>
    </TouchableOpacity>
  </SafeAreaView>
);

export const TripCreatorNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Step1" component={Step1DestinationScreen} />
      
      {/* Przekazanie supabaseTransportProvider do Step2TransportScreen */}
      <Stack.Screen name="Step2Transport">
        {(props) => (
          <Step2TransportScreen
            {...props}
            transportProvider={supabaseTransportProvider}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Step3" component={Step3LodgingScreen} />
      <Stack.Screen name="Step4" component={Step4AttractionsScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});