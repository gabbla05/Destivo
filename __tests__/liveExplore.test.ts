import { generateLiveRecommendations, determineTransport } from '../src/lib/liveExplore';

describe('determineTransport', () => {
  it('should recommend car for short trips under 120 km (e.g. Proszowice-Krakow)', () => {
    expect(determineTransport(30)).toBe('car');
    expect(determineTransport(119)).toBe('car');
  });

  it('should recommend train for medium domestic trips 120-550 km (e.g. Krakow-Wroclaw)', () => {
    expect(determineTransport(120)).toBe('train');
    expect(determineTransport(270)).toBe('train');
    expect(determineTransport(550)).toBe('train');
  });

  it('should recommend flight for long trips over 550 km', () => {
    expect(determineTransport(551)).toBe('flight');
    expect(determineTransport(1200)).toBe('flight');
  });
});

describe('generateLiveRecommendations', () => {
  it('should return non-empty recommendations even in fallback or live scenario', async () => {
    const results = await generateLiveRecommendations();
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].city).toBeDefined();
    expect(results[0].proposedTrip).toBeDefined();
    expect(results[0].proposedTrip?.durationDays).toBeGreaterThan(0);
    // Ensure all recommendations have a valid transport mode
    results.forEach((rec) => {
      expect(['flight', 'train', 'car']).toContain(rec.recommendedTransport);
    });
  });
});
