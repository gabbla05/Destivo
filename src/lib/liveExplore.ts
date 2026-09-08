import * as Location from 'expo-location';
import Constants from 'expo-constants';

const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY || '68a647f3b99a084c4a1c3809b971b034';
const GOOGLE_API_KEY = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '';

export interface TripDay {
  day: number;
  title: string;
  attractions: string[];
}

export interface ProposedTrip {
  startDate: string;
  endDate: string;
  durationDays: number;
  estimatedTemp: number;
  condition: string;
  crowdLevel: string;
  itinerary: TripDay[];
}

export interface LiveDestination {
  id: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  coverImage: string;
  shortDescription: string;
  transportCode: string;
  distanceKm?: number;
  recommendedTransport?: 'flight' | 'train' | 'car';
  proposedTrip?: ProposedTrip;
  weather?: { temp: number; condition: string; icon: string };
}

// BAZA DANYCH - TYLKO LOKALIZACJE (Reszta dociągana na żywo z API)
const DESTINATION_POOL: Omit<LiveDestination, 'proposedTrip' | 'weather' | 'distanceKm' | 'recommendedTransport'>[] = [
  // --- ORYGINALNE 7 MIAST ---
  { id: 'rome_01', city: 'Rzym', country: 'Włochy', lat: 41.9028, lon: 12.4964, coverImage: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=600', shortDescription: 'Wieczne Miasto. Idealne na wyjazd, gdzie historia antyczna przeplata się z najlepszą kuchnią świata.', transportCode: 'ROM' },
  { id: 'bcn_01', city: 'Barcelona', country: 'Hiszpania', lat: 41.3851, lon: 2.1734, coverImage: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&q=80&w=600', shortDescription: 'Zjawiskowa architektura Gaudiego, relaks na plaży i tętniące życiem uliczki. Katalonia w pełnej krasie.', transportCode: 'BCN' },
  { id: 'par_01', city: 'Paryż', country: 'Francja', lat: 48.8566, lon: 2.3522, coverImage: 'https://images.unsplash.com/photo-1502602898657-3e90768ea0ab?auto=format&fit=crop&q=80&w=600', shortDescription: 'Światowa stolica miłości i sztuki. Miasto świateł zaprasza na spacery wzdłuż Sekwany i świeże rogaliki.', transportCode: 'PAR' },
  { id: 'lon_01', city: 'Londyn', country: 'Wielka Brytania', lat: 51.5074, lon: -0.1278, coverImage: 'https://images.unsplash.com/photo-1513635269975-5969336ac1cb?auto=format&fit=crop&q=80&w=600', shortDescription: 'Wielokulturowa metropolia, w której historia spotyka się z nowoczesnością na każdym kroku.', transportCode: 'LON' },
  { id: 'ath_01', city: 'Ateny', country: 'Grecja', lat: 37.9838, lon: 23.7275, coverImage: 'https://images.unsplash.com/photo-1521727915443-c0d12e617d91?auto=format&fit=crop&q=80&w=600', shortDescription: 'Kolebka zachodniej cywilizacji. Poczuj starożytny klimat przechadzając się u stóp Akropolu.', transportCode: 'ATH' },
  { id: 'krk_01', city: 'Kraków', country: 'Polska', lat: 50.0614, lon: 19.9366, coverImage: 'https://images.unsplash.com/photo-1558948574-8aa47b5962f3?auto=format&fit=crop&q=80&w=600', shortDescription: 'Historyczna stolica Polski. Odkryj sekrety dawnych królów i poczuj niezwykły klimat Kazimierza.', transportCode: 'Kraków Główny' },
  { id: 'prag_01', city: 'Praga', country: 'Czechy', lat: 50.0755, lon: 14.4378, coverImage: 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&q=80&w=600', shortDescription: 'Magiczna stolica pełna gotyckich wież, urokliwych uliczek i najlepszego na świecie piwa.', transportCode: 'PRG' },

  // --- NOWE 23 MIASTA (ŁĄCZNIE 30) ---
  {
    id: 'vie_01', city: 'Wiedeń', country: 'Austria', lat: 48.2082, lon: 16.3738, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Zanurz się w klasycznej muzyce, wypij wiedeńską kawę i podziwiaj majestatyczne pałace Habsburgów.', transportCode: 'VIE'
  },
  {
    id: 'bud_01', city: 'Budapeszt', country: 'Węgry', lat: 47.4979, lon: 19.0402, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Perła Dunaju. Zrelaksuj się w słynnych termach i daj się porwać nocnemu życiu w ruin barach.', transportCode: 'BUD'
  },
  {
    id: 'ber_01', city: 'Berlin', country: 'Niemcy', lat: 52.5200, lon: 13.4050, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Miasto, które nigdy nie śpi. Alternatywna sztuka, bogata historia i najlepsza scena techno w Europie.', transportCode: 'BER'
  },
  {
    id: 'lis_01', city: 'Lizbona', country: 'Portugalia', lat: 38.7223, lon: -9.1393, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Słoneczna stolica na siedmiu wzgórzach. Przejedź się żółtym tramwajem i skosztuj słodkich pasteis de nata.', transportCode: 'LIS'
  },
  {
    id: 'mad_01', city: 'Madryt', country: 'Hiszpania', lat: 40.4168, lon: -3.7038, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Tętniące życiem serce Hiszpanii, pełne sztuki (muzeum Prado), tapas i królewskiego rozmachu.', transportCode: 'MAD'
  },
  {
    id: 'ams_01', city: 'Amsterdam', country: 'Holandia', lat: 52.3676, lon: 4.9041, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Malownicze kanały, setki rowerów i dzieła Van Gogha. Miasto wolności i pięknej architektury.', transportCode: 'AMS'
  },
  {
    id: 'cph_01', city: 'Kopenhaga', country: 'Dania', lat: 55.6761, lon: 12.5683, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Skandynawski design, urokliwy port Nyhavn i królewskie pałace. Poznaj prawdziwe duńskie hygge.', transportCode: 'CPH'
  },
  {
    id: 'mxp_01', city: 'Mediolan', country: 'Włochy', lat: 45.4642, lon: 9.1900, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Światowa stolica mody i designu. Monumentalna katedra Duomo robi niesamowite wrażenie.', transportCode: 'MXP'
  },
  {
    id: 'vce_01', city: 'Wenecja', country: 'Włochy', lat: 45.4408, lon: 12.3155, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Romantyczne kanały, gondole i zachwycające pałace odbijające się w wodzie. Jedyne takie miejsce na Ziemi.', transportCode: 'VCE'
  },
  {
    id: 'dbv_01', city: 'Dubrownik', country: 'Chorwacja', lat: 42.6507, lon: 18.0944, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Perła Adriatyku. Spaceruj po potężnych murach miejskich, znanych na całym świecie dzięki Grze o Tron.', transportCode: 'DBV'
  },
  {
    id: 'zrh_01', city: 'Zurych', country: 'Szwajcaria', lat: 47.3769, lon: 8.5417, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Eleganckie miasto z widokiem na Alpy. Odkryj jezioro Zuryskie, luksusowe butiki i pyszną czekoladę.', transportCode: 'ZRH'
  },
  {
    id: 'edi_01', city: 'Edynburg', country: 'Szkocja', lat: 55.9533, lon: -3.1883, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Tajemnicze, gotyckie miasto leżące na wygasłych wulkanach. Odkryj potężny zamek i szkocką whisky.', transportCode: 'EDI'
  },
  {
    id: 'dub_01', city: 'Dublin', country: 'Irlandia', lat: 53.3498, lon: -6.2603, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Zielona stolica pełna celtyckiej historii i tętniących życiem pubów Temple Bar. Skosztuj idealnego Guinnessa.', transportCode: 'DUB'
  },
  {
    id: 'vlc_01', city: 'Walencja', country: 'Hiszpania', lat: 39.4699, lon: -0.3763, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Ojczyzna paelli. Zobacz futurystyczne Miasto Sztuki i Nauki i spędź popołudnie na piaszczystej plaży.', transportCode: 'VLC'
  },
  {
    id: 'nap_01', city: 'Neapol', country: 'Włochy', lat: 40.8518, lon: 14.2681, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Krzykliwy, autentyczny i pełen życia. Zjedz najlepszą pizzę na świecie w cieniu potężnego Wezuwiusza.', transportCode: 'NAP'
  },
  {
    id: 'opo_01', city: 'Porto', country: 'Portugalia', lat: 41.1579, lon: -8.6291, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Urokliwe miasto mostów i wina Porto. Zgub się w wąskich, kolorowych uliczkach dzielnicy Ribeira.', transportCode: 'OPO'
  },
  {
    id: 'ist_01', city: 'Stambuł', country: 'Turcja', lat: 41.0082, lon: 28.9784, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Gdzie Europa spotyka Azję. Zobacz majestatyczną Hagię Sofię i poczuj zapachy Grand Bazaaru.', transportCode: 'IST'
  },
  {
    id: 'nce_01', city: 'Nicea', country: 'Francja', lat: 43.7102, lon: 7.2620, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Klejnot Lazurowego Wybrzeża. Przejdź się słynną Promenadą Anglików w pełnym słońcu Riwiery Francuskiej.', transportCode: 'NCE'
  },
  {
    id: 'muc_01', city: 'Monachium', country: 'Niemcy', lat: 48.1351, lon: 11.5820, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Bawarska kultura, precle, piękne parki miejskie i bliskość alpejskich szczytów.', transportCode: 'MUC'
  },
  {
    id: 'mla_01', city: 'Valletta', country: 'Malta', lat: 35.8992, lon: 14.5141, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Stolica zakonów rycerskich zbudowana ze złocistego piaskowca. Prawdziwe muzeum pod gołym niebem.', transportCode: 'MLA'
  },
  {
    id: 'kef_01', city: 'Reykjavik', country: 'Islandia', lat: 64.1466, lon: -21.9426, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Kraina lodu i ognia. Idealna baza wypadowa do podziwiania zorzy polarnej, gejzerów i wodospadów.', transportCode: 'KEF'
  },
  {
    id: 'gdn_01', city: 'Gdańsk', country: 'Polska', lat: 54.3520, lon: 18.6466, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Stolica bursztynu. Posmakuj morskiego klimatu spacerując malowniczą ulicą Długą, aż po słynnego Żurawia.', transportCode: 'GDN'
  },
  {
    id: 'wro_01', city: 'Wrocław', country: 'Polska', lat: 51.1079, lon: 17.0385, 
    coverImage: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600', 
    shortDescription: 'Miasto setek mostów i krasnali. Tętniący życiem wrocławski rynek to jedno z najpiękniejszych miejsc w Polsce.', transportCode: 'WRO'
  }
];

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDateStr(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function getFallbackRecommendations(userLat: number, userLon: number): LiveDestination[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date();
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 3);

  const formatDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const startStr = formatDate(tomorrow);
  const endStr = formatDate(dayAfterTomorrow);

  const fallbackCities = [
    {
      id: 'rome_01',
      city: 'Rzym',
      country: 'Włochy',
      lat: 41.9028,
      lon: 12.4964,
      coverImage: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=600',
      shortDescription: 'Wieczne Miasto. Idealne na wyjazd, gdzie historia antyczna przeplata się z najlepszą kuchnią świata.',
      transportCode: 'ROM',
      temp: 22,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      icon: 'https://openweathermap.org/img/wn/01d@2x.png',
      attractions: ['Koloseum i Forum Romanum', 'Watykan i Bazylika św. Piotra', 'Fontanna di Trevi i Panteon'],
    },
    {
      id: 'bcn_01',
      city: 'Barcelona',
      country: 'Hiszpania',
      lat: 41.3851,
      lon: 2.1734,
      coverImage: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&q=80&w=600',
      shortDescription: 'Zjawiskowa architektura Gaudiego, relaks na plaży i tętniące życiem uliczki. Katalonia w pełnej krasie.',
      transportCode: 'BCN',
      temp: 20,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      icon: 'https://openweathermap.org/img/wn/02d@2x.png',
      attractions: ['Sagrada Família', 'Park Güell', 'Dzielnica Gotycka (Barri Gòtic)'],
    },
    {
      id: 'krk_01',
      city: 'Kraków',
      country: 'Polska',
      lat: 50.0614,
      lon: 19.9366,
      coverImage: 'https://images.unsplash.com/photo-1558948574-8aa47b5962f3?auto=format&fit=crop&q=80&w=600',
      shortDescription: 'Historyczna stolica Polski. Odkryj sekrety dawnych królów i poczuj niezwykły klimat Kazimierza.',
      transportCode: 'Kraków Główny',
      temp: 18,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      icon: 'https://openweathermap.org/img/wn/01d@2x.png',
      attractions: ['Rynek Główny i Sukiennice', 'Zamek Królewski na Wawelu', 'Kazimierz (Dzielnica Żydowska)'],
    },
    {
      id: 'par_01',
      city: 'Paryż',
      country: 'Francja',
      lat: 48.8566,
      lon: 2.3522,
      coverImage: 'https://images.unsplash.com/photo-1502602898657-3e90768ea0ab?auto=format&fit=crop&q=80&w=600',
      shortDescription: 'Światowa stolica miłości i sztuki. Miasto świateł zaprasza na spacery wzdłuż Sekwany i świeże rogaliki.',
      transportCode: 'PAR',
      temp: 19,
      condition: 'Bez opadów, idealnie na zwiedzanie',
      icon: 'https://openweathermap.org/img/wn/03d@2x.png',
      attractions: ['Wieża Eiffla', 'Muzeum Luwr', 'Katedra Notre-Dame'],
    },
  ];

  return fallbackCities.map((c) => {
    const distance = calculateDistanceKm(userLat, userLon, c.lat, c.lon);
    let recommendedTransport: 'flight' | 'train' | 'car' = 'flight';
    if (distance < 350) recommendedTransport = 'car';
    else if (distance <= 800) recommendedTransport = 'train';

    return {
      id: c.id,
      city: c.city,
      country: c.country,
      lat: c.lat,
      lon: c.lon,
      coverImage: c.coverImage,
      shortDescription: c.shortDescription,
      transportCode: c.transportCode,
      distanceKm: distance,
      recommendedTransport,
      weather: {
        temp: c.temp,
        condition: c.condition,
        icon: c.icon,
      },
      proposedTrip: {
        startDate: startStr,
        endDate: endStr,
        durationDays: 3,
        estimatedTemp: c.temp,
        condition: c.condition,
        crowdLevel: 'Umiarkowany ruch turystyczny',
        itinerary: [
          { day: 1, title: 'Dzień 1: Odkrywanie miasta', attractions: [c.attractions[0], c.attractions[1]] },
          { day: 2, title: 'Dzień 2: Kultura i zabytki', attractions: [c.attractions[1], c.attractions[2]] },
          { day: 3, title: 'Dzień 3: Spacer i relaks', attractions: [c.attractions[0], c.attractions[2]] },
        ],
      },
    };
  });
}

async function fetchCityWeather(
  dest: (typeof DESTINATION_POOL)[0],
  userLat: number,
  userLon: number
): Promise<LiveDestination | null> {
  const distance = calculateDistanceKm(userLat, userLon, dest.lat, dest.lon);

  let recommendedTransport: 'flight' | 'train' | 'car' = 'flight';
  if (distance < 350) recommendedTransport = 'car';
  else if (distance <= 800) recommendedTransport = 'train';

  let minDays = 2;
  let maxDays = 3;
  if (distance > 800) {
    minDays = 3;
    maxDays = 4;
  } else if (distance < 300) {
    minDays = 1;
    maxDays = 2;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${dest.lat}&lon=${dest.lon}&appid=${WEATHER_API_KEY}&units=metric&lang=pl`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!weatherRes.ok) {
      return null;
    }

    const rawText = await weatherRes.text();
    if (!rawText || !rawText.trim()) {
      return null;
    }

    let weatherData: any;
    try {
      weatherData = JSON.parse(rawText);
    } catch {
      return null;
    }

    if (!weatherData?.list || !Array.isArray(weatherData.list) || weatherData.list.length === 0) {
      return null;
    }

    const dailyForecasts: Record<string, { temps: number[]; rain: boolean; desc: string; icon: string }> = {};

    weatherData.list.forEach((item: any) => {
      const date = item.dt_txt?.split(' ')?.[0];
      if (!date) return;
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          temps: [],
          rain: false,
          desc: item.weather?.[0]?.description || '',
          icon: item.weather?.[0]?.icon || '01d',
        };
      }
      if (typeof item.main?.temp === 'number') {
        dailyForecasts[date].temps.push(item.main.temp);
      }
      const weatherId = item.weather?.[0]?.id || 800;
      if (weatherId >= 200 && weatherId < 700) {
        dailyForecasts[date].rain = true;
      }
    });

    const days = Object.keys(dailyForecasts).sort();
    if (days.length <= minDays) return null;

    let bestStartIdx = 1;
    let finalDuration = minDays;
    let foundPerfect = false;

    const maxAllowedStart = Math.min(2, days.length - minDays);

    for (let i = 1; i <= maxAllowedStart; i++) {
      let rainFreeDays = 0;
      for (let j = 0; j < maxDays; j++) {
        if (i + j < days.length && !dailyForecasts[days[i + j]].rain) {
          rainFreeDays++;
        } else {
          break;
        }
      }

      if (rainFreeDays >= minDays) {
        bestStartIdx = i;
        finalDuration = rainFreeDays;
        foundPerfect = true;
        break;
      }
    }

    if (!foundPerfect) {
      bestStartIdx = 1;
      finalDuration = minDays;
    }

    if (bestStartIdx + finalDuration > days.length) {
      finalDuration = Math.max(1, days.length - bestStartIdx);
    }

    const startStr = days[bestStartIdx];
    const endStr = days[bestStartIdx + finalDuration - 1];

    let sumTemp = 0;
    for (let i = 0; i < finalDuration; i++) {
      const dayTemps = dailyForecasts[days[bestStartIdx + i]]?.temps || [];
      const dayMaxTemp = dayTemps.length > 0 ? Math.max(...dayTemps) : 20;
      sumTemp += dayMaxTemp;
    }
    const avgTemp = Math.round(sumTemp / finalDuration);
    const condition = foundPerfect ? 'Bez opadów, idealnie na zwiedzanie' : 'Mogą wystąpić opady - weź parasol';

    const defaultAttractionsByCity: Record<string, string[]> = {
      Rzym: ['Koloseum i Forum Romanum', 'Watykan i Bazylika św. Piotra', 'Fontanna di Trevi i Panteon', 'Zatybrze'],
      Barcelona: ['Sagrada Família', 'Park Güell', 'Dzielnica Gotycka (Barri Gòtic)', 'Plaża Barceloneta'],
      Paryż: ['Wieża Eiffla', 'Muzeum Luwr', 'Katedra Notre-Dame', 'Montmartre'],
      Londyn: ['Big Ben i Parlament', 'British Museum', 'Tower Bridge', 'Hyde Park'],
      Ateny: ['Akropol i Partenon', 'Muzeum Akropolu', 'Plaka', 'Świątynia Zeusa'],
      Kraków: ['Rynek Główny i Sukiennice', 'Zamek Królewski na Wawelu', 'Kazimierz', 'Kopiec Kościuszki'],
      Praga: ['Most Karola', 'Zamek na Hradczanach', 'Rynek Staromiejski', 'Złota Uliczka'],
      Wiedeń: ['Pałac Schönbrunn', 'Katedra św. Szczepana', 'Pałac Hofburg', 'Belweder'],
      Budapeszt: ['Parlament w Budapeszcie', 'Baszta Rybacka', 'Termy Széchenyi', 'Zamek w Budzie'],
      Berlin: ['Brama Brandenburska', 'Wyspa Muzeów', 'Reichstag', 'East Side Gallery'],
      Gdańsk: ['Długi Targ i Fontanna Neptuna', 'Żuraw nad Motławą', 'Bazylika Mariacka', 'Europejskie Centrum Solidarności'],
      Wrocław: ['Rynek i Ratusz', 'Ostrów Tumski', 'Panorama Racławicka', 'Szlak Krasnali'],
    };

    const pool = defaultAttractionsByCity[dest.city] || [
      'Stare Miasto i Rynek',
      'Zabytkowy pałac lub zamek',
      'Lokalne muzeum sztuki',
      'Deptak spacerowy i kawiarnie',
    ];

    const itinerary: TripDay[] = [];
    for (let i = 0; i < finalDuration; i++) {
      const idx = (i * 2) % pool.length;
      itinerary.push({
        day: i + 1,
        title: `Dzień ${i + 1}: Odkrywanie miasta`,
        attractions: [pool[idx], pool[(idx + 1) % pool.length]],
      });
    }

    const proposedTrip: ProposedTrip = {
      startDate: formatDateStr(startStr),
      endDate: formatDateStr(endStr),
      durationDays: finalDuration,
      estimatedTemp: avgTemp,
      condition,
      crowdLevel: 'Umiarkowany ruch turystyczny',
      itinerary,
    };

    const firstDayTemps = dailyForecasts[startStr]?.temps || [];
    const firstDayMaxTemp = firstDayTemps.length > 0 ? Math.max(...firstDayTemps) : avgTemp;

    return {
      ...dest,
      distanceKm: distance,
      recommendedTransport,
      proposedTrip,
      weather: {
        temp: Math.round(firstDayMaxTemp),
        condition: dailyForecasts[startStr]?.desc || 'Częściowo słonecznie',
        icon: `https://openweathermap.org/img/wn/${dailyForecasts[startStr]?.icon || '01d'}@2x.png`,
      },
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function generateLiveRecommendations(): Promise<LiveDestination[]> {
  let userLat = 52.2297; // Domyślnie Warszawa (Złote Tarasy) jako fallback
  let userLon = 21.0122;

  try {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      let location = await Location.getCurrentPositionAsync({});
      userLat = location.coords.latitude;
      userLon = location.coords.longitude;
    }
  } catch (e) {
    console.warn("Brak GPS, używam lokalizacji domyślnej (Warszawa).");
  }

  // Wybieramy zróżnicowaną pulę kandydatów (8 miast), aby zapytania równoległe trwały ~500ms
  const shuffledPool = [...DESTINATION_POOL].sort(() => 0.5 - Math.random());
  const candidateBatch = shuffledPool.slice(0, 8);

  const results = await Promise.allSettled(
    candidateBatch.map((dest) => fetchCityWeather(dest, userLat, userLon))
  );

  const weatherPassed: LiveDestination[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      weatherPassed.push(res.value);
    }
  }

  // Jeśli brak wyników (brak sieci / błędy API), zwracamy natychmiast bezpieczny fallback
  if (weatherPassed.length === 0) {
    return getFallbackRecommendations(userLat, userLon);
  }

  // Sortujemy po temperaturze i czasie trwania, żeby najcieplejsze i bezdeszczowe były na górze
  weatherPassed.sort((a, b) => {
    const scoreA = (a.proposedTrip?.estimatedTemp || 0) + (a.proposedTrip?.durationDays || 0);
    const scoreB = (b.proposedTrip?.estimatedTemp || 0) + (b.proposedTrip?.durationDays || 0);
    return scoreB - scoreA;
  });

  // Ograniczamy kosztowne zapytania Google do 5 miast z najlepszą pogodą
  const topCities = weatherPassed.slice(0, 5);
  const finalRecommendations: LiveDestination[] = [];

  for (const dest of topCities) {
    if (GOOGLE_API_KEY && !GOOGLE_API_KEY.includes('TYMCZASOWY')) {
      try {
        const placesRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${dest.lat},${dest.lon}&radius=15000&type=tourist_attraction&key=${GOOGLE_API_KEY}`
        );
        const placesData = await placesRes.json();

        if (placesData.status === 'OK' && placesData.results && placesData.results.length > 0) {
          const sortedPlaces = placesData.results.sort(
            (a: any, b: any) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0)
          );

          const placeWithPhoto = sortedPlaces.find((place: any) => place.photos && place.photos.length > 0);
          if (placeWithPhoto) {
            const photoReference = placeWithPhoto.photos[0].photo_reference;
            dest.coverImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
          }

          const tripDays = dest.proposedTrip?.durationDays || 2;
          const placesNeeded = tripDays * 3;
          const topPlaces = sortedPlaces.slice(0, placesNeeded);

          const totalReviews = topPlaces.reduce((acc: number, val: any) => acc + (val.user_ratings_total || 0), 0);
          const avgReviewsPerDay = totalReviews / tripDays;

          let crowdLevel = 'Umiarkowany ruch turystyczny';
          if (avgReviewsPerDay > 50000) crowdLevel = 'Bardzo popularne (duży tłum) - rezerwuj bilety wcześniej!';
          else if (avgReviewsPerDay < 15000) crowdLevel = 'Spokojniejsza okolica, mniej turystów';

          const itinerary: TripDay[] = [];
          for (let i = 0; i < tripDays; i++) {
            const dailyAttractions = topPlaces.slice(i * 3, (i + 1) * 3).map((p: any) => p.name);
            if (dailyAttractions.length > 0) {
              itinerary.push({
                day: i + 1,
                title: `Dzień ${i + 1}: Odkrywanie miasta`,
                attractions: dailyAttractions,
              });
            }
          }

          if (dest.proposedTrip) {
            dest.proposedTrip.crowdLevel = crowdLevel;
            if (itinerary.length > 0) {
              dest.proposedTrip.itinerary = itinerary;
            }
          }
        }
      } catch (e) {
        console.warn(`Błąd Google Places dla ${dest.city}:`, e);
      }
    }

    // ZAWSZE dodajemy cel podróży do rekomendacji
    finalRecommendations.push(dest);
  }

  return finalRecommendations.length > 0 ? finalRecommendations : getFallbackRecommendations(userLat, userLon);
}