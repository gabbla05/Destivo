import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';

export default function App() {
  return (
    <>
      {/* Ustawiamy jasne ikony paska statusu, żeby pasowały do ciemnego motywu */}
      <StatusBar style="light" />
      <WelcomeScreen />
    </>
  );
}