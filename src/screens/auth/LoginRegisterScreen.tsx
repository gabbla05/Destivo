import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { translations, Language } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';

interface LoginRegisterScreenProps {
  onSuccess?: () => void;
}

export const LoginRegisterScreen: React.FC<LoginRegisterScreenProps> = ({ onSuccess }) => {
  const { setUser, continueAsGuest } = useAuthStore();
  
  // Lokalny stan języka (możesz też przenieść do store, jeśli chcesz spójności w całej apce)
  const [lang, setLang] = useState<Language>('pl');
  const [isLoginMode, setIsLoginMode] = useState(false); // false = Rejestracja, true = Logowanie

  const t = translations[lang].loginRegisterScreen;
  const commonT = translations[lang].common;
  const welcomeT = translations[lang].welcomeScreen;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'pl' ? 'en' : 'pl'));
  };

  const handleSubmit = async () => {
    if (!email || !password || (!isLoginMode && (!fullName || !agreed))) {
      Alert.alert('DESTIVO', t.errors.fieldsRequired);
      return;
    }

    try {
      setLoading(true);

      if (isLoginMode) {
        // Logowanie przez Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || email,
            isGuest: false,
          });
          if (onSuccess) onSuccess();
        }
      } else {
        // Rejestracja przez Supabase
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { full_name: fullName },
          },
        });

        if (error) throw error;

        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || email,
            isGuest: false,
          });
          Alert.alert('DESTIVO', 'Konto zostało utworzone!');
          if (onSuccess) onSuccess();
        }
      }
    } catch (error: any) {
      Alert.alert('DESTIVO', error.message || t.errors.signUpFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
          
          {/* Górny pasek: Przełącznik języka */}
          <View style={{ width: '100%' }} />
          <View style={styles.topBar}>
            <TouchableOpacity onPress={toggleLanguage} style={styles.langButton} activeOpacity={0.7}>
              <Text style={styles.langText}>
                {welcomeT.button_languageSwitchLabel}
              </Text>
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
                  <Text style={styles.inputIcon}>👤</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t.fullNamePlaceholder}
                    placeholderTextColor="#475569"
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
                <Text style={styles.inputIcon}>@</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t.emailPlaceholder}
                  placeholderTextColor="#475569"
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
                <Text style={styles.labelBadge}>🔒</Text>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>🛡️</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor="#475569"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
            </View>

            {/* Checkbox regulaminu (tylko przy rejestracji) */}
            {!isLoginMode && (
              <TouchableOpacity
                style={styles.checkboxRow}
                activeOpacity={0.8}
                onPress={() => setAgreed(!agreed)}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed && <Text style={styles.checkboxTick}>✓</Text>}
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
                {isLoginMode ? 'NIE MASZ KONTA?' : t.alreadyDeployed}{' '}
                <Text style={styles.footerLink}>
                  {isLoginMode ? 'UTWÓRZ JE' : t.loginToAccount}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    marginBottom: 5,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  langText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 12,
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
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  labelBadge: {
    color: '#64748B',
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
    color: '#64748B',
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
    color: '#94A3B8',
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
    color: '#64748B',
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
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
});