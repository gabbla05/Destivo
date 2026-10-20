import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useVaultStore } from '../store/vaultStore';
import { translations } from '../i18n/translations';
import { usePowerSync } from '@powersync/react-native';

export const AccountSecurityScreen = ({ navigation }: any) => {
  const { user, language, logout } = useAuthStore();
  const t = translations[language].accountSecurity;
  const commonT = translations[language].common;
  const db = usePowerSync();
  const [loading, setLoading] = useState(false);

  // Stan weryfikacji hasła przed resetem PIN-u Sejfu
  const [showPinModal, setShowPinModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'destivo://reset-password',
      });
      if (error) throw error;
      Alert.alert(t.successTitle, t.resetSuccess);
    } catch (e: any) {
      Alert.alert(t.errorTitle, e.message || t.resetError);
    } finally {
      setLoading(false);
    }
  };

  const handleResetVaultPin = () => {
    const isGuest = !user?.email || user?.isGuest;
    if (isGuest) {
      Alert.alert(
        t.resetVaultPinTitle,
        t.guestPinResetNotice || t.resetVaultPinConfirm,
        [
          { text: commonT.cancel, style: 'cancel' },
          { 
            text: t.resetVaultPinBtn, 
            style: 'destructive',
            onPress: () => {
              useVaultStore.setState({ pin: null, isUnlocked: false });
              Alert.alert(t.successTitle, t.vaultPinResetDone);
            }
          }
        ]
      );
      return;
    }

    // Użytkownik zalogowany - wymagamy hasła do konta
    setPasswordInput('');
    setShowPassword(false);
    setShowPinModal(true);
  };

  const handleConfirmPinResetWithPassword = async () => {
    if (!passwordInput.trim()) {
      Alert.alert(t.errorTitle, t.passwordPlaceholder || 'Wpisz hasło do konta');
      return;
    }

    try {
      setVerifyingPassword(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: passwordInput,
      });

      if (error) {
        Alert.alert(t.errorTitle, t.wrongPassword || 'Nieprawidłowe hasło do konta.');
        return;
      }

      // Hasło prawidłowe - resetujemy PIN do sejfu
      useVaultStore.setState({ pin: null, isUnlocked: false });
      setShowPinModal(false);
      setPasswordInput('');
      Alert.alert(t.successTitle, t.vaultPinResetDone);
    } catch (e: any) {
      Alert.alert(t.errorTitle, e.message || t.wrongPassword || 'Błąd weryfikacji hasła.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t.deleteTitle,
      t.deleteMessage,
      [
        { text: commonT.cancel, style: 'cancel' },
        { 
          text: t.deleteConfirm, 
          style: 'destructive',
          onPress: async () => {
             try {
                // 1. Usuwamy wszystkie podróże użytkownika z chmury Supabase
                await supabase.from('trips').delete().eq('user_id', user?.id);
                // 2. Czyścimy lokalną bazę PowerSync
                await db.disconnectAndClear();
                // 3. Wylogowujemy z Supabase
                await supabase.auth.signOut();
                // 4. Usuwamy stan w aplikacji i wracamy do ekranu startowego
                logout();
             } catch (e) {
                Alert.alert(t.errorTitle, t.deleteError);
             }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
      </View>

      <ScrollView style={styles.content}>
        
        {/* ZARZĄDZANIE KONTEM */}
        <Text style={styles.sectionTitle}>{t.accountManagement}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.borderBottom]} onPress={handlePasswordReset} disabled={loading}>
            <View style={styles.rowLeft}>
              <Ionicons name="key-outline" size={20} color="#38BDF8" style={styles.icon} />
              <Text style={styles.rowText}>{t.resetPassword}</Text>
            </View>
            {loading ? <ActivityIndicator color="#38BDF8" /> : <Ionicons name="chevron-forward" size={20} color="#94A3B8" />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleResetVaultPin} testID="reset-vault-pin-row">
            <View style={styles.rowLeft}>
              <Ionicons name="shield-outline" size={20} color="#F59E0B" style={styles.icon} />
              <Text style={styles.rowText}>{t.resetVaultPin}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* PRYWATNOŚĆ I DANE */}
        <Text style={styles.sectionTitle}>{t.privacyData}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => Alert.alert(t.privacyPolicy, t.privacyText)}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color="#10B981" style={styles.icon} />
              <Text style={styles.rowText}>{t.privacyPolicy}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* DANGER ZONE */}
        <Text style={[styles.sectionTitle, { color: '#EF4444', marginTop: 24 }]}>{t.danger}</Text>
        <View style={[styles.card, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" style={styles.icon} />
              <Text style={[styles.rowText, { color: '#EF4444' }]}>{t.deleteAccount}</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Modal weryfikacji hasła przed resetem PIN-u Sejfu */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="shield-outline" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.modalTitle}>{t.pinResetPasswordRequired || 'Weryfikacja hasła'}</Text>
            </View>

            <Text style={styles.modalDesc}>
              {t.pinResetModalDesc || 'Aby zresetować kod PIN do Sejfu, potwierdź swoją tożsamość wpisując hasło do konta Destivo.'}
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.modalInput}
                placeholder={t.passwordPlaceholder || 'Hasło do konta'}
                placeholderTextColor="#64748B"
                secureTextEntry={!showPassword}
                value={passwordInput}
                onChangeText={setPasswordInput}
                autoCapitalize="none"
                testID="vault-reset-password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowPinModal(false)}
                disabled={verifyingPassword}
              >
                <Text style={styles.modalCancelText}>{commonT.cancel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, verifyingPassword && { opacity: 0.7 }]}
                onPress={handleConfirmPinResetWithPassword}
                disabled={verifyingPassword}
                testID="vault-confirm-reset-btn"
              >
                {verifyingPassword ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t.confirmAndReset || 'Potwierdź i zresetuj'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { marginRight: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  content: { flex: 1, padding: 20 },
  sectionTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4 },
  card: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 24, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 12 },
  rowText: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },

  // Modal stylings
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: '#1E293B', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#334155' },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  modalTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  modalDesc: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, height: 48, marginBottom: 20 },
  modalInput: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { color: '#E2E8F0', fontSize: 14, fontWeight: '700' },
  modalConfirmBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  modalConfirmText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
});
