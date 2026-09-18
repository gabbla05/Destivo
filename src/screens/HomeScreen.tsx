import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar, 
  Image,
  ImageBackground,
  ActivityIndicator,
  Alert,
  Dimensions,
  TextInput,
  Modal,
  Linking
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import { generateLiveRecommendations, LiveDestination } from '../lib/liveExplore';
import { useFocusEffect } from '@react-navigation/native';
import { usePowerSync } from '@powersync/react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase'; // DODANE: Do dual-write przy zapisywaniu wycieczki na osi

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

const EXCHANGE_RATES: Record<string, number> = {
  PLN: 1.0,
  EUR: 4.30,
  USD: 4.00,
  GBP: 5.10,
  CHF: 4.50,
  CZK: 0.17,
  HUF: 0.011,
  JPY: 0.026,
  ISK: 0.029,
  NOK: 0.37,
  SEK: 0.38,
  DKK: 0.58,
  TRY: 0.12,
};

const CURRENCY_LIST = [
  { code: 'EUR', label: 'EUR - Euro', flag: '🇪🇺' },
  { code: 'PLN', label: 'PLN - Polski Złoty', flag: '🇵🇱' },
  { code: 'USD', label: 'USD - US Dollar', flag: '🇺🇸' },
  { code: 'GBP', label: 'GBP - British Pound', flag: '🇬🇧' },
  { code: 'CHF', label: 'CHF - Frank Szwajcarski', flag: '🇨🇭' },
  { code: 'CZK', label: 'CZK - Korona Czeska', flag: '🇨🇿' },
  { code: 'HUF', label: 'HUF - Forint Węgierski', flag: '🇭🇺' },
  { code: 'JPY', label: 'JPY - Jen Japoński', flag: '🇯🇵' },
  { code: 'ISK', label: 'ISK - Korona Islandzka', flag: '🇮🇸' },
  { code: 'NOK', label: 'NOK - Korona Norweska', flag: '🇳🇴' },
  { code: 'SEK', label: 'SEK - Korona Szwedzka', flag: '🇸🇪' },
  { code: 'DKK', label: 'DKK - Korona Duńska', flag: '🇩🇰' },
  { code: 'TRY', label: 'TRY - Lira Turecka', flag: '🇹🇷' },
];

const getCurrencyForDestination = (dest: string): string => {
  if (!dest) return 'EUR';
  const d = dest.toLowerCase().trim();
  // Polska -> PLN
  if (['warszawa', 'warsaw', 'kraków', 'krakow', 'gdańsk', 'gdansk', 'wrocław', 'wroclaw', 'poznań', 'poznan', 'zakopane', 'tatry', 'morze', 'bałtyk', 'polska', 'poland', 'pl'].some(c => d.includes(c))) return 'PLN';
  // Wielka Brytania -> GBP
  if (['londyn', 'london', 'edynburg', 'edinburgh', 'manchester', 'liverpool', 'birmingham', 'glasgow', 'brytania', 'anglia', 'wielka brytania', 'uk', 'united kingdom'].some(c => d.includes(c))) return 'GBP';
  // Czechy -> CZK
  if (['praga', 'prague', 'brno', 'ostrawa', 'ostrava', 'czech', 'czechia', 'republika czeska'].some(c => d.includes(c))) return 'CZK';
  // Węgry -> HUF
  if (['budapeszt', 'budapest', 'debreczyn', 'węgry', 'wegry', 'hungary'].some(c => d.includes(c))) return 'HUF';
  // Szwajcaria -> CHF
  if (['zurych', 'zurich', 'genewa', 'geneva', 'bazylea', 'basel', 'berno', 'szwajcaria', 'switzerland', 'swiss'].some(c => d.includes(c))) return 'CHF';
  // Japonia -> JPY
  if (['tokio', 'tokyo', 'kioto', 'kyoto', 'osaka', 'japan', 'japonia'].some(c => d.includes(c))) return 'JPY';
  // USA -> USD
  if (['nowy jork', 'new york', 'los angeles', 'chicago', 'miami', 'san francisco', 'las vegas', 'usa', 'stany', 'stany zjednoczone', 'united states'].some(c => d.includes(c))) return 'USD';
  // Islandia -> ISK
  if (['reykjavik', 'islandia', 'iceland'].some(c => d.includes(c))) return 'ISK';
  // Norwegia -> NOK
  if (['oslo', 'bergen', 'tromso', 'norwegia', 'norway'].some(c => d.includes(c))) return 'NOK';
  // Szwecja -> SEK
  if (['sztokholm', 'stockholm', 'goteborg', 'malmo', 'szwecja', 'sweden'].some(c => d.includes(c))) return 'SEK';
  // Dania -> DKK
  if (['kopenhaga', 'copenhagen', 'dania', 'denmark'].some(c => d.includes(c))) return 'DKK';
  // Turcja -> TRY
  if (['stambuł', 'stambul', 'istanbul', 'ankara', 'antalya', 'turcja', 'turkey'].some(c => d.includes(c))) return 'TRY';
  // Domyślnie waluta strefy Euro
  return 'EUR';
};

