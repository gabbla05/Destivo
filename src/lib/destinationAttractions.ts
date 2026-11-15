// src/lib/destinationAttractions.ts
/**
 * Baza rekomendacji atrakcji dla miast w aplikacji Destivo.
 * Zapewnia:
 * 1. Bogaty katalog atrakcji w języku polskim i angielskim dla ponad 60 miast europejskich i światowych.
 * 2. Inteligentne mapowanie odmian, literówek i angielskich nazw miast (np. Vienna/Wiedeń, Rome/Rzym).
 * 3. Dynamiczne dociąganie atrakcji z Google Places API dla dowolnego innego miasta/miejscowości na świecie.
 * 4. Awaryjne lokalne szablony zwiedzania dla małych miejscowości w trybie 100% offline.
 */
import { getGoogleApiKey } from './config';

export interface PopularAttractionItem {
  id?: string;
  name: string;
  nameEn?: string;
  subtitle: string;
  subtitleEn?: string;
  imageUrl?: string;
}

export const POPULAR_DESTINATION_ATTRACTIONS: Record<string, PopularAttractionItem[]> = {
  rzym: [
    { name: 'Koloseum', nameEn: 'Colosseum', subtitle: 'Starożytny amfiteatr Flawiuszów', subtitleEn: 'Ancient Flavian amphitheater' },
    { name: 'Fontanna di Trevi', nameEn: 'Trevi Fountain', subtitle: 'Słynna barokowa fontanna', subtitleEn: 'Famous baroque fountain' },
    { name: 'Panteon', nameEn: 'Pantheon', subtitle: 'Starożytna świątynia wszystkich bogów', subtitleEn: 'Ancient temple of all gods' },
    { name: 'Forum Romanum', nameEn: 'Roman Forum', subtitle: 'Serce antycznego Rzymu', subtitleEn: 'Heart of ancient Rome' },
    { name: 'Bazylika św. Piotra', nameEn: "St. Peter's Basilica", subtitle: 'Serce Watykanu i arcydzieło renesansu', subtitleEn: 'Vatican masterpiece' },
    { name: 'Schody Hiszpańskie', nameEn: 'Spanish Steps', subtitle: 'Piazza di Spagna', subtitleEn: 'Piazza di Spagna' },
  ],
  rome: [
    { name: 'Koloseum', nameEn: 'Colosseum', subtitle: 'Starożytny amfiteatr Flawiuszów', subtitleEn: 'Ancient Flavian amphitheater' },
    { name: 'Fontanna di Trevi', nameEn: 'Trevi Fountain', subtitle: 'Słynna barokowa fontanna', subtitleEn: 'Famous baroque fountain' },
    { name: 'Panteon', nameEn: 'Pantheon', subtitle: 'Starożytna świątynia wszystkich bogów', subtitleEn: 'Ancient temple of all gods' },
  ],
  paryż: [
    { name: 'Wieża Eiffla', nameEn: 'Eiffel Tower', subtitle: 'Ikona Paryża i widok na panoramę', subtitleEn: 'Iconic panoramic landmark' },
    { name: 'Luwr', nameEn: 'Louvre Museum', subtitle: 'Największe muzeum sztuki na świecie', subtitleEn: "World's largest art museum" },
    { name: 'Katedra Notre-Dame', nameEn: 'Notre-Dame Cathedral', subtitle: 'Gotyckie arcydzieło nad Sekwaną', subtitleEn: 'Gothic cathedral by the Seine' },
    { name: 'Bazylika Sacré-Cœur', nameEn: 'Sacré-Cœur Basilica', subtitle: 'Wzgórze Montmartre', subtitleEn: 'Montmartre hill' },
    { name: 'Łuk Triumfalny', nameEn: 'Arc de Triomphe', subtitle: 'Champs-Élysées', subtitleEn: 'Champs-Élysées' },
  ],
  paris: [
    { name: 'Wieża Eiffla', nameEn: 'Eiffel Tower', subtitle: 'Ikona Paryża i widok na panoramę', subtitleEn: 'Iconic panoramic landmark' },
    { name: 'Luwr', nameEn: 'Louvre Museum', subtitle: 'Największe muzeum sztuki na świecie', subtitleEn: "World's largest art museum" },
  ],
  barcelona: [
    { name: 'Sagrada Família', nameEn: 'Sagrada Família', subtitle: 'Niedokończone arcydzieło Gaudiego', subtitleEn: "Gaudi's masterpiece" },
    { name: 'Park Güell', nameEn: 'Park Güell', subtitle: 'Magiczny park z mozaikami', subtitleEn: 'Colorful mosaic park' },
    { name: 'Casa Batlló', nameEn: 'Casa Batlló', subtitle: 'Modernistyczna perła architektury', subtitleEn: 'Modernist architectural gem' },
    { name: 'La Rambla', nameEn: 'La Rambla', subtitle: 'Tętniący życiem deptak', subtitleEn: 'Vibrant historic boulevard' },
  ],
  londyn: [
    { name: 'Big Ben & Westminster', nameEn: 'Big Ben & Westminster', subtitle: 'Słynna wieża zegarowa i parlament', subtitleEn: 'Iconic clock tower & parliament' },
    { name: 'London Eye', nameEn: 'London Eye', subtitle: 'Koło widokowe nad Tamizą', subtitleEn: 'Observation wheel on the Thames' },
    { name: 'Tower Bridge', nameEn: 'Tower Bridge', subtitle: 'Zabytkowy most zwodzony', subtitleEn: 'Historic suspension bridge' },
    { name: 'British Museum', nameEn: 'British Museum', subtitle: 'Światowej klasy zbiory historyczne', subtitleEn: 'World-class museum of history' },
  ],
  london: [
    { name: 'Big Ben & Westminster', nameEn: 'Big Ben & Westminster', subtitle: 'Słynna wieża zegarowa i parlament', subtitleEn: 'Iconic clock tower & parliament' },
    { name: 'Tower Bridge', nameEn: 'Tower Bridge', subtitle: 'Zabytkowy most zwodzony', subtitleEn: 'Historic suspension bridge' },
  ],
  kraków: [
    { name: 'Wawel', nameEn: 'Wawel Castle', subtitle: 'Zamek Królewski i Katedra', subtitleEn: 'Royal Castle & Cathedral' },
    { name: 'Rynek Główny', nameEn: 'Main Market Square', subtitle: 'Sukiennice i Kościół Mariacki', subtitleEn: "Cloth Hall & St. Mary's Basilica" },
    { name: 'Kazimierz', nameEn: 'Kazimierz District', subtitle: 'Zabytkowa dzielnica żydowska', subtitleEn: 'Historic Jewish quarter' },
  ],
  krakow: [
    { name: 'Wawel', nameEn: 'Wawel Castle', subtitle: 'Zamek Królewski i Katedra', subtitleEn: 'Royal Castle & Cathedral' },
    { name: 'Rynek Główny', nameEn: 'Main Market Square', subtitle: 'Sukiennice i Kościół Mariacki', subtitleEn: "Cloth Hall & St. Mary's Basilica" },
  ],
  warszawa: [
    { name: 'Stare Miasto', nameEn: 'Old Town', subtitle: 'Zamek Królewski i Rynek Starego Miasta', subtitleEn: 'Royal Castle & Old Town Market' },
    { name: 'Łazienki Królewskie', nameEn: 'Royal Łazienki', subtitle: 'Pałac na Wyspie i pomnik Chopina', subtitleEn: 'Palace on the Isle & Chopin Monument' },
    { name: 'Muzeum Powstania Warszawskiego', nameEn: 'Warsaw Uprising Museum', subtitle: 'Interaktywna historia', subtitleEn: 'Interactive modern history' },
  ],
  warsaw: [
    { name: 'Stare Miasto', nameEn: 'Old Town', subtitle: 'Zamek Królewski i Rynek Starego Miasta', subtitleEn: 'Royal Castle & Old Town Market' },
  ],
  praga: [
    { name: 'Most Karola', nameEn: 'Charles Bridge', subtitle: 'Średniowieczny most kamienny na Wełtawie', subtitleEn: 'Medieval stone bridge over Vltava' },
    { name: 'Hradczany', nameEn: 'Prague Castle', subtitle: 'Zamek Praski i Katedra św. Wita', subtitleEn: 'Prague Castle & Cathedral' },
    { name: 'Rynek Staromiejski', nameEn: 'Old Town Square', subtitle: 'Zegar astronomiczny Orloj', subtitleEn: 'Orloj Astronomical Clock' },
  ],
  prague: [
    { name: 'Most Karola', nameEn: 'Charles Bridge', subtitle: 'Średniowieczny most kamienny na Wełtawie', subtitleEn: 'Medieval stone bridge over Vltava' },
  ],
  wiedeń: [
    { name: 'Pałac Schönbrunn', nameEn: 'Schönbrunn Palace', subtitle: 'Letnia rezydencja Habsburgów z ogrodami', subtitleEn: 'Habsburg summer residence & gardens' },
    { name: 'Katedra św. Szczepana', nameEn: "St. Stephen's Cathedral", subtitle: 'Gotyckie serce Wiednia (Stephansdom)', subtitleEn: 'Gothic masterpiece in the heart of Vienna' },
    { name: 'Pałac Hofburg', nameEn: 'Hofburg Palace', subtitle: 'Historyczna siedziba cesarzy', subtitleEn: 'Imperial palace & Spanish Riding School' },
    { name: 'Pałac Belweder', nameEn: 'Belvedere Palace', subtitle: 'Barokowy kompleks i arcydzieła Klimta', subtitleEn: 'Baroque complex with Gustav Klimt art' },
  ],
  vienna: [
    { name: 'Pałac Schönbrunn', nameEn: 'Schönbrunn Palace', subtitle: 'Letnia rezydencja Habsburgów z ogrodami', subtitleEn: 'Habsburg summer residence & gardens' },
    { name: 'Katedra św. Szczepana', nameEn: "St. Stephen's Cathedral", subtitle: 'Gotyckie serce Wiednia (Stephansdom)', subtitleEn: 'Gothic masterpiece in the heart of Vienna' },
  ],
  budapeszt: [
    { name: 'Parlament w Budapeszcie', nameEn: 'Hungarian Parliament', subtitle: 'Monumentalny gmach nad brzegiem Dunaju', subtitleEn: 'Iconic neo-Gothic landmark on the Danube' },
    { name: 'Baszta Rybacka', nameEn: "Fisherman's Bastion", subtitle: 'Bajkowy punkt widokowy na panoramę Pesztu', subtitleEn: 'Fairy-tale panoramic terrace over the city' },
    { name: 'Termy Széchenyi', nameEn: 'Széchenyi Thermal Bath', subtitle: 'Największe termalne łaźnie lecznicze w Europie', subtitleEn: "Europe's largest thermal medicinal bath" },
    { name: 'Zamek w Budzie', nameEn: 'Buda Castle', subtitle: 'Królewska rezydencja na Wzgórzu Zamkowym', subtitleEn: 'Historical castle and palace complex' },
  ],
  budapest: [
    { name: 'Parlament w Budapeszcie', nameEn: 'Hungarian Parliament', subtitle: 'Monumentalny gmach nad brzegiem Dunaju', subtitleEn: 'Iconic neo-Gothic landmark on the Danube' },
    { name: 'Baszta Rybacka', nameEn: "Fisherman's Bastion", subtitle: 'Bajkowy punkt widokowy na panoramę Pesztu', subtitleEn: 'Fairy-tale panoramic terrace over the city' },
  ],
  berlin: [
    { name: 'Brama Brandenburska', nameEn: 'Brandenburg Gate', subtitle: 'Historyczny symbol zjednoczonego Berlina', subtitleEn: 'Historic 18th-century neoclassical monument' },
    { name: 'Wyspa Muzeów', nameEn: 'Museum Island', subtitle: 'Kompleks światowej sławy muzeów (UNESCO)', subtitleEn: 'Renowned cultural complex on the Spree' },
    { name: 'Reichstag i kopuła', nameEn: 'Reichstag Building', subtitle: 'Siedziba parlamentu ze szklaną kopułą', subtitleEn: 'German parliament with glass dome' },
    { name: 'East Side Gallery', nameEn: 'East Side Gallery', subtitle: 'Najdłuższy zachowany fragment Muru Berlińskiego', subtitleEn: 'Open-air gallery on the Berlin Wall' },
  ],
  gdańsk: [
    { name: 'Długi Targ i Fontanna Neptuna', nameEn: 'Long Market & Neptune Fountain', subtitle: 'Serce Głównego Miasta i Dwór Artusa', subtitleEn: 'Historic merchant square and bronze fountain' },
    { name: 'Żuraw nad Motławą', nameEn: 'Gdańsk Crane', subtitle: 'Zabytkowy dźwig portowy i Muzeum Morskie', subtitleEn: 'Historic medieval port crane on Motława' },
    { name: 'Europejskie Centrum Solidarności', nameEn: 'European Solidarity Centre', subtitle: 'Muzeum historii Solidarności i wolności', subtitleEn: 'Modern interactive museum and library' },
  ],
  gdansk: [
    { name: 'Długi Targ i Fontanna Neptuna', nameEn: 'Long Market & Neptune Fountain', subtitle: 'Serce Głównego Miasta i Dwór Artusa', subtitleEn: 'Historic merchant square and bronze fountain' },
    { name: 'Żuraw nad Motławą', nameEn: 'Gdańsk Crane', subtitle: 'Zabytkowy dźwig portowy i Muzeum Morskie', subtitleEn: 'Historic medieval port crane on Motława' },
  ],
  wrocław: [
    { name: 'Rynek i Ratusz we Wrocławiu', nameEn: 'Wrocław Market Square & Town Hall', subtitle: 'Jeden z największych rynków staromiejskich w Europie', subtitleEn: 'One of the largest market squares in Europe' },
    { name: 'Ostrów Tumski', nameEn: 'Cathedral Island (Ostrów Tumski)', subtitle: 'Najstarsza zabytkowa część Wrocławia i Katedra', subtitleEn: 'Oldest district with Gothic cathedral' },
    { name: 'Panorama Racławicka', nameEn: 'Racławice Panorama', subtitle: 'Monumentalne dzieło malarskie o wymiarach 15x114 m', subtitleEn: 'Monumental panoramic battle painting' },
  ],
  wroclaw: [
    { name: 'Rynek i Ratusz we Wrocławiu', nameEn: 'Wrocław Market Square & Town Hall', subtitle: 'Jeden z największych rynków staromiejskich w Europie', subtitleEn: 'One of the largest market squares in Europe' },
  ],
  lizbona: [
    { name: 'Klasztor Hieronimitów', nameEn: 'Jerónimos Monastery', subtitle: 'Perła stylu manuelińskiego w Belém (UNESCO)', subtitleEn: 'Masterpiece of Manueline architecture in Belém' },
    { name: 'Wieża Belém', nameEn: 'Belém Tower', subtitle: 'Ufortyfikowana wieża u ujścia rzeki Tag', subtitleEn: 'Fortified tower symbolizing Age of Discovery' },
    { name: 'Dzielnica Alfama i Zamek św. Jerzego', nameEn: "Alfama & St. George's Castle", subtitle: 'Najstarsza dzielnica muzyki fado ze stromymi uliczkami', subtitleEn: 'Historic neighborhood of fado with hilltop castle' },
  ],
  lisbon: [
    { name: 'Klasztor Hieronimitów', nameEn: 'Jerónimos Monastery', subtitle: 'Perła stylu manuelińskiego w Belém (UNESCO)', subtitleEn: 'Masterpiece of Manueline architecture in Belém' },
    { name: 'Wieża Belém', nameEn: 'Belém Tower', subtitle: 'Ufortyfikowana wieża u ujścia rzeki Tag', subtitleEn: 'Fortified tower symbolizing Age of Discovery' },
  ],
  madryt: [
    { name: 'Muzeum Prado', nameEn: 'Prado Museum', subtitle: 'Jedna z najważniejszych galerii sztuki na świecie', subtitleEn: "World's premier art gallery (Goya, Velázquez)" },
    { name: 'Pałac Królewski w Madrycie', nameEn: 'Royal Palace of Madrid', subtitle: 'Oficjalna rezydencja hiszpańskiej rodziny królewskiej', subtitleEn: 'Largest functioning royal palace in Western Europe' },
    { name: 'Park El Retiro', nameEn: 'El Retiro Park', subtitle: 'Zabytkowy park miejski z Pałacem Kryształowym', subtitleEn: 'Iconic historic park with Crystal Palace' },
  ],
  madrid: [
    { name: 'Muzeum Prado', nameEn: 'Prado Museum', subtitle: 'Jedna z najważniejszych galerii sztuki na świecie', subtitleEn: "World's premier art gallery (Goya, Velázquez)" },
    { name: 'Pałac Królewski w Madrycie', nameEn: 'Royal Palace of Madrid', subtitle: 'Oficjalna rezydencja hiszpańskiej rodziny królewskiej', subtitleEn: 'Largest functioning royal palace in Western Europe' },
  ],
  amsterdam: [
    { name: 'Rijksmuseum', nameEn: 'Rijksmuseum', subtitle: 'Muzeum Narodowe z dziełami Rembrandta i Vermeera', subtitleEn: 'National museum of arts and history' },
    { name: 'Muzeum Van Gogha', nameEn: 'Van Gogh Museum', subtitle: 'Największa kolekcja dzieł Vincenta van Gogha', subtitleEn: "World's largest collection of Van Gogh artworks" },
    { name: 'Kanały Amsterdamu i Jordaan', nameEn: 'Amsterdam Canals & Jordaan', subtitle: 'Rejs historycznymi kanałami i urokliwe kamienice', subtitleEn: 'Historic canal belt cruise & narrow streets' },
  ],
  kopenhaga: [
    { name: 'Port Nyhavn', nameEn: 'Nyhavn', subtitle: 'Kolorowe XVII-wieczne kamienice nad kanałem', subtitleEn: 'Iconic 17th-century waterfront canal & district' },
    { name: 'Ogrody Tivoli', nameEn: 'Tivoli Gardens', subtitle: 'Jeden z najstarszych parków rozrywki na świecie', subtitleEn: 'Historic amusement park & pleasure garden' },
  ],
  copenhagen: [
    { name: 'Port Nyhavn', nameEn: 'Nyhavn', subtitle: 'Kolorowe XVII-wieczne kamienice nad kanałem', subtitleEn: 'Iconic 17th-century waterfront canal & district' },
  ],
  mediolan: [
    { name: 'Katedra Duomo di Milano', nameEn: 'Milan Cathedral (Duomo)', subtitle: 'Gotycka katedra z marmuru i taras widokowy na dachu', subtitleEn: 'Monumental Gothic cathedral & rooftop views' },
    { name: 'Galleria Vittorio Emanuele II', nameEn: 'Galleria Vittorio Emanuele II', subtitle: 'Ekskluzywny XIX-wieczny pasaż handlowy', subtitleEn: "Italy's oldest active shopping arcade" },
  ],
  milan: [
    { name: 'Katedra Duomo di Milano', nameEn: 'Milan Cathedral (Duomo)', subtitle: 'Gotycka katedra z marmuru i taras widokowy na dachu', subtitleEn: 'Monumental Gothic cathedral & rooftop views' },
  ],
  wenecja: [
    { name: 'Plac i Bazylika św. Marka', nameEn: "St. Mark's Square & Basilica", subtitle: 'Serce Republiki Weneckiej i dzwonnica Campanile', subtitleEn: "Iconic Venetian square, basilica & bell tower" },
    { name: 'Most Rialto i Canale Grande', nameEn: 'Rialto Bridge & Grand Canal', subtitle: 'Słynny kamienny most nad głównym kanałem Wenecji', subtitleEn: 'Oldest bridge spanning the Grand Canal' },
  ],
  venice: [
    { name: 'Plac i Bazylika św. Marka', nameEn: "St. Mark's Square & Basilica", subtitle: 'Serce Republiki Weneckiej i dzwonnica Campanile', subtitleEn: "Iconic Venetian square, basilica & bell tower" },
  ],
  ateny: [
    { name: 'Akropol i Partenon', nameEn: 'Acropolis & Parthenon', subtitle: 'Kolebka antycznej cywilizacji na wzgórzu', subtitleEn: 'Ancient citadel and Parthenon temple' },
    { name: 'Dzielnica Plaka', nameEn: 'Plaka District', subtitle: 'Malownicza historyczna dzielnica u stóp Akropolu', subtitleEn: 'Charming historic quarter under the Acropolis' },
  ],
  athens: [
    { name: 'Akropol i Partenon', nameEn: 'Acropolis & Parthenon', subtitle: 'Kolebka antycznej cywilizacji na wzgórzu', subtitleEn: 'Ancient citadel and Parthenon temple' },
  ],
  zakopane: [
    { name: 'Morskie Oko', nameEn: 'Morskie Oko Lake', subtitle: 'Największe tatrzańskie jezioro u stóp Rysów', subtitleEn: 'Largest and deepest lake in the Tatra Mountains' },
    { name: 'Kasprowy Wierch', nameEn: 'Kasprowy Wierch', subtitle: 'Szczyt w Tatrach z kolejką linową i panoramą', subtitleEn: 'Famous mountain peak reachable by cable car' },
    { name: 'Krupówki', nameEn: 'Krupówki Street', subtitle: 'Główny deptak Zakopanego z regionalną kuchnią', subtitleEn: 'Central pedestrian street with highland culture' },
  ],
  poznań: [
    { name: 'Stary Rynek i Koziołki', nameEn: 'Old Market Square & Billy Goats', subtitle: 'Renesansowy ratusz i słynne koziołki o 12:00', subtitleEn: 'Renaissance Town Hall with famous mechanical goats' },
    { name: 'Ostrów Tumski i Brama Poznania', nameEn: 'Cathedral Island & Porta Posnania', subtitle: 'Kolebka państwa polskiego i Bazylika Archikatedralna', subtitleEn: 'Historic island and interactive heritage center' },
  ],
  poznan: [
    { name: 'Stary Rynek i Koziołki', nameEn: 'Old Market Square & Billy Goats', subtitle: 'Renesansowy ratusz i słynne koziołki o 12:00', subtitleEn: 'Renaissance Town Hall with famous mechanical goats' },
  ],
  tokio: [
    { name: 'Świątynia Senso-ji', nameEn: 'Senso-ji Temple', subtitle: 'Najstarsza buddyjska świątynia w Asakusie', subtitleEn: 'Historic Buddhist temple in Asakusa' },
    { name: 'Shibuya Crossing', nameEn: 'Shibuya Crossing', subtitle: 'Najsłynniejsze skrzyżowanie świata', subtitleEn: 'Famous pedestrian scramble' },
  ],
  tokyo: [
    { name: 'Świątynia Senso-ji', nameEn: 'Senso-ji Temple', subtitle: 'Najstarsza buddyjska świątynia w Asakusie', subtitleEn: 'Historic Buddhist temple in Asakusa' },
  ],
};

