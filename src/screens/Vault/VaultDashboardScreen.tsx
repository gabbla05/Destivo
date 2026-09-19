import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVaultStore } from '../../store/vaultStore';
import { usePowerSync } from '@powersync/react-native';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { VaultManager } from '../../lib/vaultManager';
import { translations } from '../../i18n/translations';
import * as Sharing from 'expo-sharing';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const VaultDashboardScreen = ({ route, navigation }: any) => {
  const { lockVault } = useVaultStore();
  const { user, language } = useAuthStore();
  const t = translations[language].vault;
  const commonT = translations[language].common;
  const db = usePowerSync();
  const targetTripId = route?.params?.tripId;

  const [trips, setTrips] = useState<any[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Stan podglądu pliku w aplikacji (In-App File Viewer)
  const [previewFile, setPreviewFile] = useState<any | null>(null);

  // Stan modala nadawania / zmiany nazwy pliku
  const [namingModalVisible, setNamingModalVisible] = useState(false);
  const [targetFile, setTargetFile] = useState<any | null>(null);
  const [newFileName, setNewFileName] = useState('');

  const fetchTrips = async () => {
    try {
      const userId = user?.id || 'guest';
      const result = await db.execute(`SELECT * FROM trips WHERE user_id = ? ORDER BY start_date DESC`, [userId]);
      const rows = (((result as any)?.array?.length > 0
        ? (result as any).array
        : (result as any)?.rows?._array || (result as any)?.rows || [])) as any[];
      setTrips(rows);

      const currentTargetId = route?.params?.tripId;
      if (currentTargetId) {
        const trip = rows.find(t => t.id === currentTargetId);
        if (trip) setSelectedTrip(trip);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
    const unsubscribe = navigation?.addListener
      ? navigation.addListener('focus', () => {
          fetchTrips();
        })
      : undefined;
    return unsubscribe;
  }, [navigation, targetTripId, user?.id]);

  useEffect(() => {
    if (targetTripId && trips.length > 0) {
      const trip = trips.find(t => t.id === targetTripId);
      if (trip) setSelectedTrip(trip);
    }
  }, [targetTripId, trips]);

  const updateTripFiles = async (updatedFiles: any[]) => {
    if (!selectedTrip) return;
    const isUserGuest = user?.isGuest || !user;
    const lodgingData = JSON.parse(selectedTrip.lodging_data || '{}');
    const newLodgingData = JSON.stringify({ ...lodgingData, vaultFiles: updatedFiles });

    // Zapis lokalny PowerSync
    await db.execute('UPDATE trips SET lodging_data = ? WHERE id = ?', [newLodgingData, selectedTrip.id]);

    // Zapis do chmury Supabase
    if (!isUserGuest) {
      await supabase.from('trips').update({ lodging_data: newLodgingData }).eq('id', selectedTrip.id);
    }

    setSelectedTrip({ ...selectedTrip, lodging_data: newLodgingData });
  };

  // Zapis pliku do bazy (Dual-Write) oraz otwarcie okna nadania nazwy
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

      // Zapis lokalny PowerSync
      await db.execute('UPDATE trips SET lodging_data = ? WHERE id = ?', [newLodgingData, selectedTrip.id]);

      // Zapis do chmury Supabase
      if (!isUserGuest) {
        await supabase.from('trips').update({ lodging_data: newLodgingData }).eq('id', selectedTrip.id);
      }

      // Aktualizacja widoku
      setSelectedTrip({ ...selectedTrip, lodging_data: newLodgingData });

      // Natychmiastowe otwarcie modala nadawania nazwy
      setTargetFile(fileData);
      setNewFileName(fileData.name);
      setNamingModalVisible(true);
    } catch (error) {
      console.error(error);
      Alert.alert(t.error, t.saveError);
    }
  };

  // Zapisanie nowej nazwy pliku
  const handleSaveFileName = async () => {
    if (!targetFile || !newFileName.trim()) {
      setNamingModalVisible(false);
      return;
    }

    const currentFiles = getFilesForSelectedTrip();
    const extension = targetFile.name.includes('.') ? targetFile.name.split('.').pop() : '';
    let finalName = newFileName.trim();
    if (extension && !finalName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
      finalName = `${finalName}.${extension}`;
    }

    const updated = currentFiles.map((f: any) =>
      f.id === targetFile.id ? { ...f, name: finalName } : f
    );

    await updateTripFiles(updated);
    setNamingModalVisible(false);
    setTargetFile(null);
  };

  // Usunięcie pliku z Sejfu
  const handleDeleteFile = (fileId: string, fileName: string) => {
    Alert.alert(
      t.deleteFileTitle || 'Usuń plik z Sejfu',
      (t.deleteFileConfirm || 'Czy na pewno chcesz usunąć plik "{{name}}"?').replace('{{name}}', fileName),
      [
        { text: commonT.cancel, style: 'cancel' },
        {
          text: commonT.button_delete || 'Usuń',
          style: 'destructive',
          onPress: async () => {
            const currentFiles = getFilesForSelectedTrip();
            const updated = currentFiles.filter((f: any) => f.id !== fileId);
            await updateTripFiles(updated);
            if (previewFile?.id === fileId) setPreviewFile(null);
          },
        },
      ]
    );
  };

  // Otwieranie pliku (In-App Viewer oraz Sharing dla testów/zewnętrznych aplikacji)
  const handleOpenFile = async (file: any) => {
    setPreviewFile(file);
    if (process.env.NODE_ENV === 'test') {
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(file.uri);
        }
      } catch (e) {
        // Ignorujemy błędy w środowisku testowym
      }
    }
  };

  const handleShareExternal = async (uri: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert(t.error, t.unavailable);
      }
    } catch (e) {
      Alert.alert(t.readErrorTitle, t.readError);
    }
  };

  const getFilesForSelectedTrip = () => {
    if (!selectedTrip) return [];
    const lodgingData = JSON.parse(selectedTrip.lodging_data || '{}');
    return lodgingData.vaultFiles || [];
  };

  const isImageFile = (file: any) => {
    if (!file) return false;
    if (file.type === 'IMAGE') return true;
    const uri = (file.uri || file.name || '').toLowerCase();
    return uri.endsWith('.jpg') || uri.endsWith('.jpeg') || uri.endsWith('.png') || uri.endsWith('.webp');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {selectedTrip && (
            <TouchableOpacity onPress={() => setSelectedTrip(null)} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{selectedTrip ? t.files : t.title}</Text>
        </View>
        <TouchableOpacity style={styles.lockBtn} onPress={lockVault} activeOpacity={0.7}>
          <Ionicons name="lock-closed" size={14} color="#F87171" style={{ marginRight: 6 }} />
          <Text style={styles.lockBtnText}>{t.lock}</Text>
        </TouchableOpacity>
      </View>

      {/* GŁÓWNA ZAWARTOŚĆ */}
      {loading ? (
        <View style={styles.centerBox}><ActivityIndicator color="#F59E0B" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* WIDOK FOLDERÓW (WSZYSTKIE PODRÓŻE) */}
          {!selectedTrip ? (
            <View style={styles.grid}>
              {trips.length === 0 && <Text style={styles.emptyText}>{t.emptyTrips}</Text>}
              {trips.map(trip => (
                <TouchableOpacity key={trip.id} style={styles.folderCard} activeOpacity={0.8} onPress={() => setSelectedTrip(trip)}>
                  <Ionicons name="folder" size={44} color="#38BDF8" style={{ marginBottom: 12 }} />
                  <Text style={styles.folderTitle} numberOfLines={2}>{trip.trip_name}</Text>
                  <Text style={styles.folderSub}>{trip.start_date}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (

          /* WIDOK PLIKÓW DLA KONKRETNEJ PODRÓŻY */
            <View>
              <Text style={styles.tripTitleLabel}>{t.folderLabel}</Text>
              <Text style={styles.tripTitle}>{selectedTrip.trip_name}</Text>
              
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => handleAddFile('DOC')}>
                  <Ionicons name="document-text" size={20} color="#0B1120" style={{ marginRight: 8 }} />
                  <Text style={styles.addBtnText}>{t.uploadPdf}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => handleAddFile('IMAGE')}>
                  <Ionicons name="image" size={20} color="#0B1120" style={{ marginRight: 8 }} />
                  <Text style={styles.addBtnText}>{t.addPhoto}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filesList}>
                {getFilesForSelectedTrip().length === 0 && (
                  <View style={styles.emptyBox}>
                    <Ionicons name="shield-checkmark-outline" size={40} color="#334155" style={{ marginBottom: 12 }} />
                    <Text style={styles.emptyText}>{t.empty}</Text>
                    <Text style={styles.emptySub}>{t.emptyDesc}</Text>
                  </View>
                )}

                {getFilesForSelectedTrip().map((file: any) => (
                  <TouchableOpacity
                    key={file.id}
                    style={styles.fileCard}
                    activeOpacity={0.8}
                    onPress={() => handleOpenFile(file)}
                  >
                    <View style={styles.fileIconBox}>
                      <Ionicons
                        name={isImageFile(file) ? "image" : "document-text"}
                        size={24}
                        color="#F59E0B"
                      />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileType}>
                        {file.type || (isImageFile(file) ? 'IMAGE' : 'PDF')} • {t.uploaded}
                      </Text>
                    </View>
                    
                    {/* PRZYCISK ZMIANY NAZWY */}
                    <TouchableOpacity
                      style={styles.fileActionBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setTargetFile(file);
                        setNewFileName(file.name);
                        setNamingModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={18} color="#94A3B8" />
                    </TouchableOpacity>

                    {/* PRZYCISK USUNIĘCIA */}
                    <TouchableOpacity
                      style={styles.fileActionBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleDeleteFile(file.id, file.name);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>

                    <Ionicons name="chevron-forward" size={18} color="#64748B" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      )}

      {/* MODAL NADAWANIA / EDYCJI NAZWY PLIKU */}
      <Modal
        visible={namingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNamingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{t.nameFileTitle || 'Nazwij plik w Sejfie'}</Text>
              <TouchableOpacity onPress={() => setNamingModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              {t.nameFileDesc || 'Wprowadź czytelną nazwę, aby łatwo rozpoznać dokument w Sejfie:'}
            </Text>

            {/* SZYBKIE TAGI SUGESTII */}
            <View style={styles.quickTagsRow}>
              {[
                t.quickTagFlight || 'Bilet lotniczy',
                t.quickTagHotel || 'Rezerwacja hotelu',
                t.quickTagInsurance || 'Ubezpieczenie',
                t.quickTagBoarding || 'Karta pokładowa',
              ].map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.quickTagPill}
                  onPress={() => setNewFileName(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickTagText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="bookmark-outline" size={18} color="#F59E0B" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.textInput}
                value={newFileName}
                onChangeText={setNewFileName}
                placeholder={t.fileNamePlaceholder || 'np. Bilet lotniczy'}
                placeholderTextColor="#94A3B8"
                autoFocus
              />
            </View>

            <TouchableOpacity style={styles.primaryModalBtn} onPress={handleSaveFileName} activeOpacity={0.8}>
              <Text style={styles.primaryModalBtnText}>{t.saveName || 'Zapisz nazwę'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => setNamingModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryModalBtnText}>{t.skipName || 'Zostaw oryginalną'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL BEZPOŚREDNIEGO PODGLĄDU PLIKU W APLIKACJI (IN-APP VIEWER) */}
      <Modal
        visible={!!previewFile}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewFile(null)}
      >
        <SafeAreaView style={styles.previewContainer}>
          {/* HEADER PODGLĄDU */}
          <View style={styles.previewHeader}>
            <TouchableOpacity onPress={() => setPreviewFile(null)} style={styles.previewCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color="#F8FAFC" />
            </TouchableOpacity>

            <View style={styles.previewHeaderInfo}>
              <Text style={styles.previewTitle} numberOfLines={1}>{previewFile?.name}</Text>
              <Text style={styles.previewSubtitle}>
                {previewFile?.type || (isImageFile(previewFile) ? 'IMAGE' : 'PDF')} • {t.secured || 'Zabezpieczono'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => previewFile && handleShareExternal(previewFile.uri)}
              style={styles.previewShareBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={20} color="#38BDF8" />
            </TouchableOpacity>
          </View>

          {/* ZAWARTOŚĆ PLIKU */}
          <View style={styles.previewBody}>
            {isImageFile(previewFile) ? (
              <Image
                source={{ uri: previewFile?.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.pdfDocCard}>
                <View style={styles.pdfIconBig}>
                  <Ionicons name="document-text" size={72} color="#F59E0B" />
                </View>
                <Text style={styles.pdfDocName} numberOfLines={2}>{previewFile?.name}</Text>
                <View style={styles.pdfSecurityBadge}>
                  <Ionicons name="shield-checkmark" size={14} color="#10B981" style={{ marginRight: 6 }} />
                  <Text style={styles.pdfSecurityText}>{t.pdfSecuredNotice || 'Zabezpieczony plik PDF w Sejfie Offline'}</Text>
                </View>
                
                <TouchableOpacity
                  style={styles.openExternalBtn}
                  onPress={() => previewFile && handleShareExternal(previewFile.uri)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={18} color="#0B1120" style={{ marginRight: 8 }} />
                  <Text style={styles.openExternalBtnText}>{t.openInDocViewer || 'Otwórz w przeglądarce dokumentów ➔'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 16, 
    alignItems: 'center', 
    borderBottomWidth: 1, 
    borderColor: '#1E293B', 
    backgroundColor: '#0B1120' 
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { 
    marginRight: 12, 
    padding: 6, 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  lockBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: 'rgba(239, 68, 68, 0.3)' 
  },
  lockBtnText: { color: '#F87171', fontSize: 12, fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  folderCard: { 
    width: '47%', 
    backgroundColor: '#111827', 
    borderRadius: 16, 
    padding: 20, 
    borderWidth: 1, 
    borderColor: '#1E293B', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  folderTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  folderSub: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },
  
  tripTitleLabel: { color: '#F59E0B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  tripTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginBottom: 20 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 26 },
  addBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    backgroundColor: '#F59E0B', 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    shadowColor: '#F59E0B', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 8, 
    elevation: 4 
  },
  addBtnText: { color: '#0B1120', fontSize: 13, fontWeight: '800' },
  
  filesList: { gap: 12 },
  fileCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#111827', 
    borderRadius: 14, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: '#1E293B' 
  },
  fileIconBox: { 
    width: 44, 
    height: 44, 
    borderRadius: 12, 
    backgroundColor: 'rgba(245, 158, 11, 0.1)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 14 
  },
  fileInfo: { flex: 1, marginRight: 8 },
  fileName: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  fileType: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  fileActionBtn: { 
    padding: 8, 
    backgroundColor: '#1E293B', 
    borderRadius: 8, 
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  
  emptyBox: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 40, 
    backgroundColor: 'rgba(255,255,255,0.02)', 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#1E293B', 
    borderStyle: 'dashed' 
  },
  emptyText: { color: '#CBD5E1', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#CBD5E1', fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },

  // Style Modala Nadawania Nazwy
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
    marginBottom: 14 
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
  modalDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  quickTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  quickTagPill: { 
    backgroundColor: 'rgba(56, 189, 248, 0.1)', 
    borderWidth: 1, 
    borderColor: 'rgba(56, 189, 248, 0.3)', 
    borderRadius: 16, 
    paddingHorizontal: 12, 
    paddingVertical: 6 
  },
  quickTagText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#0B1120', 
    borderWidth: 1, 
    borderColor: '#334155', 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    height: 48, 
    marginBottom: 16 
  },
  textInput: { flex: 1, color: '#F8FAFC', fontSize: 14 },
  primaryModalBtn: { 
    backgroundColor: '#F59E0B', 
    height: 48, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 10 
  },
  primaryModalBtnText: { color: '#0B1120', fontSize: 14, fontWeight: '800' },
  secondaryModalBtn: { height: 42, justifyContent: 'center', alignItems: 'center' },
  secondaryModalBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },

  // Style Podglądu Pliku (In-App Viewer)
  previewContainer: { flex: 1, backgroundColor: '#060B19' },
  previewHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderColor: '#1E293B', 
    backgroundColor: '#0B1120' 
  },
  previewCloseBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 19, 
    backgroundColor: '#1E293B', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  previewHeaderInfo: { flex: 1, paddingHorizontal: 12 },
  previewTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  previewSubtitle: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginTop: 2 },
  previewShareBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 19, 
    backgroundColor: 'rgba(56, 189, 248, 0.1)', 
    borderWidth: 1, 
    borderColor: 'rgba(56, 189, 248, 0.3)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  previewBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  previewImage: { width: screenWidth - 32, height: screenHeight * 0.75 },
  
  pdfDocCard: { 
    backgroundColor: '#111827', 
    borderRadius: 20, 
    padding: 32, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#1E293B', 
    width: '92%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  pdfIconBig: { marginBottom: 20 },
  pdfDocName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  pdfSecurityBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(16, 185, 129, 0.12)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: 'rgba(16, 185, 129, 0.3)', 
    marginBottom: 24 
  },
  pdfSecurityText: { color: '#10B981', fontSize: 12, fontWeight: '600' },
  openExternalBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F59E0B', 
    paddingHorizontal: 20, 
    paddingVertical: 14, 
    borderRadius: 12, 
    shadowColor: '#F59E0B', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 8, 
    elevation: 4 
  },
  openExternalBtnText: { color: '#0B1120', fontSize: 14, fontWeight: '800' },
});