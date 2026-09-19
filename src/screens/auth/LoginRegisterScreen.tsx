import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, type Language } from '../../store/authStore';
import { translations } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';

interface LoginRegisterScreenProps {
  onSuccess?: () => void;
  onBack?: () => void;
  initialMode?: 'login' | 'register';
  initialRecoveryUrl?: string;
}

export const LoginRegisterScreen: React.FC<LoginRegisterScreenProps> = ({
  onSuccess,
  onBack,
  initialMode = 'register',
  initialRecoveryUrl,
}) => {
  const { setUser, setLanguage, continueAsGuest, language } = useAuthStore();

  const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);

  useEffect(() => {
    setIsLoginMode(initialMode === 'login');
  }, [initialMode]);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const t = translations[language].loginRegisterScreen;
  const commonT = translations[language].common;
  const welcomeT = translations[language].welcomeScreen;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password OTP modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStage, setForgotStage] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [resetEmail, setResetEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isRecoverySessionActive, setIsRecoverySessionActive] = useState(false);

  const handleDeepLink = async (url: string | null) => {
    if (!url || !url.includes('destivo://')) return;

    try {
      // 1. Obsługa URL z hashem (#access_token=...&refresh_token=...&type=recovery)
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1) {
        const hash = url.substring(hashIndex + 1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          setIsRecoverySessionActive(true);
          setForgotStage('OTP');
          setShowForgotModal(true);
          return;
        }
      }

      // 2. Obsługa URL z parametrami query (?code=...)
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        const query = url.substring(queryIndex + 1).split('#')[0];
        const params = new URLSearchParams(query);
        const code = params.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          setIsRecoverySessionActive(true);
          setForgotStage('OTP');
          setShowForgotModal(true);
        }
      }
    } catch (err) {
      console.warn('Error handling deep link in LoginRegisterScreen:', err);
    }
  };

  useEffect(() => {
    if (initialRecoveryUrl) {
      handleDeepLink(initialRecoveryUrl);
    }
  }, [initialRecoveryUrl]);

  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  const handleLanguageChange = (nextLanguage: Language) => {
    setSelectedLanguage(nextLanguage);
    setLanguage(nextLanguage);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password || (!isLoginMode && (!fullName.trim() || !agreed))) {
      Alert.alert('DESTIVO', t.errors.fieldsRequired);
      return;
    }

    if (!isLoginMode && password.length < 6) {
      Alert.alert('DESTIVO', t.passwordMinLength || 'Hasło musi zawierać co najmniej 6 znaków.');
      return;
    }

    try {
      setLoading(true);

      if (isLoginMode) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          const lowerMsg = (error.message || '').toLowerCase();
          if (lowerMsg.includes('email not confirmed') || lowerMsg.includes('not confirmed')) {
            Alert.alert(
              'DESTIVO',
              t.emailNotConfirmed || 'Twój adres e-mail nie został jeszcze potwierdzony. Sprawdź swoją skrzynkę (oraz folder SPAM) i kliknij link aktywacyjny.',
              [
                { text: commonT.button_cancel || 'Anuluj', style: 'cancel' },
                {
                  text: t.resendVerification || 'Wyślij ponownie link',
                  onPress: async () => {
                    try {
                      await supabase.auth.resend({ type: 'signup', email: email.trim() });
                      Alert.alert('DESTIVO', t.verificationResent || 'Wysłano ponownie e-mail z linkiem aktywacyjnym.');
                    } catch (resendErr: any) {
                      Alert.alert('DESTIVO', resendErr?.message || 'Błąd wysyłania linku.');
                    }
                  },
                },
              ]
            );
            return;
          }
          throw error;
        }

        if (data.user) {
          const resolvedLanguage = (data.user.user_metadata?.language as Language | undefined) ?? selectedLanguage;
          setLanguage(resolvedLanguage);
          setUser({
            id: data.user.id,
            email: data.user.email || email,
            isGuest: false,
            name: data.user.user_metadata?.full_name || undefined,
            language: resolvedLanguage,
          });
          if (onSuccess) onSuccess();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { full_name: fullName, language: selectedLanguage },
          },
        });

        if (error) throw error;

        if (data.user) {
          setLanguage(selectedLanguage);
          setUser({
            id: data.user.id,
            email: data.user.email || email,
            isGuest: false,
            name: fullName,
            language: selectedLanguage,
          });

          if (!data.session) {
            // Wymagana weryfikacja adresu e-mail przez link
            Alert.alert('DESTIVO', t.emailConfirmationSent || 'Konto zostało utworzone! Wysłaliśmy link weryfikacyjny na Twój adres e-mail. Potwierdź adres przed pierwszym logowaniem.');
          } else {
            Alert.alert('DESTIVO', t.accountCreated);
          }
          setIsLoginMode(true);
          setPassword('');
        }
      }
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.toLowerCase().includes('network request failed')) {
        Alert.alert('DESTIVO', t.errors.networkError);
      } else {
        Alert.alert('DESTIVO', error.message || t.errors.signUpFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtpCode = async () => {
    const targetEmail = resetEmail.trim() || email.trim();
    if (!targetEmail) {
      Alert.alert('DESTIVO', t.errors.fieldsRequired);
      return;
    }

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: 'destivo://reset-password',
      });
      if (error) throw error;
      setShowForgotModal(false);
      Alert.alert('DESTIVO', t.resetLinkSent || 'Link do zresetowania hasła został wysłany na Twój adres e-mail. Kliknij go na telefonie, aby ustawić nowe hasło.');
    } catch (err: any) {
      const errorMsg =
        typeof err === 'string'
          ? err
          : err?.message ||
            err?.error_description ||
            err?.msg ||
            (err?.status === 500 ? 'Błąd serwera pocztowego (500). Sprawdź konfigurację SMTP w Supabase.' : 'Błąd wysyłania kodu.');
      Alert.alert('DESTIVO', errorMsg);
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOtpAndSetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('DESTIVO', t.passwordMinLength || 'Hasło musi zawierać co najmniej 6 znaków.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('DESTIVO', t.passwordsDoNotMatch || 'Wprowadzone hasła nie są identyczne.');
      return;
    }

    try {
      setResetLoading(true);

      // Aktualizujemy hasło zalogowanej sesji recovery
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      // Sukces - zamykamy modal i czyścimy formularz
      setShowForgotModal(false);
      setForgotStage('EMAIL');
      setIsRecoverySessionActive(false);
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setIsLoginMode(true);
      Alert.alert('DESTIVO', t.passwordResetSuccess || 'Hasło zostało pomyślnie zmienione! Możesz się teraz zalogować nowym hasłem.');
    } catch (err: any) {
      Alert.alert('DESTIVO', err.message || 'Błąd zapisu nowego hasła.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              activeOpacity={0.7}
              testID="back-button"
            >
              <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          <View style={styles.languageSelector}>
            <TouchableOpacity
              onPress={() => handleLanguageChange('pl')}
              style={[styles.languageOption, selectedLanguage === 'pl' && styles.languageOptionActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.languageOptionText, selectedLanguage === 'pl' && styles.languageOptionTextActive]}>PL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleLanguageChange('en')}
              style={[styles.languageOption, selectedLanguage === 'en' && styles.languageOptionActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.languageOptionText, selectedLanguage === 'en' && styles.languageOptionTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>

          {/* Nagłówek z Logo i podtytułem ze słownika */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/logo/NapisKropkaBialy.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>{t.title}</Text>
            <Text style={styles.desc}>{t.subtitle}</Text>
          </View>

          {/* Karta Sejfu (Formularz) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {isLoginMode ? t.loginToAccount : t.createAccount}
            </Text>
            <Text style={styles.cardSubtitle}>{t.joinNetwork}</Text>

            {/* Imię i nazwisko (widoczne tylko przy rejestracji) */}
            {!isLoginMode && (
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{t.fullName}</Text>
                  <Text style={styles.labelBadge}>{t.required}</Text>
                </View>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.input}
                    placeholder={t.fullNamePlaceholder}
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>
            )}

            {/* E-mail */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t.email}</Text>
                <Text style={styles.labelBadge}>{t.secureData}</Text>
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder={t.emailPlaceholder}
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            {/* Hasło */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t.password}</Text>
                <Ionicons name="lock-closed-outline" size={12} color="#94A3B8" />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { flex: 1, paddingRight: 40 }]}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                  testID="toggle-password-visibility"
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Zapomniałeś hasła? (tylko w trybie logowania) */}
            {isLoginMode && (
              <TouchableOpacity
                style={styles.forgotPasswordRow}
                onPress={() => {
                  setResetEmail(email);
                  setForgotStage('EMAIL');
                  setOtpCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowForgotModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotPasswordText}>{t.forgotPassword}</Text>
              </TouchableOpacity>
            )}

            {/* Checkbox regulaminu (tylko przy rejestracji) */}
            {!isLoginMode && (
              <TouchableOpacity
                style={styles.checkboxRow}
                activeOpacity={0.8}
                onPress={() => setAgreed(!agreed)}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed && <Ionicons name="checkmark" size={14} color="#0B1120" />}
                </View>
                <Text style={styles.termsText}>{t.agreeTerms}</Text>
              </TouchableOpacity>
            )}

            {/* Główny przycisk akcji */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#0B1120" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isLoginMode ? t.loginButton : t.createAccountBtn} ➔
                </Text>
              )}
            </TouchableOpacity>

            {/* Przełącznik między trybem logowania a rejestracji */}
            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => setIsLoginMode(!isLoginMode)}
            >
              <Text style={styles.footerText}>
                {isLoginMode ? t.noAccountYet : t.alreadyDeployed}{' '}
                <Text style={styles.footerLink}>
                  {isLoginMode ? t.createOne : t.loginToAccount}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Opcja wejścia jako gość ze słownika welcomeScreen */}
          <TouchableOpacity
            style={styles.guestButton}
            onPress={continueAsGuest}
            activeOpacity={0.6}
          >
            <Text style={styles.guestButtonText}>{welcomeT.button_continueAsGuest}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal resetowania hasła (Forgot Password) */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {forgotStage === 'EMAIL' ? t.forgotPasswordTitle : (t.setNewPasswordTitle || 'Ustaw nowe hasło')}
              </Text>
              <TouchableOpacity
                onPress={() => setShowForgotModal(false)}
                style={styles.modalCloseBtn}
                testID="modal-close-button"
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {forgotStage === 'EMAIL' ? (
              <>
                <Text style={styles.modalDesc}>{t.forgotPasswordDesc}</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.input}
                    placeholder={t.emailPlaceholder}
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 16 }, resetLoading && { opacity: 0.7 }]}
                  onPress={handleSendOtpCode}
                  disabled={resetLoading}
                  activeOpacity={0.8}
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#0B1120" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t.sendResetLink} ➔</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalDesc}>
                  {t.setNewPasswordDesc || 'Wprowadź nowe hasło do swojego konta Destivo.'}
                </Text>

                {/* Nowe hasło */}
                <View style={[styles.inputGroup, { marginTop: 6 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>{t.newPasswordLabel || 'NOWE HASŁO'}</Text>
                    <Ionicons name="lock-closed-outline" size={12} color="#94A3B8" />
                  </View>
                  <View style={styles.inputContainer}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 1, paddingRight: 40 }]}
                      placeholder={t.newPasswordPlaceholder || 'Nowe hasło (min. 6 znaków)'}
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showNewPassword}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      testID="new-password-input"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                      testID="toggle-new-password-visibility"
                    >
                      <Ionicons
                        name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Powtórz nowe hasło */}
                <View style={[styles.inputGroup, { marginTop: 6 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>{t.confirmPasswordLabel || 'POWTÓRZ NOWE HASŁO'}</Text>
                    <Ionicons name="checkmark" size={12} color="#94A3B8" />
                  </View>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={styles.input}
                      placeholder={t.confirmPasswordPlaceholder || 'Powtórz nowe hasło'}
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showNewPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      testID="confirm-password-input"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 14 }, resetLoading && { opacity: 0.7 }]}
                  onPress={handleVerifyOtpAndSetPassword}
                  disabled={resetLoading}
                  activeOpacity={0.8}
                  testID="submit-new-password-btn"
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#0B1120" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t.setNewPasswordBtn || 'Ustaw nowe hasło'} ➔</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 12, alignItems: 'center' }}
                  onPress={() => setForgotStage('EMAIL')}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600' }}>
                    {t.backToEmailStage || '← Zmień e-mail / Wyślij ponownie'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};







//STYLE
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 5,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  backButtonText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  languageSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 4,
    marginBottom: 10,
    width: 120,
  },
  languageOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 8,
  },
  languageOptionActive: {
    backgroundColor: '#F59E0B',
  },
  languageOptionText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 12,
  },
  languageOptionTextActive: {
    color: '#0B1120',
  },
  header: {
    alignItems: 'center',
    marginVertical: 15,
  },
  logo: {
    width: 140,
    height: 50,
    marginBottom: 8,
  },
  subtitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  desc: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 10,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: '#F59E0B', // Bursztynowy akcent sieci odkrywców
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 4,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  labelBadge: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
    color: '#94A3B8',
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1120',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  checkboxTick: {
    color: '#0B1120',
    fontSize: 12,
    fontWeight: 'bold',
  },
  termsText: {
    color: '#CBD5E1',
    fontSize: 11,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#F59E0B', // Bursztynowy przycisk z Twojego designu
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#0B1120',
    fontSize: 15,
    fontWeight: 'bold',
  },
  footerRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  footerLink: {
    color: '#F59E0B',
    fontWeight: 'bold',
  },
  guestButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  guestButtonText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  eyeBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotPasswordRow: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
});