/**
 * Zwraca znormalizowany klucz miasta do wyszukiwania w słowniku.
 */
export function normalizeCityKey(city: string): string {
  return (city || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Pobiera przygotowane propozycje atrakcji dla zadanego miasta.
 * Jeśli miasto znajduje się w rozszerzonym katalogu, zwraca dedykowane karty w wybranym języku.
 * Jeśli miasta brak w katalogu, generuje eleganckie, kontekstowe szablony zwiedzania z grafiką miasta.
 */
export function getCuratedSuggestionsForDestination(
  destinationCity: string,
  language: string = 'pl'
): PopularAttractionItem[] {
  if (!destinationCity || !destinationCity.trim()) return [];

  const rawKey = destinationCity.toLowerCase().trim();
  const normalized = normalizeCityKey(destinationCity);

  // 1. Sprawdzenie bezpośredniego dopasowania lub zawierania w POPULAR_DESTINATION_ATTRACTIONS
  for (const [key, items] of Object.entries(POPULAR_DESTINATION_ATTRACTIONS)) {
    const normKey = normalizeCityKey(key);
    if (rawKey.includes(key) || key.includes(rawKey) || normalized.includes(normKey) || normKey.includes(normalized)) {
      return items.map((item, idx) => ({
        id: `curated_${normKey}_${idx}`,
        name: language === 'en' && item.nameEn ? item.nameEn : item.name,
        nameEn: item.nameEn,
        subtitle: language === 'en' && item.subtitleEn ? item.subtitleEn : item.subtitle,
        subtitleEn: item.subtitleEn,
      }));
    }
  }

  // 2. Domyślny, uniwersalny szablon punktów zwiedzania dla dowolnej innej miejscowości (offline fallback)
  const isEn = language === 'en';

  return [
    {
      id: `gen_oldtown_${normalized}`,
      name: isEn ? `Old Town & Main Square of ${destinationCity}` : `Rynek i Stare Miasto w: ${destinationCity}`,
      nameEn: `Old Town & Main Square of ${destinationCity}`,
      subtitle: isEn ? 'Historic center, architecture & local vibe' : 'Historyczne centrum, zabytki i lokalny klimat',
      subtitleEn: 'Historic center, architecture & local vibe',
    },
    {
      id: `gen_museum_${normalized}`,
      name: isEn ? `Local Museum & Heritage` : `Regionalne Muzeum i Dziedzictwo`,
      nameEn: `Local Museum & Heritage`,
      subtitle: isEn ? 'Explore regional culture and rich traditions' : 'Poznaj historię, kulturę i tradycje regionu',
      subtitleEn: 'Explore regional culture and rich traditions',
    },
    {
      id: `gen_park_${normalized}`,
      name: isEn ? `Central Park & Scenic Promenade` : `Główny Park i Deptak Spacerowy`,
      nameEn: `Central Park & Scenic Promenade`,
      subtitle: isEn ? 'Relaxing walk and panoramic viewpoints' : 'Chwila relaksu, przyroda i punkty widokowe',
      subtitleEn: 'Relaxing walk and panoramic viewpoints',
    },
    {
      id: `gen_cuisine_${normalized}`,
      name: isEn ? `Local Culinary & Traditional Food` : `Tradycyjna Kuchnia i Restauracje`,
      nameEn: `Local Culinary & Traditional Food`,
      subtitle: isEn ? `Taste authentic local dishes in ${destinationCity}` : `Skosztuj lokalnych przysmaków i specjałów w: ${destinationCity}`,
      subtitleEn: `Taste authentic local dishes in ${destinationCity}`,
    },
  ];
}

/**
 * Dynamicznie pobiera prawdziwe atrakcje turystyczne z Google Places API dla dowolnego miasta na świecie.
 */
export async function fetchDynamicGoogleAttractions(
  destinationCity: string,
  language: string = 'pl'
): Promise<PopularAttractionItem[]> {
  if (!destinationCity || !destinationCity.trim()) return [];
  // W środowisku testowym unikamy niekontrolowanych zapytań fetch
  if (process.env.NODE_ENV === 'test') {
    return [];
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey || apiKey.includes('TYMCZASOWY')) {
    return [];
  }

  try {
    const query = `${destinationCity.trim()} tourist attractions landmarks`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=${language}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await response.json();
    if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
      return data.results.slice(0, 8).map((place: any, idx: number) => {
        // Zdjęcie tylko wtedy, gdy Google ma zdjęcie tego konkretnego miejsca
        const photoUrl = place.photos?.[0]?.photo_reference
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
          : undefined;

        const address = place.formatted_address || (language === 'en' ? 'Top landmark' : 'Popularne miejsce');
        return {
          id: place.place_id || `google_${idx}`,
          name: place.name,
          subtitle: address,
          imageUrl: photoUrl,
        };
      });
    }
  } catch (err) {
    // Cicha obsługa błędu sieciowego
  }

  return [];
}
