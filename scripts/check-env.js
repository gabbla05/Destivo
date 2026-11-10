#!/usr/bin/env node
/**
 * Sprawdza konfigurację .env: obecność i format zmiennych oraz czy klucze działają w API.
 * Wartości kluczy NIE są wypisywane. Każdy klucz trafia wyłącznie do usługi, do której należy.
 * Użycie: npm run check:env
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Brak pliku .env - skopiuj .env.example do .env i uzupełnij wartości.');
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const formats = {
  EXPO_PUBLIC_SUPABASE_URL: (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: (v) => /^(eyJ|sb_publishable_)/.test(v) && v.length > 30,
  EXPO_PUBLIC_GOOGLE_API_KEY: (v) => /^AIza[0-9A-Za-z_-]{35}$/.test(v),
  GOOGLE_MAPS_ANDROID_API_KEY: (v) => /^AIza[0-9A-Za-z_-]{35}$/.test(v),
  EXPO_PUBLIC_WEATHER_API_KEY: (v) => /^[0-9a-f]{32}$/.test(v),
};
const optional = ['EXPO_PUBLIC_OSRM_KRAKOW_BASE_URL', 'EXPO_PUBLIC_OSRM_KRAKOW_FOOT_BASE_URL'];

let problems = 0;
console.log('== Format zmiennych ==');
for (const [key, isValid] of Object.entries(formats)) {
  const v = env[key];
  const status = !v ? 'BRAK' : isValid(v) ? 'OK' : 'ZŁY FORMAT';
  if (status !== 'OK') problems++;
  console.log(`${status.padEnd(10)} ${key}`);
}
if (env.EXPO_PUBLIC_GOOGLE_API_KEY && env.EXPO_PUBLIC_GOOGLE_API_KEY === env.GOOGLE_MAPS_ANDROID_API_KEY) {
  console.log('INFO       Ten sam klucz Google dla Places i mapy (OK, jeśli test Google Places poniżej przechodzi).');
}

const req = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });

async function check(name, fn) {
  try {
    const [ok, msg] = await fn();
    if (!ok) problems++;
    console.log(`${(ok ? 'OK' : 'BŁĄD').padEnd(10)} ${name}${msg ? ' - ' + msg : ''}`);
  } catch (e) {
    problems++;
    console.log(`${'BŁĄD'.padEnd(10)} ${name} - ${e.message}`);
  }
}

(async () => {
  console.log('\n== Działanie kluczy ==');
  await check('Supabase', async () => {
    const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const r = await req(`${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/trips?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return [r.ok, `HTTP ${r.status}`];
  });
  await check('Google Places (EXPO_PUBLIC_GOOGLE_API_KEY)', async () => {
    const r = await req(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=Wawel&key=${env.EXPO_PUBLIC_GOOGLE_API_KEY}`
    );
    const b = await r.json();
    return [b.status === 'OK' || b.status === 'ZERO_RESULTS', `${b.status} ${b.error_message || ''}`.trim()];
  });
  await check('OpenWeather', async () => {
    const r = await req(`https://api.openweathermap.org/data/2.5/weather?q=Krakow&appid=${env.EXPO_PUBLIC_WEATHER_API_KEY}`);
    return [r.ok, `HTTP ${r.status}`];
  });
  for (const key of optional) {
    if (!env[key]) continue;
    try {
      const r = await req(`${env[key].replace(/\/$/, '')}/route/v1/driving/19.9366,50.0614;19.9450,50.0540?overview=false`);
      console.log(`${(r.ok ? 'OK' : 'UWAGA').padEnd(10)} ${key} - HTTP ${r.status}`);
    } catch {
      console.log(
        `${'UWAGA'.padEnd(10)} ${key} - serwer nieosiągalny: optymalizacja tras w Krakowie pokaże błąd OSRM. ` +
          'Włącz serwer albo usuń tę zmienną z .env (wtedy użyty zostanie publiczny OSRM).'
      );
    }
  }
  console.log(
    '\nKlucz mapy (GOOGLE_MAPS_ANDROID_API_KEY) można sprawdzić tylko w aplikacji na telefonie - ' +
      'po zmianie uruchom: npx expo prebuild -p android && npx expo run:android'
  );
  console.log(problems === 0 ? '\nWszystko OK.' : `\nProblemów: ${problems}`);
  process.exit(problems === 0 ? 0 : 1);
})();
