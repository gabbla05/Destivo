// Konfiguracja Jest wyłącznie dla benchmarku algorytmów TSP (npm run benchmark).
// Używa tych samych transformacji TypeScript co testy aplikacji, ale innego wzorca plików.
const base = require('../../package.json').jest;

module.exports = {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/scripts/benchmark/**/*.bench.ts'],
  testTimeout: 30 * 60 * 1000,
};
