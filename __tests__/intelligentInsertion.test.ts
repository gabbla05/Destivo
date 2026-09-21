import {
  findIntelligentInsertionSlot,
  insertTimelineEventIntelligently,
  parseTimelineDate,
  timeStrToMinutes,
  minutesToTimeStr,
} from '../src/lib/routeOptimization';

describe('Intelligent Timeline Insertion', () => {
  describe('Helper functions', () => {
    it('parses dates correctly for both DD-MM-YYYY and YYYY-MM-DD', () => {
      const d1 = parseTimelineDate('21-09-2026', '14:30');
      expect(d1.getFullYear()).toBe(2026);
      expect(d1.getMonth()).toBe(8); // September is 8
      expect(d1.getDate()).toBe(21);
      expect(d1.getHours()).toBe(14);
      expect(d1.getMinutes()).toBe(30);

      const d2 = parseTimelineDate('2026-09-21', '10:00');
      expect(d2.getFullYear()).toBe(2026);
      expect(d2.getMonth()).toBe(8);
      expect(d2.getDate()).toBe(21);
      expect(d2.getHours()).toBe(10);
      expect(d2.getMinutes()).toBe(0);
    });

    it('converts time strings to minutes and back', () => {
      expect(timeStrToMinutes('10:30')).toBe(630);
      expect(minutesToTimeStr(630)).toBe('10:30');
      expect(timeStrToMinutes('00:00')).toBe(0);
      expect(minutesToTimeStr(0)).toBe('00:00');
    });
  });

  describe('findIntelligentInsertionSlot', () => {
    // Współrzędne w Rzymie:
    // Koloseum: 41.8902, 12.4922
    // Forum Romanum: 41.8925, 12.4853
    // Panteon: 41.8986, 12.4769
    // Fontanna di Trevi: 41.9009, 12.4833
    // Piazza Navona: 41.8992, 12.4731
    const baseEvents = [
      {
        id: 'evt_dep',
        type: 'DEPARTURE',
        title: 'Wylot do Rzymu',
        dateStr: '21-09-2026',
        timeStr: '08:00',
        lat: 41.8003, // Fiumicino Airport
        lon: 12.2389,
      },
      {
        id: 'evt_colosseum',
        type: 'ATTRACTION',
        title: 'Koloseum',
        dateStr: '21-09-2026',
        timeStr: '10:00',
        lat: 41.8902,
        lon: 12.4922,
      },
      {
        id: 'evt_forum',
        type: 'ATTRACTION',
        title: 'Forum Romanum',
        dateStr: '21-09-2026',
        timeStr: '12:00',
        lat: 41.8925,
        lon: 12.4853,
      },
      {
        id: 'evt_trevi',
        type: 'ATTRACTION',
        title: 'Fontanna di Trevi',
        dateStr: '21-09-2026',
        timeStr: '15:00',
        lat: 41.9009,
        lon: 12.4833,
      },
      {
        id: 'evt_ret',
        type: 'RETURN',
        title: 'Powrót do domu',
        dateStr: '21-09-2026',
        timeStr: '19:00',
        lat: 41.8003,
        lon: 12.2389,
      },
    ];

    it('inserts Capitoline Museums / Piazza Venezia between Roman Forum and Trevi Fountain', () => {
      // Piazza Venezia jest tuż przy Forum Romanum w drodze do Fontanny di Trevi
      const piazzaVenezia = {
        title: 'Piazza Venezia',
        lat: 41.8955,
        lon: 12.4823,
      };

      const result = findIntelligentInsertionSlot(
        baseEvents,
        piazzaVenezia,
        [],
        'Rome'
      );

      // Powinno trafić po Forum Romanum (index 2) a przed Trevi (index 3) -> insertIndex 3
      expect(result.insertIndex).toBe(3);
      expect(result.dateStr).toBe('21-09-2026');
      // Godzina powinna być między 12:00 a 15:00 (np. 13:30)
      const minutes = timeStrToMinutes(result.timeStr);
      expect(minutes).toBeGreaterThan(timeStrToMinutes('12:00'));
      expect(minutes).toBeLessThan(timeStrToMinutes('15:00'));
    });

    it('inserts Pantheon close to Trevi Fountain', () => {
      // Pantheon: 41.8986, 12.4769 (blisko Trevi: 41.9009, 12.4833)
      const pantheon = {
        title: 'Pantheon',
        lat: 41.8986,
        lon: 12.4769,
      };

      const result = findIntelligentInsertionSlot(
        baseEvents,
        pantheon,
        [],
        'Rome'
      );

      // Powinno trafić obok Trevi (index 3)
      expect([3, 4]).toContain(result.insertIndex);
    });

    it('never places an attraction before DEPARTURE or after RETURN', () => {
      const farNorth = {
        title: 'Daleka Północ',
        lat: 45.0,
        lon: 10.0,
      };

      const result = findIntelligentInsertionSlot(
        baseEvents,
        farNorth,
        [],
        'Rome'
      );

      expect(result.insertIndex).toBeGreaterThanOrEqual(1);
      expect(result.insertIndex).toBeLessThanOrEqual(baseEvents.length - 1);
    });
  });

  describe('insertTimelineEventIntelligently', () => {
    it('inserts event and preserves chronological order without collisions', () => {
      const events = [
        {
          id: 'evt_1',
          type: 'DEPARTURE',
          title: 'Start',
          dateStr: '21-09-2026',
          timeStr: '09:00',
          lat: 41.89,
          lon: 12.49,
        },
        {
          id: 'evt_2',
          type: 'ATTRACTION',
          title: 'Atrakcja 1',
          dateStr: '21-09-2026',
          timeStr: '10:00',
          lat: 41.891,
          lon: 12.491,
        },
        {
          id: 'evt_3',
          type: 'ATTRACTION',
          title: 'Atrakcja 2',
          dateStr: '21-09-2026',
          timeStr: '11:00',
          lat: 41.905,
          lon: 12.485,
        },
        {
          id: 'evt_4',
          type: 'RETURN',
          title: 'Koniec',
          dateStr: '21-09-2026',
          timeStr: '18:00',
          lat: 41.89,
          lon: 12.49,
        },
      ];

      const newPoint = {
        id: 'evt_new',
        title: 'Nowa Atrakcja Bliska 1',
        lat: 41.8915,
        lon: 12.4912,
      };

      const updated = insertTimelineEventIntelligently(
        events,
        newPoint,
        [],
        'Rome'
      );

      expect(updated.length).toBe(5);
      const inserted = updated.find((e) => e.id === 'evt_new');
      expect(inserted).toBeDefined();

      // Sprawdzamy czy kolejność godzin jest rosnąca
      for (let i = 0; i < updated.length - 1; i++) {
        const m1 = timeStrToMinutes(updated[i].timeStr);
        const m2 = timeStrToMinutes(updated[i + 1].timeStr);
        expect(m2).toBeGreaterThanOrEqual(m1);
      }
    });

    it('assigns to the correct day in a multi-day trip based on proximity', () => {
      const multiDayEvents = [
        {
          id: 'e1',
          type: 'DEPARTURE',
          title: 'Start Rzym',
          dateStr: '21-09-2026',
          timeStr: '08:00',
          lat: 41.89,
          lon: 12.49,
        },
        {
          id: 'e2',
          type: 'ATTRACTION',
          title: 'Koloseum Rzym',
          dateStr: '21-09-2026',
          timeStr: '11:00',
          lat: 41.8902,
          lon: 12.4922,
        },
        {
          id: 'e3',
          type: 'ATTRACTION',
          title: 'Katedra Santa Maria Florencja',
          dateStr: '22-09-2026',
          timeStr: '11:00',
          lat: 43.7731,
          lon: 11.256,
        },
        {
          id: 'e4',
          type: 'RETURN',
          title: 'Powrót Florencja',
          dateStr: '22-09-2026',
          timeStr: '18:00',
          lat: 43.77,
          lon: 11.25,
        },
      ];

      // Dodajemy Ponte Vecchio we Florencji (43.7687, 11.2531)
      const florencePoint = {
        id: 'evt_ponte',
        title: 'Ponte Vecchio',
        lat: 43.7687,
        lon: 11.2531,
      };

      const updated = insertTimelineEventIntelligently(
        multiDayEvents,
        florencePoint,
        [],
        'Florence'
      );

      const inserted = updated.find((e) => e.id === 'evt_ponte');
      expect(inserted).toBeDefined();
      // Musi zostać przypisany do Dnia 2 we Florencji!
      expect(inserted!.dateStr).toBe('22-09-2026');
    });
  });
});
