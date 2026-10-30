module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    osrmKrakowBaseUrl: process.env.EXPO_PUBLIC_OSRM_KRAKOW_BASE_URL,
    osrmKrakowFootBaseUrl: process.env.EXPO_PUBLIC_OSRM_KRAKOW_FOOT_BASE_URL,
  },
});
