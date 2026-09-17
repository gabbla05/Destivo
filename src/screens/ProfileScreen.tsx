// src/screens/ProfileScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, type Language } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { translations } from '../i18n/translations';
import { usePowerSync } from '@powersync/react-native';

export const ProfileScreen = ({ navigation }: any) => {
  const { user, language, setLanguage, logout } = useAuthStore();
  const db = usePowerSync();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const t = translations[language].profile;
  const commonT = translations[language].common;

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
  };

  const handleLogout = async () => {
    Alert.alert(
      t.logoutTitle,
      t.logoutMessage,
      [
        { text: t.cancel, style: "cancel" },
        { 
          text: t.logoutConfirm, 
          style: "destructive", 
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              
              // Odłączamy PowerSync, by przerwać synchronizację w tle
              await db.disconnectAndClear(); 
              
              // Zabijamy sesję w Supabase
              await supabase.auth.signOut();
              
              // Czyścimy stan lokalny (powrót do Welcome Screen)
              logout();
            } catch (error) {
              Alert.alert(commonT.label_error, t.logoutError);
            } finally {
              setIsLoggingOut(false);
            }
          } 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.title}</Text>
      </View>

      <View style={styles.content}>
        
        {/* KARTA UŻYTKOWNIKA */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name.charAt(0).toUpperCase() : '👤'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || t.userFallback}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            
            <View style={styles.syncBadge}>
              <Ionicons name="cloud-done" size={12} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.syncText}>{t.synced}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t.appSettings}</Text>

        {/* USTAWIENIA: JĘZYK */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={styles.iconBox}>
              <Ionicons name="language" size={20} color="#38BDF8" />
            </View>
            <Text style={styles.settingLabel}>{t.language}</Text>
          </View>
          
          <View style={styles.languageSelector}>
            <TouchableOpacity
              onPress={() => handleLanguageChange('pl')}
              style={[styles.langOption, language === 'pl' && styles.langOptionActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.langText, language === 'pl' && styles.langTextActive]}>PL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleLanguageChange('en')}
              style={[styles.langOption, language === 'en' && styles.langOptionActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* USTAWIENIA: SEJF OFFLINE */}
        <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => navigation.navigate('Vault')}>
          <View style={styles.settingLeft}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.settingLabel}>{t.vault}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#475569" />
        </TouchableOpacity>

        {/* USTAWIENIA: BEZPIECZEŃSTWO */}
        <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => navigation.navigate('AccountSecurity')}>
          <View style={styles.settingLeft}>
            <View style={styles.iconBox}>
              <Ionicons name="person" size={20} color="#94A3B8" />
            </View>
            <Text style={styles.settingLabel}>{t.accountPrivacy}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#475569" />
        </TouchableOpacity>

      </View>

      {/* WYLOGOWANIE */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          disabled={isLoggingOut}
          activeOpacity={0.8}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#F87171" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color="#F87171" style={{ marginRight: 8 }} />
              <Text style={styles.logoutText}>{t.logout}</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.versionText}>{t.version}</Text>
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { padding: 20, paddingBottom: 10 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  
  content: { flex: 1, padding: 20 },
  
  userCard: { 
    flexDirection: 'row', 
    backgroundColor: '#111827', 
    padding: 20, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#1E293B',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC' },
  userInfo: { flex: 1 },
  userName: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  userEmail: { color: '#94A3B8', fontSize: 13, fontWeight: '500', marginBottom: 8 },
  
  syncBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)' },
  syncText: { color: '#10B981', fontSize: 10, fontWeight: '700' },

  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16, paddingLeft: 4 },
  
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111827', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E293B' },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  settingLabel: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
  
  languageSelector: { flexDirection: 'row', backgroundColor: '#0B1120', borderRadius: 999, borderWidth: 1, borderColor: '#334155', padding: 4, width: 100 },
  langOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 6 },
  langOptionActive: { backgroundColor: '#F59E0B' },
  langText: { color: '#94A3B8', fontWeight: '700', fontSize: 11 },
  langTextActive: { color: '#0B1120' },

  footer: { padding: 24, alignItems: 'center' },
  logoutButton: { flexDirection: 'row', backgroundColor: 'rgba(239, 68, 68, 0.1)', width: '100%', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoutText: { color: '#F87171', fontSize: 15, fontWeight: '700' },
  versionText: { color: '#475569', fontSize: 11, fontWeight: '600' }
});