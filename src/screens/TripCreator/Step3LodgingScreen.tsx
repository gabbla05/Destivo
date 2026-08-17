// src/screens/TripCreator/Step3LodgingScreen.tsx
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Linking, 
  ScrollView, 
  Alert, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTripCreatorStore } from '../../store/tripCreatorStore';
import { useAuthStore } from '../../store/authStore';
import { translations } from '../../i18n/translations';

export const Step3LodgingScreen = () => {
  const navigation = useNavigation();
  const { language } = useAuthStore();
  const t = translations[language].tripCreatorStep3;
  const commonT = translations[language].common;
  
  const destination = useTripCreatorStore((state) => state.destination);
  const lodgingAddress = useTripCreatorStore((state) => state.lodgingAddress);
  const setLodgingAddress = useTripCreatorStore((state) => state.setLodgingAddress);

  const [localAddress, setLocalAddress] = useState(lodgingAddress || '');

  const handleOpenBooking = async () => {
    try {
      const encodedDestination = encodeURIComponent(destination);
      const url = `https://www.booking.com/searchresults.html?ss=${encodedDestination}`;
      
      // LOGOWANIE LINKU DO KONSOLI
      console.log('🔗 Wygenerowany link do Booking.com:', url);
      
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('DESTIVO', commonT.label_error);
      }
    } catch (error) {
      console.error('Error opening booking', error);
    }
  };

  const handleNext = () => {
    setLodgingAddress(localAddress);
    navigation.navigate('Step4Attractions' as never); 
  };

  const handleSkip = () => {
    setLodgingAddress('');
    navigation.navigate('Step4Attractions' as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
            {/* PASEK POSTĘPU */}
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>{t.step_indicator}</Text>
              <Text style={styles.progressStepName}>{t.step_title}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: '75%' }]} />
            </View>

            {/* NAGŁÓWEK */}
            <View style={styles.header}>
              <Text style={styles.title}>{t.header_title}</Text>
              <Text style={styles.subtitle}>{t.header_subtitle}</Text>
            </View>

            {/* KARTA BOOKING.COM */}
            <View style={styles.bookingCard}>
              <View style={styles.bookingCardHeader}>
                <Text style={styles.bookingTitle}>{t.booking_prompt_title}</Text>
              </View>
              <Text style={styles.bookingDesc}>{t.booking_prompt_desc}</Text>
              
              <TouchableOpacity 
                style={styles.bookingButton}
                onPress={handleOpenBooking}
                activeOpacity={0.8}
              >
                <Text style={styles.bookingButtonText}>{t.button_openBooking}</Text>
              </TouchableOpacity>
            </View>

            {/* KARTA WPROWADZANIA ADRESU */}
            <View style={styles.detailsCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t.input_accommodationAddressLabel.toUpperCase()}</Text>
                <Text style={styles.inputHint}>{t.input_accommodationAddressHelp}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={t.input_accommodationAddressPlaceholder}
                  placeholderTextColor="#475569"
                  value={localAddress}
                  onChangeText={setLocalAddress}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </ScrollView>

          {/* AKCJE NA DOLE EKRANU */}
          <View style={styles.bottomActions}>
            <TouchableOpacity 
              style={[styles.primaryButton, localAddress.trim().length === 0 && { opacity: 0.5 }]}
              disabled={localAddress.trim().length === 0}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{commonT.button_nextStep}</Text>
            </TouchableOpacity>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation?.goBack()} activeOpacity={0.8}>
                <Text style={styles.secondaryButtonText}>{commonT.button_goBack}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={handleSkip} activeOpacity={0.8}>
                <Text style={styles.tertiaryButtonText}>{commonT.button_skip}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  container: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#F59E0B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  progressStepName: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 4, backgroundColor: '#1E293B', borderRadius: 2, marginBottom: 20 },
  progressBarFill: { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#94A3B8', lineHeight: 20 },

  bookingCard: { backgroundColor: 'rgba(56, 189, 248, 0.05)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.2)' },
  bookingCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  bookingTitle: { color: '#38BDF8', fontSize: 16, fontWeight: '800' },
  bookingDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 14 },
  bookingButton: { backgroundColor: '#0EA5E9', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  bookingButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  detailsCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  inputGroup: { marginBottom: 4 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  inputHint: { color: '#64748B', fontSize: 12, marginBottom: 10, lineHeight: 16 },
  textInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 10, color: '#F8FAFC', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, minHeight: 80, fontSize: 14 },

  bottomActions: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1E293B', backgroundColor: '#0B1120' },
  primaryButton: { backgroundColor: '#F59E0B', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  primaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  actionButtonsRow: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  tertiaryButton: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#475569' },
  tertiaryButtonText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' },
});