import { generateLiveRecommendations } from '../src/lib/liveExplore';

describe('generateLiveRecommendations', () => {
  it('should return non-empty recommendations even in fallback or live scenario', async () => {
    const results = await generateLiveRecommendations();
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].city).toBeDefined();
    expect(results[0].proposedTrip).toBeDefined();
    expect(results[0].proposedTrip?.durationDays).toBeGreaterThan(0);
  });
});
