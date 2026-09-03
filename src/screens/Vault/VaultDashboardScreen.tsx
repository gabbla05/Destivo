import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVaultStore } from '../../store/vaultStore';
import { usePowerSync } from '@powersync/react-native';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { VaultManager } from '../../lib/vaultManager';
import * as Sharing from 'expo-sharing';

export const VaultDashboardScreen = ({ route, navigation }: any) => {
  const { lockVault } = useVaultStore();
  const { user } = useAuthStore();
  const db = usePowerSync();
  const initialTripId = route?.params?.tripId;

  const [trips, setTrips] = useState<any[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Pobieranie wycieczek i plików
  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    try {
      const userId = user?.id || 'guest';
      const result = await db.execute(`SELECT * FROM trips WHERE user_id = ? ORDER BY start_date DESC`, [userId]);
      const rows = (((result as any)?.array?.length > 0
        ? (result as any).array
        : (result as any)?.rows?._array || (result as any)?.rows || [])) as any[];
      setTrips(rows);

      // Jeśli weszliśmy bezpośrednio z Ekranu Głównego (aktywna podróż)
      if (initialTripId) {
        const trip = rows.find(t => t.id === initialTripId);
        if (trip) setSelectedTrip(trip);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Zapis pliku do bazy (Dual-Write)
  const handleAddFile = async (method: 'DOC' | 'IMAGE') => {
    if (!selectedTrip) return;
    
    const fileData = method === 'DOC' ? await VaultManager.pickFile() : await VaultManager.pickImage();
    if (!fileData) return;

    try {
      const isUserGuest = user?.isGuest || !user;
      const lodgingData = JSON.parse(selectedTrip.lodging_data || '{}');
      const currentFiles = lodgingData.vaultFiles || [];
      const updatedFiles = [fileData, ...currentFiles];
      
      const newLodgingData = JSON.stringify({ ...lodgingData, vaultFiles: updatedFiles });

      // Zapis lokalny
      await db.execute('UPDATE trips SET lodging_data = ? WHERE id = ?', [newLodgingData, selectedTrip.id]);

      // Zapis do chmury
      if (!isUserGuest) {
        await supabase.from('trips').update({ lodging_data: newLodgingData }).eq('id', selectedTrip.id);
      }

      Alert.alert('Zabezpieczono', 'Plik został pomyślnie dodany do Szufladki Sejfu.');
      
      // Aktualizacja widoku
      setSelectedTrip({ ...selectedTrip, lodging_data: newLodgingData });
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', 'Nie udało się zapisać pliku w sejfie.');
    }
  };

  // Otwieranie zapisanego pliku
  const handleOpenFile = async (uri: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Błąd', 'Brak aplikacji zdolnej do otwarcia tego pliku na tym urządzeniu.');
      }
    } catch (e) {
      Alert.alert('Błąd odczytu', 'Nie można otworzyć pliku. Prawdopodobnie został usunięty z pamięci.');
    }
  };

  const getFilesForSelectedTrip = () => {
    if (!selectedTrip) return [];
    const lodgingData = JSON.parse(selectedTrip.lodging_data || '{}');
    return lodgingData.vaultFiles || [];
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {selectedTrip && (
            <TouchableOpacity onPress={() => setSelectedTrip(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{selectedTrip ? 'Zabezpieczone Pliki' : 'Szufladki Sejfu'}</Text>
        </View>
        <TouchableOpacity style={styles.lockBtn} onPress={lockVault}>
          <Ionicons name="lock-closed" size={14} color="#F87171" style={{ marginRight: 6 }} />
          <Text style={styles.lockBtnText}>ZABLOKUJ</Text>
        </TouchableOpacity>
      </View>

      {/* GŁÓWNA ZAWARTOŚĆ */}
      {loading ? (
        <View style={styles.centerBox}><ActivityIndicator color="#F59E0B" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* WIDOK FOLDERÓW (WSZYSTKIE PODRÓŻE) */}
          {!selectedTrip ? (
            <View style={styles.grid}>
              {trips.length === 0 && <Text style={styles.emptyText}>Brak zaplanowanych podróży.</Text>}
              {trips.map(trip => (
                <TouchableOpacity key={trip.id} style={styles.folderCard} activeOpacity={0.8} onPress={() => setSelectedTrip(trip)}>
                  <Ionicons name="folder" size={48} color="#38BDF8" style={{ marginBottom: 12 }} />
                  <Text style={styles.folderTitle} numberOfLines={2}>{trip.trip_name}</Text>
                  <Text style={styles.folderSub}>{trip.start_date}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (

          /* WIDOK PLIKÓW DLA KONKRETNEJ PODRÓŻY */
            <View>
              <Text style={styles.tripTitleLabel}>SZUFLADKA PODRÓŻY:</Text>
              <Text style={styles.tripTitle}>{selectedTrip.trip_name}</Text>
              
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => handleAddFile('DOC')}>
                  <Ionicons name="document-text" size={20} color="#0B1120" style={{ marginRight: 8 }} />
                  <Text style={styles.addBtnText}>Wgraj plik (PDF)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => handleAddFile('IMAGE')}>
                  <Ionicons name="image" size={20} color="#0B1120" style={{ marginRight: 8 }} />
                  <Text style={styles.addBtnText}>Dodaj ze zdjęć</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filesList}>
                {getFilesForSelectedTrip().length === 0 && (
                  <View style={styles.emptyBox}>
                    <Ionicons name="shield-checkmark-outline" size={40} color="#334155" style={{ marginBottom: 12 }} />
                    <Text style={styles.emptyText}>Ten sejf jest pusty.</Text>
                    <Text style={styles.emptySub}>Wgraj tu bilety i rezerwacje, aby mieć do nich bezpieczny dostęp offline w trakcie podróży.</Text>
                  </View>
                )}

                {getFilesForSelectedTrip().map((file: any) => (
                  <TouchableOpacity key={file.id} style={styles.fileCard} activeOpacity={0.8} onPress={() => handleOpenFile(file.uri)}>
                    <View style={styles.fileIconBox}>
                      <Ionicons name={file.type === 'PDF' ? "document-text" : "image"} size={24} color="#F59E0B" />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileType}>{file.type} • Wgrano lokalnie</Text>
                    </View>
                    <Ionicons name="open-outline" size={20} color="#64748B" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B19' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderColor: '#1E293B', backgroundColor: '#0B1120' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 16, padding: 4 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  lockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  lockBtnText: { color: '#F87171', fontSize: 12, fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  folderCard: { width: '47%', backgroundColor: '#111827', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  folderTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  folderSub: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  
  tripTitleLabel: { color: '#F59E0B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  tripTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginBottom: 24 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  addBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#F59E0B', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  addBtnText: { color: '#0B1120', fontSize: 13, fontWeight: '800' },
  
  filesList: { gap: 12 },
  fileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  fileIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  fileInfo: { flex: 1, marginRight: 12 },
  fileName: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  fileType: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 16, borderWidth: 1, borderColor: '#1E293B', borderStyle: 'dashed' },
  emptyText: { color: '#CBD5E1', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#64748B', fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },
});