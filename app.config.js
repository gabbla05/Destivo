module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        // Klucz natywnej mapy (Maps SDK for Android), ograniczony w Google Cloud do pakietu aplikacji.
        // Celowo bez prefiksu EXPO_PUBLIC_ - trafia tylko do AndroidManifest, nie do bundla JS.
        // Places API (zwykłe zapytania HTTP) używa osobnego klucza EXPO_PUBLIC_GOOGLE_API_KEY.
        apiKey:
          process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '',
      },
    },
  },
  extra: {
    ...config.extra,
    osrmKrakowBaseUrl: process.env.EXPO_PUBLIC_OSRM_KRAKOW_BASE_URL,
    osrmKrakowFootBaseUrl: process.env.EXPO_PUBLIC_OSRM_KRAKOW_FOOT_BASE_URL,
  },
});
