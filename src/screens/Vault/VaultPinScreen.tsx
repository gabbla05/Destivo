// src/screens/Vault/VaultPinScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useVaultStore } from '../../store/vaultStore';

export const VaultPinScreen = () => {
  const { pin, setPin, verifyPin, isBiometricsEnabled, unlockVault } = useVaultStore();
  const isSetupMode = !pin;
  
  const [input, setInput] = useState('');
  const [setupStep, setSetupStep] = useState<'ENTER' | 'CONFIRM'>('ENTER');
  const [firstPin, setFirstPin] = useState('');

  // Automatyczne sprawdzanie biometrii przy starcie
  useEffect(() => {
    if (!isSetupMode && isBiometricsEnabled) {
      handleBiometrics();
    }
  }, []);

  const handleBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Odblokuj Sejf Destivo',
        fallbackLabel: 'Użyj kodu PIN',
      });
      if (result.success) unlockVault();
    }
  };

  const handlePress = (val: string) => {
    if (input.length < 4) {
      const newInput = input + val;
      setInput(newInput);
      
      if (newInput.length === 4) {
        setTimeout(() => processCompletePin(newInput), 100); // Lekkie opóźnienie dla UX (żeby kropka się zapaliła)
      }
    }
  };

  const handleDelete = () => setInput(prev => prev.slice(0, -1));
  const handleClear = () => setInput('');

  const processCompletePin = (enteredPin: string) => {
    if (isSetupMode) {
      if (setupStep === 'ENTER') {
        setFirstPin(enteredPin);
        setInput('');
        setSetupStep('CONFIRM');
      } else {
        if (enteredPin === firstPin) {
          Alert.alert('Sukces', 'Kod PIN został ustawiony!');
          setPin(enteredPin); // Sukces - PIN utworzony
        } else {
          Vibration.vibrate();
          Alert.alert('Błąd', 'Kody PIN nie są identyczne. Spróbuj ponownie.');
          setInput('');
          setSetupStep('ENTER');
        }
      }
    } else {
      if (!verifyPin(enteredPin)) {
        Vibration.vibrate();
        setInput('');
      }
    }
  };

  const renderDots = () => {
    return (
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, input.length > i && styles.dotFilled]} />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>☁️ Destivo</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.lockIconContainer}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>

        <Text style={styles.title}>
          {isSetupMode 
            ? (setupStep === 'ENTER' ? 'Utwórz kod PIN' : 'Potwierdź kod PIN') 
            : 'Wprowadź PIN Sejfu'}
        </Text>
        <Text style={styles.subtitle}>
          Dostęp do szyfrowanych dokumentów i biletów
        </Text>

        {renderDots()}

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <TouchableOpacity key={num} style={styles.keyButton} onPress={() => handlePress(num)} activeOpacity={0.7}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.keyAction} onPress={handleClear} activeOpacity={0.7}>
            <Text style={styles.keyActionText}>CLEAR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyButton} onPress={() => handlePress('0')} activeOpacity={0.7}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyAction} onPress={handleDelete} activeOpacity={0.7}>
            <Text style={styles.keyActionIcon}>⌫</Text>
          </TouchableOpacity>
        </View>

        {!isSetupMode && isBiometricsEnabled && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometrics}>
            <Text style={styles.biometricText}>☝️ Użyj biometrii</Text>
          </TouchableOpacity>
        )}
        
        {!isSetupMode && (
          <TouchableOpacity style={styles.forgotButton}>
            <Text style={styles.forgotText}>Zapomniałeś PIN-u?</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>🛡 END-TO-END ENCRYPTED PROTECTION</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B19' },
  header: { padding: 20, alignItems: 'center' },
  logo: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: -40 },
  lockIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
  lockIcon: { fontSize: 28 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 32, textAlign: 'center' },
  dotsContainer: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1E293B' },
  dotFilled: { backgroundColor: '#94A3B8' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'space-between', rowGap: 16 },
  keyButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1E293B' },
  keyText: { color: '#FFFFFF', fontSize: 28, fontWeight: '500' },
  keyAction: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  keyActionText: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  keyActionIcon: { color: '#94A3B8', fontSize: 24 },
  biometricButton: { marginTop: 32, backgroundColor: '#1E293B', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  biometricText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  forgotButton: { marginTop: 20 },
  forgotText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  footer: { paddingBottom: 30, alignItems: 'center' },
  footerText: { color: '#334155', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});