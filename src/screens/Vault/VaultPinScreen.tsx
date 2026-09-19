// src/screens/Vault/VaultPinScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useVaultStore } from '../../store/vaultStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { translations } from '../../i18n/translations';

export const VaultPinScreen = () => {
  const { pin, setPin, verifyPin, isBiometricsEnabled, unlockVault } = useVaultStore();
  const { user, language } = useAuthStore();
  const t = translations[language].vault;
  const commonT = translations[language].common;
  const isSetupMode = !pin;
  
  const [input, setInput] = useState('');
  const [setupStep, setSetupStep] = useState<'ENTER' | 'CONFIRM'>('ENTER');
  const [firstPin, setFirstPin] = useState('');

  // Stan Modala resetowania PIN-u (Forgot PIN)
  const [showForgotPinModal, setShowForgotPinModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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
        promptMessage: t.biometricPrompt,
        fallbackLabel: t.biometricFallback,
      });
      if (result.success) unlockVault();
    }
  };

  const handlePress = (val: string) => {
    if (input.length < 4) {
      const newInput = input + val;
      setInput(newInput);
      
      if (newInput.length === 4) {
        setTimeout(() => processCompletePin(newInput), 100);
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
          Alert.alert(commonT.success, t.pinSet);
          setPin(enteredPin); // Sukces - PIN utworzony
        } else {
          Vibration.vibrate();
          Alert.alert(t.error, t.pinMismatch);
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

  // Obsługa resetu PIN-u
  const handleResetPinWithPassword = async () => {
    const isUserGuest = user?.isGuest || !user?.email;

    if (isUserGuest) {
      // Dla gościa - natychmiastowe wyczyszczenie PIN-u
      useVaultStore.setState({ pin: null, isUnlocked: false });
      setShowForgotPinModal(false);
      setInput('');
      setFirstPin('');
      setSetupStep('ENTER');
      Alert.alert(commonT.success, t.pinResetSuccess || 'Kod PIN został zresetowany. Możesz teraz ustawić nowy PIN.');
      return;
    }

    if (!resetPassword.trim()) {
      Alert.alert('DESTIVO', t.passwordPlaceholder || 'Wpisz hasło do konta');
      return;
    }

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: resetPassword,
      });

      if (error) {
        Alert.alert('DESTIVO', t.wrongPassword || 'Nieprawidłowe hasło do konta. Spróbuj ponownie.');
        return;
      }

      // Hasło prawidłowe - resetujemy kod PIN
      useVaultStore.setState({ pin: null, isUnlocked: false });
      setShowForgotPinModal(false);
      setResetPassword('');
      setInput('');
      setFirstPin('');
      setSetupStep('ENTER');
      Alert.alert(commonT.success, t.pinResetSuccess || 'Kod PIN został zresetowany. Możesz teraz ustawić nowy PIN.');
    } catch (err: any) {
      Alert.alert('DESTIVO', err?.message || t.wrongPassword || 'Błąd weryfikacji hasła.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSendAccountPasswordReset = async () => {
    if (!user?.email) return;
    try {
      setResetLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'destivo://reset-password',
      });
      if (error) throw error;
      Alert.alert(commonT.success || 'DESTIVO', t.resetLinkSent || 'Link do zresetowania hasła został wysłany na Twój adres e-mail.');
    } catch (e: any) {
      Alert.alert(t.error || 'DESTIVO', e?.message || t.resetLinkError || 'Błąd wysyłania linku resetującego.');
    } finally {
      setResetLoading(false);
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
      {/* LOGO DESTIVO NA GÓRZE (spójne z HomeScreen) */}
      <View style={styles.header}>
        <Image
          source={require('../../../assets/logo/NapisKropkaBialy.png')}
          style={styles.topLogo}
          resizeMode="contain"
          testID="destivo-top-logo"
        />
      </View>

      <View style={styles.content}>
        <View style={styles.lockIconContainer}>
          <Ionicons name="lock-closed" size={30} color="#F59E0B" />
        </View>

        <Text style={styles.title}>
          {isSetupMode 
            ? (setupStep === 'ENTER' ? t.pinCreate : t.pinConfirm) 
            : t.enterPinTitle}
        </Text>
        <Text style={styles.subtitle}>
          {t.pinSubtitle}
        </Text>

        {renderDots()}

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <TouchableOpacity key={num} style={styles.keyButton} onPress={() => handlePress(num)} activeOpacity={0.7}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.keyAction} onPress={handleClear} activeOpacity={0.7}>
            <Text style={styles.keyActionText}>{t.clear}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyButton} onPress={() => handlePress('0')} activeOpacity={0.7}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyAction} onPress={handleDelete} activeOpacity={0.7}>
            <Ionicons name="backspace-outline" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {!isSetupMode && isBiometricsEnabled && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometrics} activeOpacity={0.8}>
            <Ionicons name="finger-print" size={18} color="#38BDF8" style={{ marginRight: 8 }} />
            <Text style={styles.biometricText}>{t.useBiometrics}</Text>
          </TouchableOpacity>
        )}
        
        {!isSetupMode && (
          <TouchableOpacity 
            style={styles.forgotButton}
            onPress={() => setShowForgotPinModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotText}>{t.forgotPin}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-outline" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
        <Text style={styles.footerText}>{t.footerNotice || 'DESTIVO END-TO-END LOCAL ENCRYPTION'}</Text>
      </View>

      {/* MODAL RESETOWANIA KODU PIN (FORGOT PIN) */}
      <Modal
        visible={showForgotPinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForgotPinModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{t.forgotPinTitle || 'Zresetuj PIN Sejfu'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowForgotPinModal(false);
                  setResetPassword('');
                }}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDesc}>
                {user?.isGuest || !user?.email
                  ? (t.guestForgotPinDesc || 'Dla konta gościa możesz zresetować kod PIN Sejfu bezpośrednio.')
                  : (t.forgotPinDesc || 'Aby zresetować kod PIN, potwierdź tożsamość hasłem do swojego konta Destivo.')}
              </Text>

              {user?.email && !user?.isGuest ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t.emailLabel || 'ADRES E-MAIL'}</Text>
                    <View style={styles.inputContainerDisabled}>
                      <Ionicons name="mail-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                      <Text style={styles.disabledEmailText}>{user.email}</Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t.passwordLabel || 'HASŁO DO KONTA'}</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                      <TextInput
                        style={[styles.input, { flex: 1, paddingRight: 40 }]}
                        placeholder={t.passwordPlaceholder || 'Wpisz hasło do konta'}
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showResetPassword}
                        value={resetPassword}
                        onChangeText={setResetPassword}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setShowResetPassword(!showResetPassword)}
                        style={styles.eyeBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={showResetPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, resetLoading && { opacity: 0.7 }]}
                    onPress={handleResetPinWithPassword}
                    disabled={resetLoading}
                    activeOpacity={0.8}
                  >
                    {resetLoading ? (
                      <ActivityIndicator color="#0B1120" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{t.verifyAndReset || 'Zresetuj kod PIN'} ➔</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.forgotAccountPasswordRow}
                    onPress={handleSendAccountPasswordReset}
                    activeOpacity={0.7}
                    disabled={resetLoading}
                  >
                    <Text style={styles.forgotAccountPasswordText}>
                      {t.sendPasswordResetLink || 'Nie pamiętasz hasła? Wyślij link resetujący na e-mail'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 12 }]}
                  onPress={handleResetPinWithPassword}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>{t.verifyAndReset || 'Zresetuj kod PIN'} ➔</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  topLogo: { 
    width: 120, 
    height: 28,
  },
  content: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingHorizontal: 24, 
    marginTop: -20 
  },
  lockIconContainer: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: 'rgba(245, 158, 11, 0.12)', 
    borderWidth: 1, 
    borderColor: 'rgba(245, 158, 11, 0.3)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20, 
    shadowColor: '#F59E0B', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10 
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 28, textAlign: 'center' },
  dotsContainer: { flexDirection: 'row', gap: 16, marginBottom: 36 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  dotFilled: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'space-between', rowGap: 16 },
  keyButton: { 
    width: 78, 
    height: 78, 
    borderRadius: 39, 
    backgroundColor: '#111827', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: { color: '#FFFFFF', fontSize: 28, fontWeight: '600' },
  keyAction: { width: 78, height: 78, justifyContent: 'center', alignItems: 'center' },
  keyActionText: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  biometricButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28, 
    backgroundColor: '#1E293B', 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  biometricText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  forgotButton: { marginTop: 18, paddingVertical: 6, paddingHorizontal: 12 },
  forgotText: { color: '#F59E0B', fontSize: 13, fontWeight: '700' },
  footer: { 
    flexDirection: 'row',
    paddingBottom: 24, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },

  // Style Modala Forgot PIN
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(11, 17, 32, 0.85)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: '#111827', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 24, 
    maxHeight: '85%', 
    borderWidth: 1, 
    borderColor: '#1E293B' 
  },
  modalHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  modalTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  modalCloseBtn: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: '#1E293B', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  inputContainerDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  disabledEmailText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  input: { color: '#F8FAFC', fontSize: 14, height: '100%' },
  eyeBtn: { position: 'absolute', right: 14 },
  primaryButton: {
    backgroundColor: '#F59E0B',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: { color: '#0B1120', fontSize: 15, fontWeight: '800' },
  forgotAccountPasswordRow: { marginTop: 16, alignItems: 'center', paddingVertical: 4 },
  forgotAccountPasswordText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
});