const POPULAR_DESTINATION_ATTRACTIONS: Record<string, Array<{ name: string; subtitle: string; imageUrl: string }>> = {
  rzym: [
    { name: 'Koloseum', subtitle: 'Starożytny amfiteatr Flawiuszów', imageUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=600' },
    { name: 'Fontanna di Trevi', subtitle: 'Słynna barokowa fontanna', imageUrl: 'https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&q=80&w=600' },
    { name: 'Panteon', subtitle: 'Starożytna świątynia wszystkich bogów', imageUrl: 'https://images.unsplash.com/photo-1542820229-081e0c12af0b?auto=format&fit=crop&q=80&w=600' },
    { name: 'Forum Romanum', subtitle: 'Serce antycznego Rzymu', imageUrl: 'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?auto=format&fit=crop&q=80&w=600' },
    { name: 'Bazylika św. Piotra', subtitle: 'Serce Watykanu i arcydzieło renesansu', imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600' },
    { name: 'Schody Hiszpańskie', subtitle: 'Piazza di Spagna', imageUrl: 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&q=80&w=600' },
  ],
  rome: [
    { name: 'Koloseum', subtitle: 'Starożytny amfiteatr Flawiuszów', imageUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=600' },
    { name: 'Fontanna di Trevi', subtitle: 'Słynna barokowa fontanna', imageUrl: 'https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&q=80&w=600' },
    { name: 'Panteon', subtitle: 'Starożytna świątynia wszystkich bogów', imageUrl: 'https://images.unsplash.com/photo-1542820229-081e0c12af0b?auto=format&fit=crop&q=80&w=600' },
  ],
  paryż: [
    { name: 'Wieża Eiffla', subtitle: 'Ikona Paryża i widok na panoramę', imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=600' },
    { name: 'Luwr', subtitle: 'Największe muzeum sztuki na świecie', imageUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&q=80&w=600' },
    { name: 'Katedra Notre-Dame', subtitle: 'Gotyckie arcydzieło nad Sekwaną', imageUrl: 'https://images.unsplash.com/photo-1478359844494-1092259d93e4?auto=format&fit=crop&q=80&w=600' },
    { name: 'Bazylika Sacré-Cœur', subtitle: 'Wzgórze Montmartre', imageUrl: 'https://images.unsplash.com/photo-1520939817895-060bdef4ad1b?auto=format&fit=crop&q=80&w=600' },
    { name: 'Łuk Triumfalny', subtitle: 'Champs-Élysées', imageUrl: 'https://images.unsplash.com/photo-1509299349698-dd22323b5963?auto=format&fit=crop&q=80&w=600' },
  ],
  paris: [
    { name: 'Wieża Eiffla', subtitle: 'Ikona Paryża i widok na panoramę', imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=600' },
    { name: 'Luwr', subtitle: 'Największe muzeum sztuki na świecie', imageUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&q=80&w=600' },
  ],
  barcelona: [
    { name: 'Sagrada Família', subtitle: 'Niedokończone arcydzieło Gaudiego', imageUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&q=80&w=600' },
    { name: 'Park Güell', subtitle: 'Magiczny park z mozaikami', imageUrl: 'https://images.unsplash.com/photo-1564221710304-0b37c8b9d729?auto=format&fit=crop&q=80&w=600' },
    { name: 'Casa Batlló', subtitle: 'Modernistyczna perła architektury', imageUrl: 'https://images.unsplash.com/photo-1587789202069-f57c846b6535?auto=format&fit=crop&q=80&w=600' },
    { name: 'La Rambla', subtitle: 'Tętniący życiem deptak', imageUrl: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&q=80&w=600' },
  ],
  londyn: [
    { name: 'Big Ben & Westminster', subtitle: 'Słynna wieża zegarowa i parlament', imageUrl: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=600' },
    { name: 'London Eye', subtitle: 'Koło widokowe nad Tamizą', imageUrl: 'https://images.unsplash.com/photo-1486299267070-83823f5448dd?auto=format&fit=crop&q=80&w=600' },
    { name: 'Tower Bridge', subtitle: 'Zabytkowy most zwodzony', imageUrl: 'https://images.unsplash.com/photo-1526129318478-62ed807ebdf9?auto=format&fit=crop&q=80&w=600' },
    { name: 'British Museum', subtitle: 'Światowej klasy zbiory historyczne', imageUrl: 'https://images.unsplash.com/photo-1574610758891-5b809b6e6e2e?auto=format&fit=crop&q=80&w=600' },
  ],
  london: [
    { name: 'Big Ben & Westminster', subtitle: 'Słynna wieża zegarowa i parlament', imageUrl: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=600' },
    { name: 'Tower Bridge', subtitle: 'Zabytkowy most zwodzony', imageUrl: 'https://images.unsplash.com/photo-1526129318478-62ed807ebdf9?auto=format&fit=crop&q=80&w=600' },
  ],
  kraków: [
    { name: 'Wawel', subtitle: 'Zamek Królewski i Katedra', imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600' },
    { name: 'Rynek Główny', subtitle: 'Sukiennice i Kościół Mariacki', imageUrl: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=600' },
    { name: 'Kazimierz', subtitle: 'Zabytkowa dzielnica żydowska', imageUrl: 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&q=80&w=600' },
  ],
  krakow: [
    { name: 'Wawel', subtitle: 'Zamek Królewski i Katedra', imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600' },
    { name: 'Rynek Główny', subtitle: 'Sukiennice i Kościół Mariacki', imageUrl: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=600' },
  ],
  warszawa: [
    { name: 'Stare Miasto', subtitle: 'Zamek Królewski i Rynek Starego Miasta', imageUrl: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=600' },
    { name: 'Łazienki Królewskie', subtitle: 'Pałac na Wyspie i pomnik Chopina', imageUrl: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&q=80&w=600' },
    { name: 'Muzeum Powstania Warszawskiego', subtitle: 'Interaktywna historia', imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600' },
  ],
  warsaw: [
    { name: 'Stare Miasto', subtitle: 'Zamek Królewski i Rynek Starego Miasta', imageUrl: 'https://images.unsplash.com/photo-1519197924294-4ba991a11f28?auto=format&fit=crop&q=80&w=600' },
  ],
  praga: [
    { name: 'Most Karola', subtitle: 'Średniowieczny most kamienny na Wełtawie', imageUrl: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&q=80&w=600' },
    { name: 'Hradczany', subtitle: 'Zamek Praski i Katedra św. Wita', imageUrl: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&q=80&w=600' },
    { name: 'Rynek Staromiejski', subtitle: 'Zegar astronomiczny Orloj', imageUrl: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&q=80&w=600' },
  ],
  prague: [
    { name: 'Most Karola', subtitle: 'Średniowieczny most kamienny na Wełtawie', imageUrl: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&q=80&w=600' },
  ],
  tokio: [
    { name: 'Świątynia Senso-ji', subtitle: 'Najstarsza buddyjska świątynia w Asakusie', imageUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=600' },
    { name: 'Shibuya Crossing', subtitle: 'Najsłynniejsze skrzyżowanie świata', imageUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&q=80&w=600' },
  ],
  tokyo: [
    { name: 'Świątynia Senso-ji', subtitle: 'Najstarsza buddyjska świątynia w Asakusie', imageUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=600' },
  ],
};

const parseEventDateTime = (dateStr?: string, timeStr?: string): Date => {
  const now = new Date();
  if (!dateStr && !timeStr) return now;
  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();

  if (dateStr) {
    const clean = dateStr.replace(/\./g, '-');
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = Number(parts[0]);
        month = Number(parts[1]) - 1;
        day = Number(parts[2]);
      } else {
        day = Number(parts[0]);
        month = Number(parts[1]) - 1;
        year = Number(parts[2]);
      }
    }
  }

  let hours = 12;
  let minutes = 0;
  if (timeStr) {
    const parts = timeStr.split(':').map(Number);
    hours = parts[0] || 0;
    minutes = parts[1] || 0;
  }

  return new Date(year, month, day, hours, minutes, 0, 0);
};

const getEmergencyNumber = (dest: string): string => {
  if (!dest) return '112';
  const d = dest.toLowerCase();
  if (['nowy jork', 'new york', 'usa', 'stany'].some(c => d.includes(c))) return '911';
  if (['londyn', 'london', 'edynburg', 'edinburgh', 'uk'].some(c => d.includes(c))) return '999';
  if (['tokio', 'tokyo', 'japan', 'japonia'].some(c => d.includes(c))) return '110';
  return '112';
};

const getTripDayNumber = (startDateStr: string) => {
  if (!startDateStr) return 1;
  const parts = startDateStr.replace(/\./g, '-').split('-');
  let start: Date;
  if (parts.length === 3) {
    if (parts[0].length === 4) start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    else start = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  } else {
    start = new Date(startDateStr);
  }
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
};

const convertCurrency = (val: string, from: string, to: string) => {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return '';
  const fromRate = EXCHANGE_RATES[from] || 1.0;
  const toRate = EXCHANGE_RATES[to] || 1.0;
  const res = (num * fromRate) / toRate;
  return res >= 100 ? res.toFixed(1) : res.toFixed(2);
};

export const HomeScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { isGuest, user, language } = useAuthStore();
  const t = translations[language].homeScreen;
  const commonT = translations[language].common;
  const destinationNames = t.destinationNames as Record<string, string>;
  const db = usePowerSync();

  const [recommendations, setRecommendations] = useState<LiveDestination[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Stany dla Aktywnej Podróży
  const [activeTrip, setActiveTrip] = useState<any | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<any[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Stany dla Modala Dodawania Atrakcji
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualSubtitle, setManualSubtitle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');

  // Stany dla Kalkulatora Walut
  const [fromCurrency, setFromCurrency] = useState('EUR');
  const [toCurrency, setToCurrency] = useState('PLN');
  const [fromAmount, setFromAmount] = useState('100');
  const [toAmount, setToAmount] = useState('430.00');
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [currencySelectingSide, setCurrencySelectingSide] = useState<'FROM' | 'TO'>('FROM');

  // Fallback z tłumaczeń w razie braku imienia
  const userName = isGuest
    ? undefined
    : user?.name || user?.email?.split('@')[0] || t.header_fallbackTraveler;

  useEffect(() => {
    async function loadExplore() {
      try {
        const liveData = await generateLiveRecommendations();
        setRecommendations(liveData);
      } catch (error) {
        console.warn(error);
      } finally {
        setLoading(false);
      }
    }
    loadExplore();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const fetchActiveTrip = async () => {
        try {
          const userId = user?.id || 'guest';
          const result = await db.execute(`SELECT * FROM trips WHERE user_id = ?`, [userId]);
          const rows = ((result as any).array?.length > 0 
            ? (result as any).array 
            : (result.rows as any)?._array || (result.rows as any) || []) as any[];

          const now = new Date();
          now.setHours(0, 0, 0, 0);

          let currentFound = null;

          for (const trip of rows) {
            if (!trip.start_date || !trip.end_date) continue;
            
            const parseDate = (d: string) => {
              const parts = d.replace(/\./g, '-').split('-');
              if (parts.length !== 3) return new Date(0);
              if (parts[0].length === 4) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
              return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            };

            const startDate = parseDate(trip.start_date);
            const endDate = parseDate(trip.end_date);
            
            if (now >= startDate && now <= endDate) {
              currentFound = trip;
              break;
            }
          }

          if (currentFound) {
            setActiveTrip(currentFound);

            // Inicjalizacja waluty bazowej dla danego celu podróży
            const baseCurr = getCurrencyForDestination(currentFound.destination);
            setFromCurrency(baseCurr);
            setToCurrency(baseCurr === 'PLN' ? 'EUR' : 'PLN');
            setToAmount(convertCurrency(fromAmount, baseCurr, baseCurr === 'PLN' ? 'EUR' : 'PLN'));
            
            // Ekstrakcja wydarzeń do osi czasu z JSONa
            const attractionsData = JSON.parse(currentFound.attractions_data || '{}');
            let events = attractionsData.customTimeline || [];
            
            // Jeśli nie ma customowej osi, generujemy prowizoryczną na podstawie danych
            if (events.length === 0) {
              const transportData = JSON.parse(currentFound.transport_data || '{}');
              const lodgingData = JSON.parse(currentFound.lodging_data || '{}');
              
              events = [
                { id: '1', type: 'DEPARTURE', title: t.defaultDepartureTitle.replace('{{destination}}', currentFound.destination), timeStr: '08:00', dateStr: currentFound.start_date, subtitle: transportData.selectedOption?.provider || t.defaultTransportSubtitle },
                { id: '2', type: 'LODGING', title: t.defaultLodgingTitle, timeStr: '14:00', dateStr: currentFound.start_date, subtitle: lodgingData.lodgingAddress || t.defaultLodgingSubtitle },
              ];
              
              const selectedAttrs = attractionsData.selected || [];
              selectedAttrs.forEach((attr: any, idx: number) => {
                const attrTitle = typeof attr === 'string' ? attr : (attr.name || attr.title || `Atrakcja ${idx + 1}`);
                events.push({ id: `a${idx}`, type: 'ATTRACTION', title: attrTitle, timeStr: `${15 + idx}:00`, dateStr: currentFound.start_date, subtitle: t.defaultAttractionSubtitle });
              });
            }
            setActiveTimeline(events);
          } else {
            setActiveTrip(null);
          }

        } catch (error) {
          console.error('Błąd weryfikacji aktywnej podróży:', error);
        }
      };

      fetchActiveTrip();
    }, [user?.id])
  );

  const activeEventIndex = useMemo(() => {
    if (!activeTimeline || activeTimeline.length === 0) return -1;

    // 1. Sprawdź czy którekolwiek wydarzenie ma jawny status IN_PROGRESS lub isCurrent
    const explicitIdx = activeTimeline.findIndex(
      (e) => e.status === 'IN_PROGRESS' || e.status === 'in_progress' || e.isCurrent === true
    );
    if (explicitIdx !== -1) return explicitIdx;

    // 2. Wyszukaj punkt najbliższy obecnej dacie i godzinie
    const nowMs = Date.now();
    let closestIdx = 0;
    let minDiff = Infinity;

    activeTimeline.forEach((ev, idx) => {
      const evDate = parseEventDateTime(ev.dateStr || activeTrip?.start_date, ev.timeStr || ev.time);
      const diff = Math.abs(nowMs - evDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    return closestIdx;
  }, [activeTimeline, activeTrip]);

  const availableSuggestions = useMemo(() => {
    if (!activeTrip) return [];
    const usedTitles = (activeTimeline || []).map(e => (e.title || '').trim().toLowerCase());
    
    // 1. Sprawdź pulę zapisaną w bazie (attractions_data.pool)
    const attractionsData = JSON.parse(activeTrip.attractions_data || '{}');
    const rawPool: Array<{ id?: string; name: string; imageUrl?: string }> = attractionsData.pool || [];
    
    const candidates: Array<{ id: string; name: string; subtitle?: string; imageUrl?: string }> = [];

    rawPool.forEach((p, idx) => {
      if (p.name && !usedTitles.includes(p.name.trim().toLowerCase())) {
        candidates.push({
          id: p.id || `pool_${idx}`,
          name: p.name,
          subtitle: language === 'pl' ? 'Rekomendowane miejsce' : 'Recommended attraction',
          imageUrl: p.imageUrl,
        });
      }
    });

    // 2. Dodaj propozycje z bazy popularnych atrakcji jeśli brakuje
    const destKey = (activeTrip.destination || '').toLowerCase().trim();
    for (const [key, items] of Object.entries(POPULAR_DESTINATION_ATTRACTIONS)) {
      if (destKey.includes(key)) {
        items.forEach((item, idx) => {
          if (!usedTitles.includes(item.name.toLowerCase()) && !candidates.some(c => c.name.toLowerCase() === item.name.toLowerCase())) {
            candidates.push({
              id: `curated_${key}_${idx}`,
              name: item.name,
              subtitle: item.subtitle,
              imageUrl: item.imageUrl,
            });
          }
        });
      }
    }

    return candidates;
  }, [activeTrip, activeTimeline, language]);

  const handleOpenAddModal = () => {
    setManualDate(activeTrip?.start_date || '');
    const nextHour = Math.min(22, 10 + (activeTimeline.length % 11));
    setManualTime(nextHour < 10 ? `0${nextHour}:00` : `${nextHour}:00`);
    setManualTitle('');
    setManualSubtitle('');
    setIsAddModalVisible(true);
  };

  const handleAddSuggestedAttraction = async (item: { name: string; subtitle?: string; imageUrl?: string }) => {
    const newId = 'attr_' + Date.now();
    const nextHour = Math.min(22, 10 + (activeTimeline.length % 11));
    const formattedHour = nextHour < 10 ? `0${nextHour}:00` : `${nextHour}:00`;
    const newEvent = {
      id: newId,
      type: 'ATTRACTION',
      title: item.name,
      timeStr: formattedHour,
      dateStr: activeTrip?.start_date || '',
      subtitle: item.subtitle || (language === 'pl' ? 'Polecane miejsce' : 'Recommended attraction'),
    };
    const updated = [...activeTimeline, newEvent];
    setActiveTimeline(updated);
    setExpandedEventId(newId);
    setHasUnsavedChanges(true);
    setIsAddModalVisible(false);

    try {
      const isUserGuest = user?.isGuest || !user;
      const currentAttractions = JSON.parse(activeTrip?.attractions_data || '{}');
      const updatedAttractions = {
        ...currentAttractions,
        customTimeline: updated,
      };
      if (isUserGuest) {
        await db.execute('UPDATE trips SET attractions_data = ? WHERE id = ?', [
          JSON.stringify(updatedAttractions),
          activeTrip.id,
        ]);
      } else {
        await db.execute('UPDATE trips SET attractions_data = ? WHERE id = ?', [
          JSON.stringify(updatedAttractions),
          activeTrip.id,
        ]);
        await supabase
          .from('trips')
          .update({ attractions_data: JSON.stringify(updatedAttractions) })
          .eq('id', activeTrip.id);
      }
    } catch (err) {
      console.warn('Błąd zapisu nowej atrakcji:', err);
    }
  };

  const handleAddManualAttraction = async () => {
    if (!manualTitle.trim()) {
      Alert.alert(commonT.label_error || 'Błąd', language === 'pl' ? 'Wprowadź nazwę atrakcji' : 'Please enter an attraction title');
      return;
    }
    const newId = 'attr_' + Date.now();
    const newEvent = {
      id: newId,
      type: 'ATTRACTION',
      title: manualTitle.trim(),
      timeStr: manualTime.trim() || '15:00',
      dateStr: manualDate.trim() || activeTrip?.start_date || '',
      subtitle: manualSubtitle.trim() || (language === 'pl' ? 'Własny punkt zwiedzania' : 'Custom sightseeing spot'),
    };
    const updated = [...activeTimeline, newEvent];
    setActiveTimeline(updated);
    setExpandedEventId(newId);
    setHasUnsavedChanges(true);
    setManualTitle('');
    setManualSubtitle('');
    setIsAddModalVisible(false);

    try {
      const isUserGuest = user?.isGuest || !user;
      const currentAttractions = JSON.parse(activeTrip?.attractions_data || '{}');
      const updatedAttractions = {
        ...currentAttractions,
        customTimeline: updated,
      };
      if (isUserGuest) {
        await db.execute('UPDATE trips SET attractions_data = ? WHERE id = ?', [
          JSON.stringify(updatedAttractions),
          activeTrip.id,
        ]);
      } else {
        await db.execute('UPDATE trips SET attractions_data = ? WHERE id = ?', [
          JSON.stringify(updatedAttractions),
          activeTrip.id,
        ]);
        await supabase
          .from('trips')
          .update({ attractions_data: JSON.stringify(updatedAttractions) })
          .eq('id', activeTrip.id);
      }
    } catch (err) {
      console.warn('Błąd zapisu własnej atrakcji:', err);
    }
  };

  const handleFromAmountChange = (val: string) => {
    setFromAmount(val);
    setToAmount(convertCurrency(val, fromCurrency, toCurrency));
  };

  const handleToAmountChange = (val: string) => {
    setToAmount(val);
    setFromAmount(convertCurrency(val, toCurrency, fromCurrency));
  };

  const handleSwapCurrencies = () => {
    const prevFrom = fromCurrency;
    const prevTo = toCurrency;
    setFromCurrency(prevTo);
    setToCurrency(prevFrom);
    setToAmount(convertCurrency(fromAmount, prevTo, prevFrom));
  };

  const renderTimelineIcon = (type?: string) => {
    switch (type) {
      case 'DEPARTURE':
        return <Ionicons name="airplane" size={13} color="#38BDF8" />;
      case 'LODGING':
        return <Ionicons name="bed" size={13} color="#A855F7" />;
      case 'ATTRACTION':
        return <Ionicons name="camera" size={13} color="#F59E0B" />;
      case 'RETURN':
        return <Ionicons name="airplane-outline" size={13} color="#94A3B8" />;
      default:
        return <Ionicons name="location" size={13} color="#38BDF8" />;
    }
  };

  // --- ZARZĄDZANIE OSIĄ CZASU ---
  const handleEventEdit = (id: string, field: string, value: string) => {
    const updatedEvents = activeTimeline.map(evt => {
      if (evt.id === id) {
        return { ...evt, [field]: value };
      }
      return evt;
    });
    setActiveTimeline(updatedEvents);
    setHasUnsavedChanges(true);
  };

  const moveEvent = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === activeTimeline.length - 1) return;
    const newEvents = [...activeTimeline];
    const swapIndex = direction === 'UP' ? index - 1 : index + 1;
    
    const temp = newEvents[index];
    newEvents[index] = newEvents[swapIndex];
    newEvents[swapIndex] = temp;
    
    setActiveTimeline(newEvents);
    setHasUnsavedChanges(true);
  };

  const deleteEvent = (id: string) => {
    Alert.alert(t.deletePointTitle, t.deletePointMessage, [
      { text: commonT.button_cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: () => {
        const newEvents = activeTimeline.filter(e => e.id !== id);
        setActiveTimeline(newEvents);
        setHasUnsavedChanges(true);
      }}
    ]);
  };

  const saveTimelineChanges = async () => {
    if (!activeTrip) return;
    try {
      const isUserGuest = user?.isGuest || !user;
      const currentAttractions = JSON.parse(activeTrip.attractions_data || '{}');
      const updatedAttractions = {
        ...currentAttractions,
        customTimeline: activeTimeline
      };

      if (isUserGuest) {
        await db.execute(
          'UPDATE trips SET attractions_data = ? WHERE id = ?',
          [JSON.stringify(updatedAttractions), activeTrip.id]
        );
      } else {
        await db.execute(
          'UPDATE trips SET attractions_data = ? WHERE id = ?',
          [JSON.stringify(updatedAttractions), activeTrip.id]
        );
        const { error } = await supabase
          .from('trips')
          .update({ attractions_data: JSON.stringify(updatedAttractions) })
          .eq('id', activeTrip.id);
        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      Alert.alert(commonT.saveSuccess, t.saveSuccess);
    } catch (e) {
      console.error(e);
      Alert.alert(commonT.label_error, t.saveError);
    }
  };

  // ==========================================
  // WIDOK 1: TRWAJĄCA PODRÓŻ (REFRACTORED DESIGN)
  // ==========================================
  if (activeTrip) {
    const currentRate = (EXCHANGE_RATES[fromCurrency] || 1) / (EXCHANGE_RATES[toCurrency] || 1);
    const rateFormatted = currentRate < 0.05 ? currentRate.toFixed(4) : currentRate.toFixed(2);
    const rateFooterText = (t.currencyRateFooter || 'Kurs: 1 {{from}} = {{rate}} {{to}} • Zaktualizowano 10 min temu')
      .replace('{{from}}', fromCurrency)
      .replace('{{rate}}', rateFormatted)
      .replace('{{to}}', toCurrency);

    const emergencyNum = getEmergencyNumber(activeTrip.destination);
    const destinationLabel = destinationNames[activeTrip.destination] || activeTrip.destination || 'Wyprawa';

    return (
      <SafeAreaView edges={['top']} style={styles.activeContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0B1120" />
        <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          
          {/* LOGO DESTIVO NA GÓRZE NA ŚRODKU */}
          <View style={styles.topLogoContainer}>
            <Image
              source={require('../../assets/logo/NapisKropkaBialy.png')}
              style={styles.topLogo}
              resizeMode="contain"
              testID="destivo-top-logo"
            />
          </View>

          {/* HEADER I SZYBKIE AKCJE (CZYSTE CIEMNE TŁO) */}
          <View style={styles.activeTripHeaderCard}>
            <Text style={styles.headerTripTitle}>
              {(t.tripToDay || 'Podróż do {{destination}}: Dzień {{day}}')
                .replace('{{destination}}', destinationLabel)
                .replace('{{day}}', getTripDayNumber(activeTrip.start_date).toString())}
            </Text>
            <Text style={styles.headerLocationSubtitle}>
              {(t.currentLocationPrefix || 'Bieżąca lokalizacja: {{location}}')
                .replace('{{location}}', destinationLabel)}
            </Text>

            <View style={styles.topQuickActionsRow}>
              <TouchableOpacity
                style={styles.addAttractionTopBtn}
                activeOpacity={0.8}
                onPress={handleOpenAddModal}
              >
                <Ionicons name="add" size={16} color="#0F172A" style={{ marginRight: 4 }} />
                <Text style={styles.addAttractionTopBtnText}>{t.addAttractionBtn || 'Dodaj atrakcję'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.safeVaultTopBtn}
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Vault', { tripId: activeTrip.id })}
              >
                <Ionicons name="shield-checkmark" size={15} color="#38BDF8" style={{ marginRight: 6 }} />
                <Text style={styles.safeVaultTopBtnText}>{t.safeVaultBtn || 'Sejf / Dokumenty'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* OŚ CZASU (DAILY ITINERARY) */}
          <View style={styles.itinerarySection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="calendar-outline" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>{t.dailyItineraryTitle || 'Plan Dnia'}</Text>
            </View>
            
            <View style={styles.timelineWrapper}>
              <View style={styles.timelineLineAbsolute} />
              
              {activeTimeline.map((item, index) => {
                const isExpanded = expandedEventId === item.id;
                const isPast = index < activeEventIndex;
                const isInProgress = index === activeEventIndex;
                const isFuture = index > activeEventIndex;
                const eventTime = item.timeStr || item.time || '12:00';
                const eventSubtitle = item.subtitle || item.description || (item.type === 'LODGING' ? t.defaultLodgingSubtitle : t.defaultAttractionSubtitle);

                return (
                  <View key={item.id || index} style={styles.timelineRow}>
                    {/* WĘZEŁ NA OSI */}
                    <View style={styles.nodeColumn}>
                      {isPast ? (
                        <View style={[styles.nodeCircle, styles.nodeCirclePast]}>
                          <Ionicons name="checkmark" size={12} color="#0F172A" />
                        </View>
                      ) : isInProgress ? (
                        <View style={[styles.nodeCircle, styles.nodeCircleActive]}>
                          <View style={styles.nodeActiveInnerDot} />
                        </View>
                      ) : (
                        <View style={[styles.nodeCircle, styles.nodeCircleFuture]}>
                          <View style={styles.nodeFutureInnerDot} />
                        </View>
                      )}
                    </View>
                    
                    {/* KARTA WYDARZENIA */}
                    <TouchableOpacity 
                      style={[
                        styles.timelineCard,
                        isPast && styles.timelineCardPast,
                        isInProgress && styles.timelineCardActive,
                        isExpanded && styles.eventCardExpanded
                      ]} 
                      activeOpacity={0.85} 
                      onPress={() => setExpandedEventId(isExpanded ? null : item.id)}
                    >
                      {/* BADGE "IN PROGRESS" I POGODA DLA AKTYWNEGO */}
                      {isInProgress && (
                        <View style={styles.inProgressHeaderRow}>
                          <View style={styles.inProgressBadge}>
                            <Text style={styles.inProgressBadgeText}>{t.inProgressBadge || 'IN PROGRESS'}</Text>
                          </View>
                          <View style={styles.inProgressWeather}>
                            <Ionicons name="sunny" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.inProgressWeatherText}>24°C</Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.cardHeaderFlex}>
                        <View style={styles.cardTitleRow}>
                          <View style={styles.cardTypeIconWrap}>
                            {renderTimelineIcon(item.type)}
                          </View>
                          <Text 
                            style={[
                              styles.cardTitle,
                              isPast && styles.cardTitlePast,
                              isInProgress && styles.cardTitleActive,
                              isFuture && styles.cardTitleFuture
                            ]}
                          >
                            {item.title}
                          </Text>
                        </View>
                        <Ionicons name="pencil-outline" size={15} color="#64748B" />
                      </View>

                      <Text 
                        style={[
                          styles.cardTime,
                          isPast && styles.cardTimePast,
                          isInProgress && styles.cardTimeActive,
                          isFuture && styles.cardTimeFuture
                        ]}
                      >
                        {eventTime} • {item.type === 'LODGING' ? t.lodgingCheckIn : t.timelinePoint}
                      </Text>

                      <Text 
                        style={[
                          styles.cardDesc,
                          isPast && styles.cardDescPast,
                          isInProgress && styles.cardDescActive,
                          isFuture && styles.cardDescFuture
                        ]} 
                        numberOfLines={isExpanded ? 0 : 2}
                      >
                        {eventSubtitle}
                      </Text>

                      {/* PRZYCISKI AKCJI "DIRECTIONS" I "TICKETS" DLA IN PROGRESS */}
                      {isInProgress && (
                        <View style={styles.inProgressActionsRow}>
                          <TouchableOpacity
                            style={styles.inProgressDirectionsBtn}
                            activeOpacity={0.8}
                            onPress={() => {
                              const query = encodeURIComponent(`${item.title}, ${activeTrip.destination || ''}`);
                              Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
                            }}
                          >
                            <Ionicons name="navigate-outline" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                            <Text style={styles.inProgressDirectionsBtnText}>{t.directionsBtn || 'Trasa'}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.inProgressTicketsBtn}
                            activeOpacity={0.8}
                            onPress={() => navigation?.navigate('Vault', { tripId: activeTrip.id })}
                          >
                            <Ionicons name="ticket-outline" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                            <Text style={styles.inProgressTicketsBtnText}>{t.ticketsBtn || 'Bilety'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* SEKCJA ROZWIJANA (EDYCJA) */}
                      {isExpanded && (
                        <View style={styles.expandedSection}>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t.dateLabel}</Text>
                            <TextInput 
                              style={styles.input} 
                              value={item.dateStr} 
                              onChangeText={(val) => handleEventEdit(item.id, 'dateStr', val)}
                            />
                          </View>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t.timeLabel}</Text>
                            <TextInput 
                              style={styles.input} 
                              value={item.timeStr} 
                              onChangeText={(val) => handleEventEdit(item.id, 'timeStr', val)}
                            />
                          </View>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t.eventTitleLabel}</Text>
                            <TextInput 
                              style={styles.input} 
                              value={item.title} 
                              onChangeText={(val) => handleEventEdit(item.id, 'title', val)}
                            />
                          </View>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t.eventSubtitleLabel}</Text>
                            <TextInput 
                              style={styles.input} 
                              value={item.subtitle} 
                              onChangeText={(val) => handleEventEdit(item.id, 'subtitle', val)}
                            />
                          </View>
                          
                          {/* PRZYCISKI AKCJI (USUŃ I PRZESUŃ) */}
                          <View style={styles.cardActionsRow}>
                            <View style={styles.moveActions}>
                              <TouchableOpacity style={[styles.actionBtn, index === 0 && styles.actionBtnDisabled]} onPress={() => moveEvent(index, 'UP')}>
                                <Ionicons name="chevron-up" size={15} color={index === 0 ? "#475569" : "#94A3B8"} />
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.actionBtn, index === activeTimeline.length - 1 && styles.actionBtnDisabled]} onPress={() => moveEvent(index, 'DOWN')}>
                                <Ionicons name="chevron-down" size={15} color={index === activeTimeline.length - 1 ? "#475569" : "#94A3B8"} />
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteEvent(item.id)}>
                              <Text style={styles.deleteBtnText}>{t.delete}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>

          {/* INTERAKTYWNY KALKULATOR WALUT */}
          <View style={styles.converterSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="cash-outline" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>{t.currencyConverterTitle || 'Kalkulator Walut'}</Text>
            </View>
            <View style={styles.converterCard}>
              <View style={styles.converterRow}>
                {/* Pole waluty bazowej */}
                <View style={styles.converterInputCol}>
                  <TouchableOpacity
                    style={styles.currencyPill}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCurrencySelectingSide('FROM');
                      setIsCurrencyModalVisible(true);
                    }}
                  >
                    <Text style={styles.currencyPillText}>{fromCurrency}</Text>
                    <Ionicons name="chevron-down" size={12} color="#94A3B8" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.converterTextInput}
                    keyboardType="numeric"
                    value={fromAmount}
                    onChangeText={handleFromAmountChange}
                    placeholder="0"
                    placeholderTextColor="#475569"
                  />
                </View>

                {/* Przycisk odwrócenia walut */}
                <TouchableOpacity
                  style={styles.swapCircleBtn}
                  activeOpacity={0.8}
                  onPress={handleSwapCurrencies}
                >
                  <Ionicons name="swap-horizontal" size={18} color="#0F172A" />
                </TouchableOpacity>

                {/* Pole waluty docelowej */}
                <View style={styles.converterInputCol}>
                  <TouchableOpacity
                    style={styles.currencyPill}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCurrencySelectingSide('TO');
                      setIsCurrencyModalVisible(true);
                    }}
                  >
                    <Text style={styles.currencyPillText}>{toCurrency}</Text>
                    <Ionicons name="chevron-down" size={12} color="#94A3B8" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.converterTextInput}
                    keyboardType="numeric"
                    value={toAmount}
                    onChangeText={handleToAmountChange}
                    placeholder="0"
                    placeholderTextColor="#475569"
                  />
                </View>
              </View>

              {/* Informacja o kursie */}
              <View style={styles.rateFooterBox}>
                <Text style={styles.rateFooterLabel}>{rateFooterText}</Text>
              </View>
            </View>
          </View>

          {/* WSPARCIE ALARMOWE (EMERGENCY SUPPORT) */}
          <View style={styles.emergencySection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="warning-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>{t.emergencySupportTitle || 'Wsparcie Alarmowe'}</Text>
            </View>

            {/* Lokalny numer alarmowy */}
            <View style={styles.emergencyRowCard}>
              <View style={styles.emergencyIconBubble}>
                <Ionicons name="call" size={18} color="#EF4444" />
              </View>
              <View style={styles.emergencyTextCol}>
                <Text style={styles.emergencyCardTitle}>
                  {(t.localEmergencyTitle || 'Lokalny numer alarmowy ({{number}})')
                    .replace('{{number}}', emergencyNum)}
                </Text>
                <Text style={styles.emergencyCardSubtitle}>
                  {t.localEmergencySubtitle || 'Policja • Pogotowie • Straż pożarna'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.emergencyCallBtn}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(`tel:${emergencyNum}`)}
              >
                <Ionicons name="call" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.emergencyCallBtnText}>{emergencyNum}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>

        {/* MODAL DODAWANIA ATRAKCJI (PROPOZYCJE I RĘCZNE) */}
        <Modal
          visible={isAddModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setIsAddModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addModalDialog}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="sparkles" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={styles.modalDialogTitle}>{t.addAttractionModalTitle || 'Dodaj punkt w trasie'}</Text>
                </View>
                <TouchableOpacity onPress={() => setIsAddModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                {/* SEKCJA 1: PROPOZYCJE Z OKOLICY */}
                <View style={styles.addSectionWrap}>
                  <Text style={styles.addSectionTitle}>{t.suggestions || 'Propozycje z okolicy'}</Text>
                  <Text style={styles.addSectionSubtitle}>{t.suggestionsHint || 'Kliknij, aby błyskawicznie dodać do planu.'}</Text>
                  
                  {availableSuggestions.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScrollContent}>
                      {availableSuggestions.map((sug) => (
                        <View key={sug.id} style={styles.suggestionCard}>
                          {sug.imageUrl ? (
                            <Image source={{ uri: sug.imageUrl }} style={styles.suggestionCardImage} />
                          ) : (
                            <View style={styles.suggestionImagePlaceholder}>
                              <Ionicons name="image-outline" size={24} color="#64748B" />
                            </View>
                          )}
                          <View style={styles.suggestionCardBody}>
                            <Text style={styles.suggestionCardTitle} numberOfLines={1}>{sug.name}</Text>
                            <Text style={styles.suggestionCardSubtitle} numberOfLines={1}>{sug.subtitle || t.defaultAttractionSubtitle}</Text>
                            <TouchableOpacity
                              style={styles.suggestionAddBtn}
                              activeOpacity={0.8}
                              onPress={() => handleAddSuggestedAttraction(sug)}
                            >
                              <Ionicons name="add" size={14} color="#0F172A" style={{ marginRight: 4 }} />
                              <Text style={styles.suggestionAddBtnText}>{language === 'pl' ? 'Dodaj' : 'Add'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.noSuggestionsBox}>
                      <Text style={styles.noSuggestionsText}>{t.noSuggestions || 'Brak więcej propozycji w okolicy.'}</Text>
                    </View>
                  )}
                </View>

                {/* SEKCJA 2: RĘCZNE DODAWANIE */}
                <View style={styles.addSectionWrap}>
                  <Text style={styles.addSectionTitle}>{t.manual || 'Dodaj własne ręcznie'}</Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.titleLabel || 'Tytuł *'}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t.titlePlaceholder || 'np. Obiad w restauracji'}
                      placeholderTextColor="#475569"
                      value={manualTitle}
                      onChangeText={setManualTitle}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.eventSubtitleLabel || 'Podtytuł / Opis'}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={language === 'pl' ? 'np. Włoska kuchnia' : 'e.g. Italian cuisine'}
                      placeholderTextColor="#475569"
                      value={manualSubtitle}
                      onChangeText={setManualSubtitle}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t.dateLabel || 'Data'}</Text>
                      <TextInput
                        style={styles.input}
                        value={manualDate}
                        onChangeText={setManualDate}
                        placeholder={activeTrip?.start_date || 'DD-MM-YYYY'}
                        placeholderTextColor="#475569"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t.timeLabel || 'Godzina'}</Text>
                      <TextInput
                        style={styles.input}
                        value={manualTime}
                        onChangeText={setManualTime}
                        placeholder="15:00"
                        placeholderTextColor="#475569"
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.manualSubmitBtn}
                    activeOpacity={0.8}
                    onPress={handleAddManualAttraction}
                  >
                    <Ionicons name="add-circle" size={16} color="#0F172A" style={{ marginRight: 6 }} />
                    <Text style={styles.manualSubmitBtnText}>{language === 'pl' ? 'Dodaj do planu' : 'Add to itinerary'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL WYBORU WALUTY */}
        <Modal
          visible={isCurrencyModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsCurrencyModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalDialog}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalDialogTitle}>{t.selectCurrency || 'Wybierz walutę'}</Text>
                <TouchableOpacity onPress={() => setIsCurrencyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {CURRENCY_LIST.map((curr) => {
                  const currentSelected = currencySelectingSide === 'FROM' ? fromCurrency : toCurrency;
                  const isSelected = currentSelected === curr.code;
                  return (
                    <TouchableOpacity
                      key={curr.code}
                      style={[styles.currencyRowItem, isSelected && styles.currencyRowItemSelected]}
                      onPress={() => {
                        if (currencySelectingSide === 'FROM') {
                          setFromCurrency(curr.code);
                          setToAmount(convertCurrency(fromAmount, curr.code, toCurrency));
                        } else {
                          setToCurrency(curr.code);
                          setToAmount(convertCurrency(fromAmount, fromCurrency, curr.code));
                        }
                        setIsCurrencyModalVisible(false);
                      }}
                    >
                      <Text style={styles.currencyFlagText}>{curr.flag}</Text>
                      <Text style={styles.currencyCodeText}>{curr.code}</Text>
                      <Text style={styles.currencyLabelText}>{curr.label}</Text>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#F59E0B" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* PRZYCISK ZAPISU OSI CZASU */}
        {hasUnsavedChanges && (
          <View style={styles.saveFooter}>
            <TouchableOpacity style={styles.saveButton} onPress={saveTimelineChanges}>
              <Text style={styles.saveButtonText}>{t.saveTimelineLayout}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ==========================================
  // WIDOK 2: STANDARDOWY EKRAN GŁÓWNY (EXPLORE)
  // ==========================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        
        {/* LOGO DESTIVO NA GÓRZE NA ŚRODKU */}
        <View style={styles.topLogoContainer}>
          <Image
            source={require('../../assets/logo/NapisKropkaBialy.png')}
            style={styles.topLogo}
            resizeMode="contain"
            testID="destivo-top-logo"
          />
        </View>

        <View style={styles.header}>
          <Text style={styles.welcomeText}>
            {isGuest ? t.header_greetingGuest : `${t.header_greetingUser}, ${userName}!`}
          </Text>
          <Text style={styles.subText}>{t.header_subtitle}</Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8} onPress={() => navigation?.navigate('TripCreator')}>
            <Text style={styles.primaryButtonText}>{t.button_planNewTrip}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8} onPress={() => navigation?.navigate('Trips')}>
            <Text style={styles.secondaryButtonText}>{t.button_goToMyTrips}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.section_liveTitle}</Text>
          <Text style={styles.sectionSubtitle}>{t.section_liveSubtitle}</Text>
          
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={styles.loaderText}>{t.loader_explore}</Text>
            </View>
          ) : (
            <View style={styles.exploreProjectsContainer}>
              {recommendations.length > 0 ? recommendations.map((dest) => (
                <TouchableOpacity
                  key={dest.id}
                  activeOpacity={0.92}
                  style={styles.exploreCardWrapper}
                  onPress={() => navigation?.navigate('ExploreDetails', { destData: dest })}
                >
                  <ImageBackground
                    source={{ uri: dest.coverImage }}
                    style={styles.exploreProjectCard}
                    imageStyle={styles.exploreProjectCardImage}
                  >
                    {/* Górny pasek z badge'ami */}
                    <View style={styles.cardTopBadgesRow}>
                      <View style={[
                        styles.planBadge,
                        dest.hasPredefinedPlan
                          ? styles.planBadgeReady
                          : dest.recommendedTransport === 'train'
                            ? styles.planBadgeTrain
                            : dest.recommendedTransport === 'car'
                              ? styles.planBadgeCar
                              : styles.planBadgeDeal
                      ]}>
                        <Text style={styles.planBadgeText}>
                          {dest.hasPredefinedPlan
                            ? t.readyPlanBadge
                            : dest.recommendedTransport === 'train'
                              ? t.routeTrainBadge
                              : dest.recommendedTransport === 'car'
                                ? t.routeCarBadge
                                : t.routeFlightBadge}
                        </Text>
                      </View>
                      {dest.proposedTrip && (
                        <View style={styles.weatherBadge}>
                          <Text style={styles.weatherText}>
                            ☀️ ~{dest.proposedTrip.estimatedTemp}°C • {dest.proposedTrip.startDate.slice(0, 5)} - {dest.proposedTrip.endDate.slice(0, 5)}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Dolny pasek (cardOverlay) - 100% szerokości zdjęcia */}
                    <View style={styles.cardOverlay}>
                      <View style={styles.cardOverlayHeader}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.cardCity}>{destinationNames[dest.city] || dest.city}</Text>
                          <Text style={styles.cardCountry}>
                            {dest.country} • {dest.distanceKm} {t.distanceFromYou}
                          </Text>
                        </View>
                        {/* Transport Pill zamiast ceny */}
                        <View style={styles.transportPillBox}>
                          {dest.recommendedTransport === 'flight' ? (
                            <>
                              <Text style={styles.transportPillMode}>✈️ {t.transportPill_flight || 'Lot'}</Text>
                              <Text style={styles.transportPillDetail}>
                                {(t.fromAirport || 'z {{airport}}').replace('{{airport}}', dest.nearestAirport || 'WAW')}
                              </Text>
                            </>
                          ) : dest.recommendedTransport === 'train' ? (
                            <>
                              <Text style={styles.transportPillMode}>🚆 {t.transportPill_train || 'Pociąg'}</Text>
                              <Text style={styles.transportPillDetail}>Koleo</Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.transportPillMode}>🚗 {t.transportPill_car || 'Auto'}</Text>
                              <Text style={styles.transportPillDetail}>{dest.distanceKm} km</Text>
                            </>
                          )}
                        </View>
                      </View>

                      <View style={styles.cardPlanFooterRow}>
                        <Text style={styles.cardPlanNotice}>
                          {dest.hasPredefinedPlan
                            ? (t.readyPlanDays || '✨ {{days}}-dniowy gotowy plan wycieczki').replace(
                                '{{days}}',
                                String(dest.proposedTrip?.durationDays || 3)
                              )
                            : `🛠️ ${t.noPlanNotice || 'Wymaga własnego planu w kreatorze'}`}
                        </Text>
                        <Text style={styles.cardExploreArrow}>➔</Text>
                      </View>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              )) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>{t.empty_recommendations}</Text>
                </View>
              )}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // --- WSPÓLNE ---
  safeArea: { flex: 1, backgroundColor: '#0B1120' },
  container: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  topLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  topLogo: {
    width: 120,
    height: 28,
  },
  
  // --- STANDARDOWY HOME ---
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  welcomeText: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  subText: { fontSize: 15, color: '#94A3B8', marginTop: 4, fontWeight: '400' },
  actionsContainer: { paddingHorizontal: 24, marginTop: 10, gap: 14 },
  primaryButton: { backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#1E293B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  secondaryButtonText: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
  section: { marginTop: 32, flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', paddingHorizontal: 24 },
  sectionSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, marginBottom: 16, paddingHorizontal: 24 },
  exploreProjectsContainer: { gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
  exploreList: { flex: 1 },
  exploreCardWrapper: {
    width: CARD_WIDTH,
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 5,
  },
  exploreProjectCard: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  exploreProjectCardImage: {
    borderRadius: 19,
  },
  cardTopBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  planBadgeReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    borderColor: '#10B981',
  },
  planBadgeTrain: {
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    borderColor: '#6366F1',
  },
  planBadgeCar: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    borderColor: '#F59E0B',
  },
  planBadgeDeal: {
    backgroundColor: 'rgba(56, 189, 248, 0.9)',
    borderColor: '#38BDF8',
  },
  planBadgeText: {
    color: '#0B1120',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  weatherBadge: {
    backgroundColor: 'rgba(11, 17, 32, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  weatherText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  cardOverlay: {
    width: '100%',
    backgroundColor: 'rgba(11, 17, 32, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCity: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  cardCountry: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  transportPillBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  transportPillMode: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  transportPillDetail: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  cardPlanFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardPlanNotice: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  cardExploreArrow: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '900',
  },
  loaderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50 },
  loaderText: { color: '#94A3B8', marginTop: 14, fontSize: 14, fontWeight: '600' },
  emptyCard: { width: CARD_WIDTH, height: 350, backgroundColor: '#111827', borderRadius: 18, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyCardText: { color: '#94A3B8', textAlign: 'center', fontSize: 14, lineHeight: 20 },

  // ==========================================
  // STYLIZACJA AKTYWNEJ PODRÓŻY (NEW DESIGN)
  // ==========================================
  activeContainer: { flex: 1, backgroundColor: '#0B1120' },
  
  // Header & Quick Actions
  activeTripHeaderCard: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, backgroundColor: '#0B1120' },
  headerTripTitle: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3, marginBottom: 4 },
  headerLocationSubtitle: { fontSize: 14, color: '#94A3B8', fontWeight: '500', marginBottom: 18 },
  topQuickActionsRow: { flexDirection: 'row', gap: 12 },
  addAttractionTopBtn: { flex: 1, backgroundColor: '#F59E0B', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  addAttractionTopBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  safeVaultTopBtn: { flex: 1, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  safeVaultTopBtnText: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },

  // Itinerary & Timeline
  itinerarySection: { paddingHorizontal: 20, paddingTop: 10, marginTop: 6 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionHeaderTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  timelineWrapper: { position: 'relative' },
  timelineLineAbsolute: { position: 'absolute', left: 21, top: 20, bottom: 20, width: 2, backgroundColor: '#1E293B', zIndex: 0 },
  timelineRow: { flexDirection: 'row', marginBottom: 18, alignItems: 'flex-start' },
  nodeColumn: { width: 44, alignItems: 'center', zIndex: 10, paddingTop: 6 },
  
  // Node states
  nodeCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  nodeCirclePast: { backgroundColor: '#F59E0B', borderWidth: 1.5, borderColor: '#F59E0B' },
  nodePastCheck: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
  nodeCircleActive: { backgroundColor: '#1E293B', borderWidth: 2.5, borderColor: '#F59E0B' },
  nodeActiveInnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' },
  nodeCircleFuture: { backgroundColor: '#0B1120', borderWidth: 2, borderColor: '#334155' },
  nodeFutureInnerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },

  // Cards
  timelineCard: { flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  timelineCardPast: { backgroundColor: '#0D1424', borderColor: '#1A2333', opacity: 0.8 },
  timelineCardActive: { backgroundColor: '#131D31', borderColor: '#F59E0B', borderWidth: 1.5, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  eventCardExpanded: { borderColor: '#38BDF8' },

  cardHeaderFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardTypeIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(56, 189, 248, 0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', flex: 1 },
  cardTitlePast: { color: '#64748B' },
  cardTitleActive: { color: '#FFFFFF', fontWeight: '800' },
  cardTitleFuture: { color: '#94A3B8' },
  editIcon: { fontSize: 13, opacity: 0.4 },

  cardTime: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  cardTimePast: { color: '#64748B' },
  cardTimeActive: { color: '#F59E0B', fontWeight: '800' },
  cardTimeFuture: { color: '#64748B' },

  cardDesc: { fontSize: 13, lineHeight: 18 },
  cardDescPast: { color: '#475569' },
  cardDescActive: { color: '#CBD5E1' },
  cardDescFuture: { color: '#64748B' },

  // In Progress specifics
  inProgressHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inProgressBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  inProgressBadgeText: { color: '#F59E0B', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  inProgressWeather: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.8)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#334155' },
  inProgressWeatherText: { color: '#F8FAFC', fontSize: 11, fontWeight: '700' },

  inProgressActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(245, 158, 11, 0.2)' },
  inProgressDirectionsBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#F59E0B', paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inProgressDirectionsBtnText: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  inProgressTicketsBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inProgressTicketsBtnText: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },

  // Expanded edit section
  expandedSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12 },
  inputGroup: { marginBottom: 10 },
  inputLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  input: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#F8FAFC', fontSize: 13, paddingHorizontal: 10, height: 38 },
  cardActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  moveActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnDisabled: { opacity: 0.3 },
  actionBtnText: { color: '#F8FAFC', fontSize: 11, fontWeight: '600' },
  deleteBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  deleteBtnText: { color: '#F87171', fontSize: 11, fontWeight: '700' },

  // Currency Converter
  converterSection: { paddingHorizontal: 20, marginTop: 24 },
  converterCard: { backgroundColor: '#111827', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#1E293B' },
  converterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  converterInputCol: { flex: 1 },
  currencyPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  currencyPillText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  converterTextInput: { backgroundColor: '#0B1120', borderWidth: 1, borderColor: '#334155', borderRadius: 10, height: 44, paddingHorizontal: 12, color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  swapCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  rateFooterBox: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1E293B' },
  rateFooterLabel: { color: '#64748B', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // Emergency Support Widget
  emergencySection: { paddingHorizontal: 20, marginTop: 26 },
  emergencyRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1E293B' },
  emergencyIconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  emergencyTextCol: { flex: 1, marginRight: 8 },
  emergencyCardTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  emergencyCardSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
  emergencyCallBtn: { flexDirection: 'row', backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emergencyCallBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Add Attraction Modal
  addModalDialog: { width: '100%', backgroundColor: '#111827', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  addSectionWrap: { marginBottom: 20 },
  addSectionTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  addSectionSubtitle: { color: '#94A3B8', fontSize: 12, marginBottom: 12 },
  suggestionsScrollContent: { paddingVertical: 4, gap: 12 },
  suggestionCard: { width: 170, backgroundColor: '#0B1120', borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', overflow: 'hidden' },
  suggestionCardImage: { width: '100%', height: 95 },
  suggestionImagePlaceholder: { width: '100%', height: 95, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  suggestionCardBody: { padding: 10 },
  suggestionCardTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  suggestionCardSubtitle: { color: '#64748B', fontSize: 11, marginBottom: 10 },
  suggestionAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B', paddingVertical: 6, borderRadius: 8 },
  suggestionAddBtnText: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
  noSuggestionsBox: { backgroundColor: '#0B1120', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
  noSuggestionsText: { color: '#64748B', fontSize: 12, fontStyle: 'italic' },
  manualSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B', paddingVertical: 12, borderRadius: 10, marginTop: 6 },
  manualSubmitBtnText: { color: '#0F172A', fontSize: 13, fontWeight: '800' },

  // Modal Wyboru Waluty
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalDialog: { width: '100%', backgroundColor: '#111827', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#334155' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  modalDialogTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  currencyRowItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  currencyRowItemSelected: { backgroundColor: '#1E293B' },
  currencyFlagText: { fontSize: 20, marginRight: 12 },
  currencyCodeText: { color: '#F59E0B', fontSize: 14, fontWeight: '800', width: 48 },
  currencyLabelText: { color: '#F8FAFC', fontSize: 13, flex: 1 },

  // Save footer
  saveFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(11, 17, 32, 0.95)', borderTopWidth: 1, borderTopColor: '#1E293B' },
  saveButton: { backgroundColor: '#F59E0B', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' }
});