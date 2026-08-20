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

  const weatherPassed: LiveDestination[] = [];

  // ==========================================
  // ETAP 1: Filtrowanie darmowym API pogodowym (SZYBKIE STRZAŁY)
  // ==========================================
  for (const dest of DESTINATION_POOL) {
    try {
      const distance = calculateDistanceKm(userLat, userLon, dest.lat, dest.lon);
      
      // Zależność Dystans -> Środek Transportu
      let recommendedTransport: 'flight' | 'train' | 'car' = 'flight';
      if (distance < 350) recommendedTransport = 'car';
      else if (distance <= 800) recommendedTransport = 'train';

      // Zależność Dystans -> Oczekiwana długość wycieczki
      let minDays = 2;
      let maxDays = 3;
      if (distance > 800) {
        minDays = 3;
        maxDays = 4; // Zmniejszono do 4, aby zmieściło się w 5-dniowym API przy wylocie "jutro"
      } else if (distance < 300) {
        minDays = 1;
        maxDays = 2;
      }

      // Uderzamy do API OpenWeather (Prognoza darmowa daje 5 dni w przód co 3 godziny)
      const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${dest.lat}&lon=${dest.lon}&appid=${WEATHER_API_KEY}&units=metric&lang=pl`);
      if (!weatherRes.ok) {
        console.warn(`Błąd pobierania pogody dla ${dest.city} - Status: ${weatherRes.status}`);
        continue;
      }

      const weatherData = await weatherRes.json();
      const dailyForecasts: Record<string, { temps: number[], rain: boolean, desc: string, icon: string }> = {};

      // Parsowanie danych z API do obiektów "dniowych"
      weatherData.list.forEach((item: any) => {
        const date = item.dt_txt.split(' ')[0]; // Zostawiamy tylko YYYY-MM-DD
        if (!dailyForecasts[date]) {
          dailyForecasts[date] = { temps: [], rain: false, desc: item.weather[0].description, icon: item.weather[0].icon };
        }
        dailyForecasts[date].temps.push(item.main.temp);
        
        // Kody zjawisk atmosferycznych: 2xx (Burze), 3xx (Mżawka), 5xx (Deszcz), 6xx (Śnieg)
        if (item.weather[0].id >= 200 && item.weather[0].id < 700) {
          dailyForecasts[date].rain = true;
        }
      });

      const days = Object.keys(dailyForecasts).sort();
      if (days.length <= minDays) continue;

      // Szukamy okna pogodowego TYLKO z wylotem jutro (index 1) lub pojutrze (index 2)
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
          break; // Mamy perfekcyjny termin (jutro lub pojutrze)
        }
      }

      // Jeśli pogoda wszędzie jest słaba, po prostu wymuszamy najszybszy wyjazd (jutro)
      if (!foundPerfect) {
        bestStartIdx = 1;
        finalDuration = minDays;
      }

      // Dodatkowe zabezpieczenie długości tablicy
      if (bestStartIdx + finalDuration > days.length) {
          finalDuration = days.length - bestStartIdx;
      }

      const startStr = days[bestStartIdx];
      const endStr = days[bestStartIdx + finalDuration - 1];

      // Wyliczanie uśrednionej temperatury DZIENNEJ w czasie całego wyjazdu
      let sumTemp = 0;
      for(let i = 0; i < finalDuration; i++) {
        // Wybieramy najwyższą temperaturę z danego dnia (omijamy pomiary nocne)
        const dayMaxTemp = Math.max(...dailyForecasts[days[bestStartIdx + i]].temps);
        sumTemp += dayMaxTemp;
      }
      const avgTemp = Math.round(sumTemp / finalDuration);
      
      const condition = foundPerfect ? 'Bez opadów, idealnie na zwiedzanie' : 'Mogą wystąpić opady - weź parasol';

      const proposedTrip: ProposedTrip = {
        startDate: formatDateStr(startStr),
        endDate: formatDateStr(endStr),
        durationDays: finalDuration,
        estimatedTemp: avgTemp,
        condition: condition,
        crowdLevel: '', // Uzupełniane z Google Places
        itinerary: []   // Uzupełniane z Google Places
      };

      // Zabezpieczamy również ikonkę/pogodę pierwszego dnia na ekranie głównym
      const firstDayMaxTemp = Math.max(...dailyForecasts[startStr].temps);

      weatherPassed.push({
        ...dest,
        distanceKm: distance,
        recommendedTransport,
        proposedTrip,
        weather: { 
          temp: Math.round(firstDayMaxTemp), 
          condition: dailyForecasts[startStr].desc, 
          icon: `https://openweathermap.org/img/wn/${dailyForecasts[startStr].icon}@2x.png` 
        }
      });
    } catch (e) {
      console.warn(`Błąd ETAPU 1 dla ${dest.city}:`, e);
    }
  }
  // Sortujemy po temperaturze i czasie trwania, żeby najcieplejsze i bezdeszczowe były na górze
  weatherPassed.sort((a, b) => {
    const scoreA = (a.proposedTrip?.estimatedTemp || 0) + (a.proposedTrip?.durationDays || 0);
    const scoreB = (b.proposedTrip?.estimatedTemp || 0) + (b.proposedTrip?.durationDays || 0);
    return scoreB - scoreA;
  });

  // ==========================================
  // ETAP 2: Pobieranie prawdziwych atrakcji i zdjęć z Google
  // ==========================================
  // Ograniczamy kosztowne zapytania Google do 5 losowych miast z najlepszą pogodą
  const bestWeatherPool = weatherPassed.slice(0, 12);
  bestWeatherPool.sort(() => 0.5 - Math.random());
  const topCities = bestWeatherPool.slice(0, 5);
  const finalRecommendations: LiveDestination[] = [];

  for (const dest of topCities) {
    try {
      if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('TYMCZASOWY')) {
        throw new Error("Brak klucza Google API");
      }

      const placesRes = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${dest.lat},${dest.lon}&radius=15000&type=tourist_attraction&key=${GOOGLE_API_KEY}`);
      const placesData = await placesRes.json();

      if (placesData.status === 'OK' && placesData.results) {
        // Sortujemy atrakcje po największej popularności (najwięcej ocen)
        const sortedPlaces = placesData.results.sort((a: any, b: any) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));
        
        // --- NOWY KOD POBIERAJĄCY ZDJĘCIE ---
        // Szukamy pierwszej atrakcji, która posiada zdjęcie z Google
        const placeWithPhoto = sortedPlaces.find((place: any) => place.photos && place.photos.length > 0);
        if (placeWithPhoto) {
          const photoReference = placeWithPhoto.photos[0].photo_reference;
          // Nadpisujemy domyślne zdjęcie z bazy prawdziwym zdjęciem z Google Places
          dest.coverImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
        }
        // ------------------------------------

        // Zależnie od tego, czy wyjazd trwa 2 dni czy 5 dni, potrzebujemy inną liczbę atrakcji (np. 3 na dzień)
        const tripDays = dest.proposedTrip!.durationDays;
        const placesNeeded = tripDays * 3;
        const topPlaces = sortedPlaces.slice(0, placesNeeded);

        // Szacowanie Tłumu - Im więcej "total reviews" na dzień, tym tłoczniej
        const totalReviews = topPlaces.reduce((acc: number, val: any) => acc + (val.user_ratings_total || 0), 0);
        const avgReviewsPerDay = totalReviews / tripDays;

        let crowdLevel = 'Umiarkowany ruch turystyczny';
        if (avgReviewsPerDay > 50000) crowdLevel = 'Bardzo popularne (duży tłum) - rezerwuj bilety wcześniej!';
        else if (avgReviewsPerDay < 15000) crowdLevel = 'Spokojniejsza okolica, mniej turystów';

        // Płynne ładowanie do planu w zależności od tego, ile dni potrwa podróż
        const itinerary: TripDay[] = [];
        for (let i = 0; i < tripDays; i++) {
          const dailyAttractions = topPlaces.slice(i * 3, (i + 1) * 3).map((p: any) => p.name);
          if (dailyAttractions.length > 0) {
            itinerary.push({
              day: i + 1,
              title: `Dzień ${i + 1}: Odkrywanie miasta`,
              attractions: dailyAttractions
            });
          }
        }

        if (dest.proposedTrip) {
          dest.proposedTrip.crowdLevel = crowdLevel;
          dest.proposedTrip.itinerary = itinerary;
        }
      }
      finalRecommendations.push(dest);
    } catch (e) {
      console.warn(`Błąd Google Places dla ${dest.city}:`, e);
    }
  }

  return finalRecommendations;
}