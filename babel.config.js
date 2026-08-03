module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.BABEL_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

  return {
    presets: ['babel-preset-expo'],
    plugins: isTest ? [] : [
      'react-native-reanimated/plugin',
    ],
  };
};