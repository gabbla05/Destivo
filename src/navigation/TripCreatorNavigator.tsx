// src/navigation/TripCreatorNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import ekranów i stworzonego providera
import { Step1DestinationScreen } from '../screens/TripCreator/Step1DestinationScreen';
import { Step2TransportScreen } from '../screens/TripCreator/Step2TransportScreen';
import { Step3LodgingScreen } from '../screens/TripCreator/Step3LodgingScreen';
import { Step4AttractionsScreen } from '../screens/TripCreator/Step4AttractionsScreen';
import { supabaseTransportProvider } from '../lib/transportProvider';

const Stack = createNativeStackNavigator();

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
      
      <Stack.Screen name="Step4Attractions" component={Step4AttractionsScreen} />
    </Stack.Navigator>
  );
};