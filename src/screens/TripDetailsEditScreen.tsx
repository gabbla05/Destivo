import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePowerSync } from '@powersync/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { HubPickerField } from '../components/HubPickerField';
import { VaultManager } from '../lib/vaultManager';
import { pushTripToCloud } from '../lib/tripSync';

/**
 * Transport, bilety i nocleg istniejącej podróży — także tej utworzonej szybkim kreatorem,
 * który nie pyta o szczegóły transportu. Zapis: lokalnie + cały wiersz do Supabase.
 */

type TransportType = 'flight' | 'train' | 'car';
type LocationField = 'outboundDepartureLocation' | 'outboundArrivalLocation' | 'returnDepartureLocation' | 'returnArrivalLocation';
type TimeField = 'outboundDepartureTime' | 'outboundArrivalTime' | 'returnDepartureTime' | 'returnArrivalTime';

const parseJson = (value: any) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

/** "7.15", "715", "7:5" -> "07:15" / "07:05"; niepoprawne wartości zostają bez zmian. */
export const normalizeTime = (value?: string): string => {
  const raw = (value || '').trim();
  const m = raw.match(/^(\d{1,2})[:.,\s-]?(\d{2})$/) || raw.match(/^(\d{1,2})[:.](\d)$/);
  if (!m) return raw;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return raw;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const withTime = (iso: string | undefined, time: string): string | undefined => {
  if (!iso || !/^\d{2}:\d{2}$/.test(time)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const TripDetailsEditScreen = ({ route, navigation }: any) => {
  const tripId: string = route?.params?.tripId;
  const db = usePowerSync();
  const { user, isGuest, language } = useAuthStore();
  const isEn = language === 'en';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<any>(null);
  const [transportType, setTransportType] = useState<TransportType>('train');
  const [details, setDetails] = useState<Record<string, any>>({});
  const [lodgingAddress, setLodgingAddress] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await db.execute('SELECT * FROM trips WHERE id = ? LIMIT 1', [tripId]);
        const rows = ((res as any)?.array || (res as any)?.rows?._array || (res as any)?.rows || []) as any[];
        const row = rows[0];
        if (row) {
          const transport = parseJson(row.transport_data);
          const lodging = parseJson(row.lodging_data);
          setTrip(row);
          const type = transport?.selectedOption?.type;
          // Bus nie ma osobnej zakładki - traktujemy go jak przejazd z dworca (pociąg)
          if (['flight', 'train', 'car'].includes(type)) setTransportType(type);
          setDetails(transport?.details || {});
          setLodgingAddress(lodging?.lodgingAddress || '');
        }
      } catch (e) {
        console.warn('TripDetailsEdit: nie udało się wczytać podróży', e);
      } finally {
        setLoading(false);
      }
    })();
    // Wczytujemy raz na podróż - ponowne wczytanie nadpisałoby to, co użytkownik właśnie edytuje
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const setField = (key: string, value: any) => setDetails((prev) => ({ ...prev, [key]: value }));

  const pickTicket = (leg: 'outbound' | 'return') => {
    const assign = (file: any) => {
      if (!file) return;
      if (leg === 'outbound') setDetails((prev) => ({ ...prev, outboundTicketFile: file, ticketFile: file }));
      else setField('returnTicketFile', file);
    };
    Alert.alert(
      leg === 'outbound' ? (isEn ? 'Outbound ticket' : 'Bilet tam') : (isEn ? 'Return ticket' : 'Bilet powrotny'),
      isEn ? 'Where is your ticket?' : 'Skąd wgrać bilet?',
      [
        { text: 'PDF', onPress: () => VaultManager.pickFile().then(assign).catch(() => Alert.alert('DESTIVO', isEn ? 'Could not add the ticket.' : 'Nie udało się dodać biletu.')) },
        { text: isEn ? 'Photo' : 'Zdjęcie', onPress: () => VaultManager.pickImage().then(assign).catch(() => Alert.alert('DESTIVO', isEn ? 'Could not add the ticket.' : 'Nie udało się dodać biletu.')) },
        { text: isEn ? 'Cancel' : 'Anuluj', style: 'cancel' },
      ]
    );
  };

  const removeTicket = (leg: 'outbound' | 'return') => {
    if (leg === 'outbound') setDetails((prev) => ({ ...prev, outboundTicketFile: null, ticketFile: null }));
    else setField('returnTicketFile', null);
  };

  const save = async () => {
    if (!trip) return;
    setSaving(true);
    try {
      const transport = parseJson(trip.transport_data);
      const lodging = parseJson(trip.lodging_data);
      const attractions = parseJson(trip.attractions_data);
      const cleanDetails: Record<string, any> = { ...details };
      (['outboundDepartureTime', 'outboundArrivalTime', 'returnDepartureTime', 'returnArrivalTime'] as TimeField[]).forEach((k) => {
        if (cleanDetails[k]) cleanDetails[k] = normalizeTime(cleanDetails[k]);
      });

      const newTransport = {
        ...transport,
        selectedOption: { ...(transport.selectedOption || {}), type: transportType },
        details: cleanDetails,
      };
      const address = lodgingAddress.trim();
      const newLodging = { ...lodging, lodgingAddress: address };

      // Oś czasu: godzina i trasa wyjazdu/powrotu oraz adres noclegu
      if (Array.isArray(attractions.customTimeline)) {
        const route = (a?: string, b?: string) => (a && b ? `${a} ➔ ${b}` : a || b || '');
        attractions.customTimeline = attractions.customTimeline
          .map((evt: any) => {
            if (evt?.type === 'DEPARTURE') {
              const time = cleanDetails.outboundDepartureTime;
              const sub = route(cleanDetails.outboundDepartureLocation, cleanDetails.outboundArrivalLocation);
              return { ...evt, ...(time ? { timeStr: time, parsedDate: withTime(evt.parsedDate, time) } : {}), ...(sub ? { subtitle: sub } : {}) };
            }
            if (evt?.type === 'RETURN') {
              const time = cleanDetails.returnDepartureTime;
              const sub = route(cleanDetails.returnDepartureLocation, cleanDetails.returnArrivalLocation);
              return { ...evt, ...(time ? { timeStr: time, parsedDate: withTime(evt.parsedDate, time) } : {}), ...(sub ? { subtitle: sub } : {}) };
            }
            if (evt?.type === 'LODGING' && address) return { ...evt, subtitle: address };
            return evt;
          })
          .sort((a: any, b: any) => new Date(a.parsedDate).getTime() - new Date(b.parsedDate).getTime());
      }

      const transportJson = JSON.stringify(newTransport);
      const lodgingJson = JSON.stringify(newLodging);
      const attractionsJson = JSON.stringify(attractions);
      await db.execute(
        'UPDATE trips SET transport_data = ?, lodging_data = ?, attractions_data = ? WHERE id = ?',
        [transportJson, lodgingJson, attractionsJson, trip.id]
      );
      await AsyncStorage.setItem(`destivo_timeline_${trip.id}`, attractionsJson).catch(() => undefined);

      const loggedIn = Boolean(user && !isGuest && !user.isGuest);
      const cloudSaved = loggedIn ? await pushTripToCloud(db, trip.id, user?.id) : true;
      Alert.alert(
        'DESTIVO',
        cloudSaved
          ? (isEn ? 'Trip details saved.' : 'Zapisano szczegóły podróży.')
          : (isEn
            ? 'Saved on this phone. They will be uploaded to the cloud automatically when you are back online.'
            : 'Zapisano na telefonie. Zostaną wysłane do chmury automatycznie, gdy wróci internet.'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      console.warn('TripDetailsEdit: błąd zapisu', e);
      Alert.alert('DESTIVO', isEn ? 'Could not save the changes.' : 'Nie udało się zapisać zmian.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#38BDF8" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const origin = trip?.origin || '';
  const destination = trip?.destination || '';
  const types: Array<{ id: TransportType; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
    { id: 'flight', icon: 'airplane-outline', label: isEn ? 'Flight' : 'Samolot' },
    { id: 'train', icon: 'train-outline', label: isEn ? 'Train' : 'Pociąg' },
    { id: 'car', icon: 'car-outline', label: isEn ? 'Car' : 'Auto' },
  ];

  const timeInput = (key: TimeField, label: string) => (
    <View style={styles.timeGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.timeInput}
        placeholder="HH:MM"
        placeholderTextColor="#64748B"
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        value={details[key] || ''}
        onChangeText={(v) => setField(key, v)}
        onBlur={() => details[key] && setField(key, normalizeTime(details[key]))}
        testID={`edit-${key}`}
      />
    </View>
  );

  const locationInput = (key: LocationField, label: string, place: string, icon: keyof typeof Ionicons.glyphMap) => (
    <HubPickerField
      label={label}
      value={details[key] || ''}
      onChange={(v) => setField(key, v)}
      place={place}
      transportType={transportType}
      icon={icon}
      language={isEn ? 'en' : 'pl'}
      testID={`edit-${key}`}
    />
  );

  const ticketRow = (leg: 'outbound' | 'return') => {
    const file = leg === 'outbound' ? details.outboundTicketFile || details.ticketFile : details.returnTicketFile;
    return (
      <View style={styles.ticketRow}>
        <Ionicons name={file ? 'checkmark-circle' : 'ticket-outline'} size={20} color={file ? '#10B981' : '#94A3B8'} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.ticketTitle}>{leg === 'outbound' ? (isEn ? 'Outbound ticket' : 'Bilet tam') : (isEn ? 'Return ticket' : 'Bilet powrotny')}</Text>
          <Text style={styles.ticketSub} numberOfLines={1}>{file ? file.name : (isEn ? 'Not added' : 'Nie dodano')}</Text>
        </View>
        {file && (
          <TouchableOpacity onPress={() => removeTicket(leg)} style={styles.ticketIconBtn} testID={`edit-remove-ticket-${leg}`}>
            <Ionicons name="close" size={18} color="#F87171" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => pickTicket(leg)} style={styles.ticketBtn} testID={`edit-add-ticket-${leg}`}>
          <Text style={styles.ticketBtnText}>{file ? (isEn ? 'Replace' : 'Zmień') : (isEn ? 'Add' : 'Dodaj')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} testID="edit-trip-back">
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isEn ? 'Transport & stay' : 'Transport i nocleg'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{trip?.trip_name || trip?.title || destination}</Text>
        </View>
      </View>

      {!trip ? (
        <Text style={styles.empty}>{isEn ? 'Trip not found on this phone.' : 'Nie znaleziono podróży na tym telefonie.'}</Text>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>{isEn ? 'MEANS OF TRANSPORT' : 'ŚRODEK TRANSPORTU'}</Text>
            <View style={styles.typeRow}>
              {types.map((ty) => (
                <TouchableOpacity
                  key={ty.id}
                  style={[styles.typeChip, transportType === ty.id && styles.typeChipActive]}
                  onPress={() => setTransportType(ty.id)}
                  testID={`edit-type-${ty.id}`}
                >
                  <Ionicons name={ty.icon} size={16} color={transportType === ty.id ? '#0B1120' : '#94A3B8'} />
                  <Text style={[styles.typeText, transportType === ty.id && styles.typeTextActive]}>{ty.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.section}>{isEn ? `OUTBOUND: ${origin} ➔ ${destination}` : `TAM: ${origin} ➔ ${destination}`}</Text>
            {locationInput('outboundDepartureLocation', isEn ? 'Departure from' : 'Odjazd z', origin, 'location-outline')}
            {locationInput('outboundArrivalLocation', isEn ? 'Arrival at' : 'Przyjazd do', destination, 'pin-outline')}
            <View style={styles.timeRow}>
              {timeInput('outboundDepartureTime', isEn ? 'Departure' : 'Odjazd')}
              {timeInput('outboundArrivalTime', isEn ? 'Arrival' : 'Przyjazd')}
            </View>
            {ticketRow('outbound')}

            <Text style={styles.section}>{isEn ? `RETURN: ${destination} ➔ ${origin}` : `POWRÓT: ${destination} ➔ ${origin}`}</Text>
            {locationInput('returnDepartureLocation', isEn ? 'Departure from' : 'Odjazd z', destination, 'location-outline')}
            {locationInput('returnArrivalLocation', isEn ? 'Arrival at' : 'Przyjazd do', origin, 'pin-outline')}
            <View style={styles.timeRow}>
              {timeInput('returnDepartureTime', isEn ? 'Departure' : 'Odjazd')}
              {timeInput('returnArrivalTime', isEn ? 'Arrival' : 'Przyjazd')}
            </View>
            {ticketRow('return')}

            <Text style={styles.section}>{isEn ? 'ACCOMMODATION' : 'NOCLEG'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="bed-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder={isEn ? 'Hotel address' : 'Adres noclegu'}
                placeholderTextColor="#64748B"
                value={lodgingAddress}
                onChangeText={setLodgingAddress}
                testID="edit-lodging-address"
              />
            </View>
            <Text style={styles.hint}>
              {isEn
                ? 'The address is the start and end point of each day when arranging the route.'
                : 'Adres jest punktem startu i końca każdego dnia przy układaniu trasy.'}
            </Text>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} testID="edit-trip-save">
              {saving ? <ActivityIndicator color="#0B1120" /> : <Text style={styles.saveText}>{isEn ? 'Save' : 'Zapisz'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { marginRight: 12, padding: 4 },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  content: { padding: 16, paddingBottom: 48 },
  section: { color: '#38BDF8', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#111827', gap: 6 },
  typeChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  typeText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  typeTextActive: { color: '#0B1120' },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeGroup: { flex: 1, marginBottom: 12 },
  timeInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, height: 44, paddingHorizontal: 12, color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  ticketRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', padding: 12, marginTop: 4 },
  ticketTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  ticketSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  ticketIconBtn: { padding: 6, marginRight: 4 },
  ticketBtn: { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  ticketBtnText: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, height: 44 },
  input: { flex: 1, color: '#F8FAFC', fontSize: 14, height: '100%' },
  hint: { color: '#64748B', fontSize: 11, marginTop: 6 },
  saveBtn: { backgroundColor: '#38BDF8', borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  saveText: { color: '#0B1120', fontSize: 15, fontWeight: '800' },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
