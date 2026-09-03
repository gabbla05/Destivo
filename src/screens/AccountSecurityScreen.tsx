// src/screens/AccountSecurityScreen.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { usePowerSync } from '@powersync/react-native';

export const AccountSecurityScreen = ({ navigation }: any) => {
  const { user, logout } = useAuthStore();
  const db = usePowerSync();
  const [loading, setLoading] = useState(false);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      Alert.alert('Sukces', 'Na Twój adres e-mail wysłano link do zresetowania hasła.');
    } catch (e: any) {
      Alert.alert('Błąd', e.message || 'Nie udało się wysłać linku.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Usunięcie konta',
      'Czy na pewno chcesz bezpowrotnie usunąć swoje konto oraz wszystkie zapisane podróże z chmury? Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        { 
          text: 'Usuń konto', 
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
                Alert.alert('Błąd', 'Wystąpił problem podczas usuwania konta.');
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
        <Text style={styles.headerTitle}>Konto i prywatność</Text>
      </View>

      <ScrollView style={styles.content}>
        
        {/* ZARZĄDZANIE KONTEM */}
        <Text style={styles.sectionTitle}>ZARZĄDZANIE KONTEM</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handlePasswordReset} disabled={loading}>
            <View style={styles.rowLeft}>
              <Ionicons name="key-outline" size={20} color="#38BDF8" style={styles.icon} />
              <Text style={styles.rowText}>Zresetuj hasło</Text>
            </View>
            {loading ? <ActivityIndicator color="#38BDF8" /> : <Ionicons name="chevron-forward" size={20} color="#475569" />}
          </TouchableOpacity>
        </View>

        {/* PRYWATNOŚĆ I DANE */}
        <Text style={styles.sectionTitle}>PRYWATNOŚĆ I DANE</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.borderBottom]} onPress={() => Alert.alert('Polityka Prywatności', 'Dane są szyfrowane end-to-end w module Sejfu. Podróże są synchronizowane z zewnętrzną chmurą Supabase.')}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color="#10B981" style={styles.icon} />
              <Text style={styles.rowText}>Polityka prywatności</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Dane', 'Aby wyeksportować dane, skontaktuj się z administratorem.')}>
            <View style={styles.rowLeft}>
              <Ionicons name="download-outline" size={20} color="#F59E0B" style={styles.icon} />
              <Text style={styles.rowText}>Eksportuj moje dane</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* DANGER ZONE */}
        <Text style={[styles.sectionTitle, { color: '#EF4444', marginTop: 24 }]}>STREFA NIEBEZPIECZNA</Text>
        <View style={[styles.card, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" style={styles.icon} />
              <Text style={[styles.rowText, { color: '#EF4444' }]}>Usuń konto bezpowrotnie</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { marginRight: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  content: { flex: 1, padding: 20 },
  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4 },
  card: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 24, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 12 },
  rowText: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
});