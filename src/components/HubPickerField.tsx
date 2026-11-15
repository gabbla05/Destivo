import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findNearbyHubs, hubKindsForTransport, TransportHub } from '../lib/transportHubs';

/**
 * Pole miejsca odjazdu / przyjazdu: można wpisać ręcznie albo wybrać z listy dworców, lotnisk
 * i przystanków w pobliżu miejscowości (Google Places).
 */
interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Miejscowość, wokół której szukamy (np. cel podróży). */
  place: string;
  transportType?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  language?: 'pl' | 'en';
  /** Wywoływane po zakończeniu edycji z aktualną wartością pola. */
  onBlur?: (value: string) => void;
  testID?: string;
}

const KIND_ICON: Record<TransportHub['kind'], keyof typeof Ionicons.glyphMap> = {
  airport: 'airplane-outline',
  train_station: 'train-outline',
  bus_station: 'bus-outline',
};

export const HubPickerField: React.FC<Props> = ({
  label, value, onChange, place, transportType, icon = 'location-outline', language = 'pl', onBlur, testID,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hubs, setHubs] = useState<TransportHub[] | null>(null);
  // Ostatnio wpisany tekst - przy utracie fokusu stan rodzica może jeszcze nie być odświeżony
  const typedRef = useRef<string | null>(null);
  const isEn = language === 'en';
  const canSearch = hubKindsForTransport(transportType).length > 0 && Boolean(place?.trim());

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (hubs !== null) return;
    setLoading(true);
    const found = await findNearbyHubs(place, transportType).catch(() => []);
    setHubs(found);
    setLoading(false);
  };

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <Ionicons name={icon} size={18} color="#94A3B8" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={isEn ? 'Type or pick from the list' : 'Wpisz albo wybierz z listy'}
          placeholderTextColor="#64748B"
          value={value}
          onChangeText={(text) => {
            typedRef.current = text;
            onChange(text);
          }}
          onBlur={() => onBlur?.(typedRef.current ?? value)}
          testID={testID}
        />
        {canSearch && (
          <TouchableOpacity
            onPress={toggle}
            style={styles.pickBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isEn ? 'Pick a nearby station' : 'Wybierz stację w pobliżu'}
            testID={testID ? `${testID}-pick` : undefined}
          >
            <Ionicons name={open ? 'chevron-up' : 'list'} size={18} color="#38BDF8" />
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <View style={styles.dropdown} testID={testID ? `${testID}-list` : undefined}>
          <Text style={styles.dropdownTitle}>
            {isEn ? `Near ${place}` : `W pobliżu: ${place}`}
          </Text>
          {loading ? (
            <ActivityIndicator color="#38BDF8" style={{ marginVertical: 10 }} />
          ) : hubs && hubs.length > 0 ? (
            hubs.map((hub) => (
              <TouchableOpacity
                key={hub.id}
                style={[styles.option, value === hub.name && styles.optionActive]}
                onPress={() => {
                  typedRef.current = hub.name;
                  onChange(hub.name);
                  setOpen(false);
                  onBlur?.(hub.name);
                }}
                activeOpacity={0.75}
                testID={testID ? `${testID}-option-${hub.id}` : undefined}
              >
                <Ionicons name={KIND_ICON[hub.kind]} size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionName} numberOfLines={1}>{hub.name}</Text>
                  {hub.address ? <Text style={styles.optionAddr} numberOfLines={1}>{hub.address}</Text> : null}
                </View>
                <Text style={styles.optionDist}>{hub.distanceKm} km</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.empty}>
              {isEn
                ? 'No stations found nearby (or no internet). Type the place manually.'
                : 'Nie znaleziono stacji w pobliżu (albo brak internetu). Wpisz miejsce ręcznie.'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#F8FAFC', fontSize: 14, height: '100%' },
  pickBtn: { paddingLeft: 10, height: '100%', justifyContent: 'center' },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 8,
    paddingVertical: 6,
  },
  dropdownTitle: { color: '#64748B', fontSize: 11, fontWeight: '700', paddingHorizontal: 12, paddingBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  optionActive: { backgroundColor: 'rgba(56, 189, 248, 0.12)' },
  optionName: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  optionAddr: { color: '#94A3B8', fontSize: 11, marginTop: 1 },
  optionDist: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginLeft: 8 },
  empty: { color: '#94A3B8', fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
