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
import { VaultManager } from '../lib/vaultManager';
import { translations } from '../i18n/translations';
import { usePowerSync } from '@powersync/react-native';
import { wipeLocalUserData } from '../lib/localDataWipe';

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
  const [passwordAction, setPasswordAction] = useState<'resetPin' | 'deleteAccount'>('resetPin');
  const [deletingData, setDeletingData] = useState(false);
  const isGuestUser = !user?.email || Boolean(user?.isGuest);

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
            onPress: async () => {
              // Gość nie ma hasła do potwierdzenia tożsamości - reset PIN-u niszczy zawartość Sejfu
              await VaultManager.wipeVault();
              await useVaultStore.getState().resetPin();
              Alert.alert(t.successTitle, t.vaultPinResetDone);
            }
          }
        ]
      );
      return;
    }

    // Użytkownik zalogowany - wymagamy hasła do konta
    openPasswordModal('resetPin');
  };

  const openPasswordModal = (action: 'resetPin' | 'deleteAccount') => {
    setPasswordAction(action);
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

      if (passwordAction === 'deleteAccount') {
        await deleteAccountAfterPasswordCheck();
        return;
      }

      // Hasło prawidłowe - resetujemy PIN do sejfu
      await useVaultStore.getState().resetPin();
      setShowPinModal(false);
      setPasswordInput('');
      Alert.alert(t.successTitle, t.vaultPinResetDone);
    } catch (e: any) {
      Alert.alert(t.errorTitle, e.message || t.wrongPassword || 'Błąd weryfikacji hasła.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  /**
   * "Usuń moje dane": podróże w chmurze i wszystkie dane na telefonie. Konto zostaje.
   * Dane lokalne czyścimy dopiero po potwierdzeniu, że usunięcie w chmurze się udało.
   */
  const handleDeleteData = () => {
    Alert.alert(t.deleteDataTitle, isGuestUser ? t.deleteDataGuestMessage : t.deleteDataMessage, [
      { text: commonT.cancel, style: 'cancel' },
      {
        text: t.deleteDataConfirm,
        style: 'destructive',
        onPress: async () => {
          setDeletingData(true);
          try {
            if (!isGuestUser) {
              const { error } = await supabase.from('trips').delete().eq('user_id', user?.id);
              if (error) throw error;
            }
          } catch (e) {
            setDeletingData(false);
            Alert.alert(t.errorTitle, t.deleteDataError);
            return;
          }

          try {
            await wipeLocalUserData(db);
            Alert.alert(t.successTitle, t.deleteDataDone);
          } catch (e) {
            Alert.alert(t.errorTitle, t.deleteDataLocalError);
          } finally {
            setDeletingData(false);
          }
        },
      },
    ]);
  };

  /** "Usuń konto": najpierw ostrzeżenie, potem hasło (modal), potem Edge Function. */
  const handleDeleteAccount = () => {
    Alert.alert(t.deleteTitle, t.deleteMessage, [
      { text: commonT.cancel, style: 'cancel' },
      { text: t.deleteConfirm, style: 'destructive', onPress: () => openPasswordModal('deleteAccount') },
    ]);
  };

  const deleteAccountAfterPasswordCheck = async () => {
    // 1. Konto i dane w chmurze usuwa Edge Function (klucz service_role jest tylko na serwerze).
    //    Przy błędzie NIE wylogowujemy i niczego nie usuwamy lokalnie.
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error || !data?.deleted) throw error || new Error('delete-account failed');
    } catch (e) {
      console.warn('Usuwanie konta nie powiodło się:', e);
      Alert.alert(t.errorTitle, t.deleteError);
      return;
    }

    // 2. Konto już nie istnieje - czyścimy telefon i wylogowujemy (błędy sprzątania nie blokują wylogowania)
    setShowPinModal(false);
    setPasswordInput('');
    await wipeLocalUserData(db).catch((e) => console.warn('Czyszczenie danych po usunięciu konta:', e));
    await db.disconnectAndClear().catch(() => undefined);
    await supabase.auth.signOut().catch(() => undefined);
    logout();
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
          <TouchableOpacity
            style={[styles.row, !isGuestUser && styles.borderBottom]}
            onPress={handleDeleteData}
            disabled={deletingData}
            testID="delete-data-row"
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trash-bin-outline" size={20} color="#F97316" style={styles.icon} />
              <Text style={[styles.rowText, { color: '#F97316' }]}>{t.deleteData}</Text>
            </View>
            {deletingData ? <ActivityIndicator color="#F97316" /> : null}
          </TouchableOpacity>

          {!isGuestUser && (
            <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} testID="delete-account-row">
              <View style={styles.rowLeft}>
                <Ionicons name="person-remove-outline" size={20} color="#EF4444" style={styles.icon} />
                <Text style={[styles.rowText, { color: '#EF4444' }]}>{t.deleteAccount}</Text>
              </View>
            </TouchableOpacity>
          )}
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
                <Ionicons
                  name={passwordAction === 'deleteAccount' ? 'person-remove-outline' : 'shield-outline'}
                  size={24}
                  color={passwordAction === 'deleteAccount' ? '#EF4444' : '#F59E0B'}
                />
              </View>
              <Text style={styles.modalTitle}>
                {passwordAction === 'deleteAccount'
                  ? t.deleteAccountPasswordTitle
                  : t.pinResetPasswordRequired || 'Weryfikacja hasła'}
              </Text>
            </View>

            <Text style={styles.modalDesc}>
              {passwordAction === 'deleteAccount'
                ? t.deleteAccountPasswordDesc
                : t.pinResetModalDesc || 'Aby zresetować kod PIN do Sejfu, potwierdź swoją tożsamość wpisując hasło do konta Destivo.'}
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
                style={[
                  styles.modalConfirmBtn,
                  passwordAction === 'deleteAccount' && { backgroundColor: '#EF4444' },
                  verifyingPassword && { opacity: 0.7 },
                ]}
                onPress={handleConfirmPinResetWithPassword}
                disabled={verifyingPassword}
                testID="vault-confirm-reset-btn"
              >
                {verifyingPassword ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {passwordAction === 'deleteAccount'
                      ? t.deleteAccountPasswordBtn
                      : t.confirmAndReset || 'Potwierdź i zresetuj'}
                  </Text>
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
