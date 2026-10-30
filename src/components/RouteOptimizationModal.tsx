// src/components/RouteOptimizationModal.tsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import {
  optimizeSightseeingRoute,
  optimizeDayRouteWithHotel,
  fetchOsrmRoadMatrix,
  resolvePointCoordinates,
  buildGoogleMapsFullRouteUrls,
  buildGoogleMapsNavigationToDestinationUrl,
  fetchGooglePlaceLocation,
  optimizeMultiDayTimeline,
  parseTimelineDate,
  isTestEnvironment,
  type GeoPoint,
  type OptimizationResult,
  type AlgorithmBenchmark,
} from '../lib/routeOptimization';

interface TimelineEventLike {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  dateStr: string;
  timeStr?: string;
  parsedDate: Date;
  isPast?: boolean;
  isCurrent?: boolean;
  [key: string]: any;
}

interface RouteOptimizationModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (optimizedEvents: TimelineEventLike[]) => void;
  events: TimelineEventLike[];
  poolAttractions?: Array<{ name?: string; lat?: number; lon?: number }>;
  destinationCity?: string;
  lodgingCoords?: { lat: number; lon: number } | null;
  targetDay?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  transportProfile?: 'driving' | 'walking';
}

export const RouteOptimizationModal: React.FC<RouteOptimizationModalProps> = ({
  visible,
  onClose,
  onApply,
  events,
  poolAttractions = [],
  destinationCity = 'Rome',
  lodgingCoords = null,
  targetDay = 'ALL',
  tripStartDate,
  tripEndDate,
  transportProfile = 'driving',
}) => {
  const { language } = useAuthStore();
  const t = translations[language].timeline;
  const commonT = translations[language].common;

  // Aktywny profil transportu: domyślnie 'driving', z możliwością przełączenia na 'walking'
  const [selectedTransportProfile, setSelectedTransportProfile] = useState<'driving' | 'walking'>(
    transportProfile || 'driving'
  );

  useEffect(() => {
    if (transportProfile) {
      setSelectedTransportProfile(transportProfile);
    }
  }, [transportProfile]);

  // Aktywny zakres: 'ALL' (cały wyjazd) lub konkretna data (np. '10-09-2026')
  const [activeDayScope, setActiveDayScope] = useState<string>(targetDay || 'ALL');

  useEffect(() => {
    if (visible) {
      setActiveDayScope(targetDay || 'ALL');
    }
  }, [visible, targetDay]);

  // Posortowane chronologicznie unikalne dni
  const uniqueDays = useMemo(() => {
    return Array.from(
      new Set(
        events
          .map((e) => e.dateStr)
          .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      )
    ).sort((a, b) => {
      const tA = parseTimelineDate(a, '00:00').getTime();
      const tB = parseTimelineDate(b, '00:00').getTime();
      return tA - tB;
    });
  }, [events]);

  // Prawdziwe koordynaty z Google Places pobrane w tle na żywo
  const [liveCoordsMap, setLiveCoordsMap] = useState<Record<string, { lat: number; lon: number; isUnresolved?: boolean }>>({});

  // Stan pobierania macierzy czasów drogowych z OSRM Table API
  const [osrmStatus, setOsrmStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [roadMatrix, setRoadMatrix] = useState<number[][] | null>(null);
  const [dayRoadMatrices, setDayRoadMatrices] = useState<
    Record<string, { matrix: number[][]; pointIds: string[] }>
  >({});
  const [isApproximateMode, setIsApproximateMode] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const activeRequestIdRef = useRef<number>(0);
  const osrmAbortRef = useRef<AbortController | null>(null);

  const getLodgingEventForDay = (day: string): TimelineEventLike | undefined => {
    const lodgingEvents = events
      .filter((event) => event.type === 'LODGING')
      .sort((a, b) => parseTimelineDate(a.dateStr, a.timeStr || '00:00').getTime() -
        parseTimelineDate(b.dateStr, b.timeStr || '00:00').getTime());
    const dayTimestamp = parseTimelineDate(day, '23:59').getTime();
    return lodgingEvents
      .filter((event) => parseTimelineDate(event.dateStr, event.timeStr || '00:00').getTime() <= dayTimestamp)
      .pop() || lodgingEvents[0];
  };

  const getHotelPointForDay = (day: string): GeoPoint | null => {
    const lodgingEvt = getLodgingEventForDay(day);
    if (lodgingEvt) {
      const liveCoords = liveCoordsMap[lodgingEvt.id];
      if (liveCoords && !liveCoords.isUnresolved) {
        return {
          id: lodgingEvt.id,
          title: lodgingEvt.title || (language === 'en' ? 'Hotel / Lodging' : 'Hotel / Zakwaterowanie'),
          subtitle: lodgingEvt.subtitle,
          lat: liveCoords.lat,
          lon: liveCoords.lon,
          type: 'LODGING',
          originalIndex: -1,
        };
      }
      const lodgingAddress = lodgingEvt.subtitle?.trim();
      const coords = resolvePointCoordinates(
        lodgingAddress || lodgingEvt.title,
        poolAttractions,
        destinationCity,
        lodgingAddress ? null : lodgingCoords,
        { lat: lodgingEvt.lat, lon: lodgingEvt.lon }
      );
      if (!coords.isUnresolved && typeof coords.lat === 'number' && Number.isFinite(coords.lat)) {
        return {
          id: lodgingEvt.id,
          title: lodgingEvt.title || (language === 'en' ? 'Hotel / Lodging' : 'Hotel / Zakwaterowanie'),
          subtitle: lodgingEvt.subtitle,
          lat: coords.lat,
          lon: coords.lon,
          type: 'LODGING',
          originalIndex: -1,
        };
      }
    }
    if (
      !lodgingEvt?.subtitle?.trim() &&
      lodgingCoords &&
      typeof lodgingCoords.lat === 'number' &&
      Number.isFinite(lodgingCoords.lat) &&
      Number.isFinite(lodgingCoords.lon)
    ) {
      return {
        id: 'lodging_hotel_coords',
        title: language === 'en' ? 'Hotel / Accommodation' : 'Hotel / Zakwaterowanie',
        lat: lodgingCoords.lat,
        lon: lodgingCoords.lon,
        type: 'LODGING',
        originalIndex: -1,
      };
    }
    return null;
  };

  // W widoku całego wyjazdu dobieramy nocleg niezależnie dla każdego dnia.
  const hotelPoint: GeoPoint | null = useMemo(
    () => (activeDayScope !== 'ALL' ? getHotelPointForDay(activeDayScope) : null),
    [activeDayScope, events, poolAttractions, destinationCity, lodgingCoords, language, liveCoordsMap]
  );

  // Filtrujemy punkty do optymalizacji (w zależności od wybranego zakresu)
  const candidateEvents = useMemo(() => {
    if (activeDayScope && activeDayScope !== 'ALL') {
      return events.filter((e) => e.type === 'ATTRACTION' && e.dateStr === activeDayScope);
    }
    return events.filter((e) => e.type === 'ATTRACTION');
  }, [events, activeDayScope]);

  // Przypisujemy współrzędne GPS punktów (uwzględnia dociągnięte koordynaty live)
  const geoPoints: GeoPoint[] = useMemo(() => {
    return candidateEvents.map((e, idx) => {
      const live = liveCoordsMap[e.id];
      const coords = live || resolvePointCoordinates(
        e.title,
        poolAttractions,
        destinationCity,
        lodgingCoords,
        { lat: e.lat, lon: e.lon }
      );
      return {
        id: e.id,
        title: e.title,
        lat: coords.lat,
        lon: coords.lon,
        type: e.type,
        subtitle: e.subtitle,
        originalIndex: idx,
        isUnresolved: Boolean((coords as { isUnresolved?: boolean }).isUnresolved),
      };
    });
  }, [candidateEvents, liveCoordsMap, poolAttractions, destinationCity, lodgingCoords]);

  const hasUnresolvedPoints = useMemo(
    () => geoPoints.some((p) => p.isUnresolved),
    [geoPoints]
  );

  // W trybie pojedynczego dnia z hotelem, hotel dołączamy jako punkt startowy i powrotny do macierzy OSRM
  const isSingleDayMode = Boolean(activeDayScope && activeDayScope !== 'ALL');
  const pointsForMatrix: GeoPoint[] = useMemo(() => {
    if (isSingleDayMode && hotelPoint) {
      return [hotelPoint, ...geoPoints];
    }
    return geoPoints;
  }, [isSingleDayMode, hotelPoint, geoPoints]);

  // Stabilny identyfikator punktów zapobiegający niepotrzebnym zapytaniom sieciowym
  const pointsForMatrixKey = useMemo(() => {
    return pointsForMatrix.map((p) => `${p.id}_${p.lat}_${p.lon}`).join('|');
  }, [pointsForMatrix]);

  const isMultiDayAllMode = activeDayScope === 'ALL' && uniqueDays.length > 1;
  const routeLocationEvents = useMemo(() => {
    if (!isMultiDayAllMode) return candidateEvents;
    const selectedLodgingEvents = uniqueDays
      .map((day) => getLodgingEventForDay(day))
      .filter((event): event is TimelineEventLike => Boolean(event));
    return Array.from(new Map([...candidateEvents, ...selectedLodgingEvents].map((event) => [event.id, event])).values());
  }, [isMultiDayAllMode, uniqueDays, candidateEvents, events]);

  const dayRoutingInputs = useMemo(() => {
    if (!isMultiDayAllMode) return {} as Record<string, GeoPoint[]>;

    return uniqueDays.reduce((inputs, day) => {
      const dayPoints = candidateEvents
        .filter((event) => event.dateStr === day)
        .map((event) => geoPoints.find((point) => point.id === event.id))
        .filter((point): point is GeoPoint => Boolean(point));
      const lodgingEvent = getLodgingEventForDay(day);
      const hotel = getHotelPointForDay(day);
      if (lodgingEvent && !hotel) return inputs;
      const points = hotel ? [hotel, ...dayPoints] : dayPoints;
      if (points.length > 1 && !points.some((point) => point.isUnresolved)) {
        inputs[day] = points;
      }
      return inputs;
    }, {} as Record<string, GeoPoint[]>);
  }, [isMultiDayAllMode, uniqueDays, candidateEvents, geoPoints, events, poolAttractions, destinationCity, lodgingCoords, language, liveCoordsMap]);
  const hasUnroutableDayLodging = isMultiDayAllMode && uniqueDays.some((day) =>
    candidateEvents.some((event) => event.dateStr === day) &&
    Boolean(getLodgingEventForDay(day)) &&
    !getHotelPointForDay(day)
  );

  const dayRoutingInputsKey = useMemo(
    () => Object.entries(dayRoutingInputs)
      .map(([day, points]) => `${day}:${points.map((point) => `${point.id}_${point.lat}_${point.lon}`).join('|')}`)
      .join(';'),
    [dayRoutingInputs]
  );

  // Pobieranie macierzy drogowej OSRM Table API (czas przejazdu w sekundach)
  useEffect(() => {
    if (!visible || pointsForMatrix.length < 2) {
      setOsrmStatus('idle');
      setRoadMatrix(null);
      if (osrmAbortRef.current) {
        osrmAbortRef.current.abort();
        osrmAbortRef.current = null;
      }
      return;
    }

    if (isMultiDayAllMode) {
      if (isApproximateMode) {
        setOsrmStatus('idle');
        setDayRoadMatrices({});
        return;
      }

      const abortController = new AbortController();
      const currentReqId = ++activeRequestIdRef.current;
      osrmAbortRef.current?.abort();
      osrmAbortRef.current = abortController;
      setRoadMatrix(null);
      setDayRoadMatrices({});
      setOsrmStatus('loading');

      const dayEntries = Object.entries(dayRoutingInputs);
      if (dayEntries.length === 0) {
        setOsrmStatus('success');
        return () => abortController.abort();
      }

      const results: Array<{
        day: string;
        matrix: number[][] | null;
        pointIds: string[];
        error: Error | null;
      }> = new Array(dayEntries.length);
      let nextDayIndex = 0;
      const loadNextDayMatrix = async () => {
        while (nextDayIndex < dayEntries.length && !abortController.signal.aborted) {
          const index = nextDayIndex++;
          const [day, points] = dayEntries[index];
          try {
            const result = await fetchOsrmRoadMatrix(points, {
              criterion: 'duration',
              profile: selectedTransportProfile,
              signal: abortController.signal,
            });
            results[index] = {
              day,
              matrix: result.matrix,
              pointIds: points.map((point) => point.id),
              error: null,
            };
          } catch (error) {
            results[index] = {
              day,
              matrix: null,
              pointIds: [],
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
        }
      };

      Promise.all(
        Array.from({ length: Math.min(3, dayEntries.length) }, () => loadNextDayMatrix())
      ).then(() => {
        if (abortController.signal.aborted || currentReqId !== activeRequestIdRef.current) return;
        const successfulMatrices: Record<string, { matrix: number[][]; pointIds: string[] }> = {};
        const failures: Error[] = [];
        for (const result of results) {
          if (!result) continue;
          if (result.error || !result.matrix) {
            failures.push(result.error || new Error(`Nie udało się pobrać trasy dla dnia ${result.day}.`));
          } else {
            successfulMatrices[result.day] = {
              matrix: result.matrix,
              pointIds: result.pointIds,
            };
          }
        }
        setDayRoadMatrices(successfulMatrices);
        setOsrmStatus(failures.length > 0 ? 'error' : 'success');
      });

      return () => {
        abortController.abort();
        if (currentReqId === activeRequestIdRef.current) activeRequestIdRef.current++;
      };
    }

    if (isApproximateMode) {
      return;
    }

    if (pointsForMatrix.some((point) => point.isUnresolved)) {
      setRoadMatrix(null);
      setOsrmStatus('error');
      return;
    }

    if (osrmAbortRef.current) {
      osrmAbortRef.current.abort();
    }
    const abortController = new AbortController();
    osrmAbortRef.current = abortController;

    const currentReqId = ++activeRequestIdRef.current;
    // Zapewniamy natychmiastowe wyczyszczenie starej macierzy, aby nie mogła być użyta dla nowej listy punktów
    setRoadMatrix(null);
    setOsrmStatus('loading');

    fetchOsrmRoadMatrix(pointsForMatrix, {
      criterion: 'duration',
      profile: selectedTransportProfile,
      signal: abortController.signal,
    })
      .then((res) => {
        if (currentReqId === activeRequestIdRef.current && !abortController.signal.aborted) {
          setRoadMatrix(res.matrix);
          setOsrmStatus('success');
        }
      })
      .catch((err: any) => {
        if (currentReqId === activeRequestIdRef.current && !abortController.signal.aborted) {
          if (
            isTestEnvironment() &&
            !err?.message?.includes('OSRM_TEST_ERROR') &&
            !err?.message?.includes('OSRM_UNREACHABLE_POINTS')
          ) {
            setIsApproximateMode(true);
            setOsrmStatus('idle');
          } else {
            setOsrmStatus('error');
          }
        }
      });

    return () => {
      abortController.abort();
      activeRequestIdRef.current++;
    };
  }, [visible, pointsForMatrixKey, selectedTransportProfile, isApproximateMode, retryTrigger, language, isMultiDayAllMode, dayRoutingInputsKey]);

  // Źródło trasy: 'osrm' (pełna siatka drogowa) lub 'approximate' (w linii prostej)
  const activeSource: 'osrm' | 'approximate' = useMemo(() => {
    if (isMultiDayAllMode) {
      const requiredDays = Object.keys(dayRoutingInputs);
      return !isApproximateMode &&
        !hasUnroutableDayLodging &&
        requiredDays.length > 0 &&
        requiredDays.every((day) => Boolean(dayRoadMatrices[day]))
        ? 'osrm'
        : 'approximate';
    }
    if (
      !isApproximateMode &&
      osrmStatus === 'success' &&
      roadMatrix &&
      roadMatrix.length === pointsForMatrix.length
    ) {
      return 'osrm';
    }
    return 'approximate';
  }, [isApproximateMode, osrmStatus, roadMatrix, pointsForMatrix.length, activeDayScope, uniqueDays.length, hotelPoint, isMultiDayAllMode, dayRoutingInputs, dayRoadMatrices, hasUnroutableDayLodging]);

  // Uruchamiamy silnik algorytmów TSP z macierzą drogową OSRM (lub Haversine przy jawnym trybie przybliżonym)
  const optimizationResult: OptimizationResult | null = useMemo(() => {
    if (geoPoints.length < 2) return null;

    if (isMultiDayAllMode) {
      const orderedByDay = uniqueDays.flatMap((day) => {
        const dayEvents = candidateEvents.filter((event) => event.dateStr === day);
        const dayPoints = dayEvents
          .map((event) => geoPoints.find((point) => point.id === event.id))
          .filter((point): point is GeoPoint => Boolean(point));
        if (dayPoints.length < 2 || dayPoints.some((point) => point.isUnresolved)) return dayPoints;

        const dayHotel = getHotelPointForDay(day);
        const dayMatrixResult = dayRoadMatrices[day];
        const expectedPoints = dayHotel ? [dayHotel, ...dayPoints] : dayPoints;
        const hasDayRoadMatrix =
          !isApproximateMode &&
          dayMatrixResult?.pointIds.length === expectedPoints.length &&
          dayMatrixResult.pointIds.every((id, index) => id === expectedPoints[index].id);

        if (dayHotel) {
          return optimizeDayRouteWithHotel(dayHotel, dayPoints, hasDayRoadMatrix
            ? {
                matrix: dayMatrixResult.matrix,
                matrixSource: 'osrm-table',
                matrixCostUnit: 's',
                criterion: 'duration',
                matrixPointIds: dayMatrixResult.pointIds,
              }
            : { isApproximate: true }).orderedAttractions;
        }

        const dayMatrix = hasDayRoadMatrix ? dayMatrixResult.matrix : undefined;
        return optimizeSightseeingRoute(
          dayPoints,
          false,
          dayMatrix
            ? { customMatrix: dayMatrix, criterion: 'duration', isApproximate: false }
            : undefined,
          'duration',
          !dayMatrix
        ).orderedPoints;
      });

      const requiredDays = Object.keys(dayRoutingInputs);
      const isApproximate = isApproximateMode ||
        hasUnroutableDayLodging ||
        (requiredDays.length > 0 && !requiredDays.every((day) => Boolean(dayRoadMatrices[day])));
      const benchmark: AlgorithmBenchmark = {
        algorithmId: '2opt',
        name: isApproximate ? 'Optymalizacja dzienna (szacunek)' : 'Optymalizacja dzienna (OSRM)',
        distanceKm: 0,
        timeMs: 1,
        iterations: 1,
        routeIndices: orderedByDay.map((_, index) => index),
        cost: 0,
        costUnit: isApproximate ? 'km' : 'seconds',
      };
      return {
        orderedPoints: orderedByDay,
        originalDistanceKm: 0,
        optimizedDistanceKm: 0,
        savingsKm: 0,
        savingsPercent: 0,
        timeSavedMinutes: 0,
        bestAlgorithm: benchmark,
        benchmarks: [benchmark],
        hasCollapsedCoordinates: false,
        isApproximate,
        criterion: isApproximate ? 'distance' : 'duration',
        originalCost: 0,
        optimizedCost: 0,
        costUnit: isApproximate ? 'km' : 'seconds',
        routeStatus: isApproximate ? 'straight_line_estimate' : 'road_confirmed',
        timeEstimateCategory: isApproximate ? 'none_in_approximate_mode' : 'osrm_road_duration',
        metricsAvailable: false,
      };
    }

    // Przypadek 1: Dzień z hotelem jako startem i punktem powrotnym
    if (isSingleDayMode && hotelPoint) {
      if (
        activeSource === 'osrm' &&
        roadMatrix &&
        roadMatrix.length === geoPoints.length + 1
      ) {
        try {
          const dayRes = optimizeDayRouteWithHotel(hotelPoint, geoPoints, {
            matrix: roadMatrix,
            matrixSource: 'osrm-table',
            matrixCostUnit: 's',
            criterion: 'duration',
            isApproximate: false,
          });
          const benchmark: AlgorithmBenchmark = {
            algorithmId: '2opt',
            name: 'Optymalizacja ATSP z hotelem',
            distanceKm: 0,
            timeMs: 1,
            iterations: 1,
            routeIndices: dayRes.orderedAttractions.map((_, i) => i),
            cost: dayRes.totalCost,
            costUnit: 'seconds',
          };
          return {
            orderedPoints: dayRes.orderedAttractions,
            originalDistanceKm: 0,
            optimizedDistanceKm: 0,
            savingsKm: 0,
            savingsPercent: 0,
            timeSavedMinutes: 0,
            bestAlgorithm: benchmark,
            benchmarks: [benchmark],
            hasCollapsedCoordinates: false,
            isApproximate: false,
            criterion: 'duration',
            originalCost: dayRes.totalCost,
            optimizedCost: dayRes.totalCost,
            costUnit: 'seconds',
            routeStatus: 'road_confirmed',
            timeEstimateCategory: 'osrm_road_duration',
          };
        } catch {
          // fallback
        }
      }

      const approxRes = optimizeDayRouteWithHotel(hotelPoint, geoPoints, {
        isApproximate: true,
      });
      const benchmark: AlgorithmBenchmark = {
        algorithmId: '2opt',
        name: 'Szacunek przybliżony z hotelem',
        distanceKm: approxRes.totalCost,
        timeMs: 1,
        iterations: 1,
        routeIndices: approxRes.orderedAttractions.map((_, i) => i),
        cost: approxRes.totalCost,
        costUnit: 'km',
      };
      return {
        orderedPoints: approxRes.orderedAttractions,
        originalDistanceKm: approxRes.totalCost,
        optimizedDistanceKm: approxRes.totalCost,
        savingsKm: 0,
        savingsPercent: 0,
        timeSavedMinutes: 0,
        bestAlgorithm: benchmark,
        benchmarks: [benchmark],
        hasCollapsedCoordinates: false,
        isApproximate: true,
        criterion: 'distance',
        originalCost: approxRes.totalCost,
        optimizedCost: approxRes.totalCost,
        costUnit: 'km',
        routeStatus: 'straight_line_estimate',
        timeEstimateCategory: 'none_in_approximate_mode',
      };
    }

    // Przypadek 2: Bez hotelu lub cały wyjazd
    if (
      activeSource === 'osrm' &&
      roadMatrix &&
      roadMatrix.length === geoPoints.length
    ) {
      return optimizeSightseeingRoute(geoPoints, false, {
        customMatrix: roadMatrix,
        criterion: 'duration',
        isApproximate: false,
      });
    }

    // Wstępny fallback (np. podczas ładowania) lub jawny tryb przybliżony
    return optimizeSightseeingRoute(geoPoints, false, undefined, 'distance', true);
  }, [
    geoPoints,
    isSingleDayMode,
    hotelPoint,
    activeSource,
    roadMatrix,
    activeDayScope,
    uniqueDays,
    candidateEvents,
    isMultiDayAllMode,
    dayRoutingInputs,
    hasUnroutableDayLodging,
    dayRoadMatrices,
    isApproximateMode,
    events,
    poolAttractions,
    destinationCity,
    lodgingCoords,
    language,
  ]);

  // Mapowanie przypisania punktów do poszczególnych dni w podglądzie całego wyjazdu
  // Każda atrakcja zachowuje swój przypisany dzień kalendarzowy (brak niepożądanego przenoszenia)
  const dayAssignmentMap = useMemo(() => {
    if (!optimizationResult || uniqueDays.length <= 1 || activeDayScope !== 'ALL') {
      return null;
    }
    const map: Record<string, { dayIndex: number; dayDate: string; isFirstInDay: boolean; isLastInDay: boolean }> = {};
    const pointDates = optimizationResult.orderedPoints.map((point) =>
      events.find((event) => event.id === point.id)?.dateStr || uniqueDays[0]
    );
    const seenDays = new Set<string>();
    optimizationResult.orderedPoints.forEach((pt, index) => {
      const originalEvt = events.find((e) => e.id === pt.id);
      const dayDate = originalEvt?.dateStr || uniqueDays[0];
      const dayIndex = uniqueDays.indexOf(dayDate) + 1;
      const isFirstInDay = !seenDays.has(dayDate);
      seenDays.add(dayDate);
      map[pt.id] = {
        dayIndex: dayIndex > 0 ? dayIndex : 1,
        dayDate,
        isFirstInDay,
        isLastInDay: pointDates[index + 1] !== dayDate,
      };
    });
    return map;
  }, [optimizationResult, uniqueDays, activeDayScope, events]);

  // Resolve only missing point coordinates; route guidance is opened directly in Google Maps.
  const loadLiveAbortRef = useRef<AbortController | null>(null);
  const loadLiveReqIdRef = useRef<number>(0);

  useEffect(() => {
    if (!visible || routeLocationEvents.length === 0) {
      if (loadLiveAbortRef.current) {
        loadLiveAbortRef.current.abort();
        loadLiveAbortRef.current = null;
      }
      return;
    }

    if (isTestEnvironment()) {
      return;
    }

    if (loadLiveAbortRef.current) {
      loadLiveAbortRef.current.abort();
    }
    const abortController = new AbortController();
    loadLiveAbortRef.current = abortController;
    const reqId = ++loadLiveReqIdRef.current;

    const resolveMissingCoordinates = async () => {
      try {
        const fetchedCoords: Record<string, { lat: number; lon: number; isUnresolved?: boolean }> = {};
        for (const evt of routeLocationEvents) {
          if (abortController.signal.aborted) break;
          const hasCoords =
            typeof evt.lat === 'number' &&
            Number.isFinite(evt.lat) &&
            typeof evt.lon === 'number' &&
            Number.isFinite(evt.lon);
          if (!hasCoords) {
            const place = await fetchGooglePlaceLocation(
              evt.type === 'LODGING' ? (evt.subtitle?.trim() || evt.title) : evt.title,
              destinationCity,
              {
              signal: abortController.signal,
              }
            );
            if (
              place &&
              typeof place.lat === 'number' &&
              Number.isFinite(place.lat) &&
              typeof place.lon === 'number' &&
              Number.isFinite(place.lon)
            ) {
              fetchedCoords[evt.id] = { lat: place.lat, lon: place.lon, isUnresolved: false };
            }
          }
        }

        if (Object.keys(fetchedCoords).length > 0 && !abortController.signal.aborted && reqId === loadLiveReqIdRef.current) {
          setLiveCoordsMap((prev) => ({ ...prev, ...fetchedCoords }));
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.warn('Nie udało się ustalić części lokalizacji:', err);
        }
      }
    };

    resolveMissingCoordinates();

    return () => {
      abortController.abort();
    };
  }, [visible, routeLocationEvents, destinationCity]);

  const handleConfirmApply = () => {
    if (osrmStatus === 'loading' || hasUnresolvedPoints) {
      return;
    }
    if (!optimizationResult && candidateEvents.length < 2) {
      onClose();
      return;
    }

    const finalTimeline = optimizeMultiDayTimeline({
      events,
      targetDay: activeDayScope,
      poolAttractions,
      destinationCity,
      lodgingCoords,
      roadCostMatrix: activeSource === 'osrm' ? roadMatrix : null,
      costCriterion: 'duration',
      precomputedOrderedPoints: optimizationResult?.orderedPoints || null,
      isApproximateMode: activeSource === 'approximate',
      tripStartDate,
      tripEndDate,
    });

    onApply(finalTimeline);
    onClose();
  };

  const dayRouteCards = isMultiDayAllMode && optimizationResult
    ? uniqueDays.map((day) => {
        const dayPoints = optimizationResult.orderedPoints.filter(
          (point) => events.find((event) => event.id === point.id)?.dateStr === day
        );
        const lodgingEvent = getLodgingEventForDay(day);
        const dayHotel = getHotelPointForDay(day);
        const hotelUnavailable = Boolean(lodgingEvent && !dayHotel);
        const routePoints: GeoPoint[] = dayHotel
          ? [dayHotel, ...dayPoints, dayHotel]
          : dayPoints;
        const mapsPoints = routePoints.map((point) => ({
          ...point,
          lat: point.isUnresolved ? undefined : point.lat,
          lon: point.isUnresolved ? undefined : point.lon,
        }));
        return {
          day,
          dayHotel,
          hotelUnavailable,
          routeUrls: buildGoogleMapsFullRouteUrls(
            mapsPoints,
            destinationCity,
            selectedTransportProfile
          ),
        };
      })
    : [];
  const fullRouteUrls = !isMultiDayAllMode && optimizationResult
    ? buildGoogleMapsFullRouteUrls(
        (hotelPoint
          ? [hotelPoint, ...optimizationResult.orderedPoints, hotelPoint]
          : optimizationResult.orderedPoints
        ).map((point) => ({
          ...point,
          lat: point.isUnresolved ? undefined : point.lat,
          lon: point.isUnresolved ? undefined : point.lon,
        })),
        destinationCity,
        selectedTransportProfile
      )
    : [];

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* HEADER MODALA */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.headerIconBox}>
                <Ionicons name="map-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{t.optimizeModalTitle}</Text>
                <Text style={styles.modalSubtitle}>{t.optimizeModalSubtitle}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* PRZEŁĄCZNIK PROFILU TRANSPORTU: SAMOCHÓD / PIESZO */}
          <View style={styles.profileSelectorRow} testID="profile-selector-container">
            <TouchableOpacity
              style={[styles.profileOptionBtn, selectedTransportProfile === 'driving' && styles.profileOptionBtnActive]}
              onPress={() => {
                if (selectedTransportProfile !== 'driving') {
                  setSelectedTransportProfile('driving');
                  setIsApproximateMode(false);
                }
              }}
              activeOpacity={0.8}
              testID="profile-btn-driving"
            >
              <Ionicons
                name="car-outline"
                size={13}
                color={selectedTransportProfile === 'driving' ? '#0F172A' : '#94A3B8'}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.profileOptionText, selectedTransportProfile === 'driving' && styles.profileOptionTextActive]}>
                {language === 'en' ? 'Driving' : 'Samochód'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileOptionBtn, selectedTransportProfile === 'walking' && styles.profileOptionBtnActive]}
              onPress={() => {
                if (selectedTransportProfile !== 'walking') {
                  setSelectedTransportProfile('walking');
                  setIsApproximateMode(false);
                }
              }}
              activeOpacity={0.8}
              testID="profile-btn-walking"
            >
              <Ionicons
                name="walk-outline"
                size={13}
                color={selectedTransportProfile === 'walking' ? '#0F172A' : '#94A3B8'}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.profileOptionText, selectedTransportProfile === 'walking' && styles.profileOptionTextActive]}>
                {language === 'en' ? 'Walking' : 'Pieszo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* PRZEŁĄCZNIK ZAKRESU (CAŁY WYJAZD / POSZCZEGÓLNE DNI) */}
          {uniqueDays.length > 1 && (
            <View style={styles.scopeSelectorContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeTabsScroll}>
                <TouchableOpacity
                  style={[styles.scopeTabBtn, activeDayScope === 'ALL' && styles.scopeTabBtnActive]}
                  onPress={() => {
                    setActiveDayScope('ALL');
                    setIsApproximateMode(false);
                  }}
                  activeOpacity={0.7}
                  testID="scope-tab-all"
                >
                  <Ionicons
                    name="layers-outline"
                    size={13}
                    color={activeDayScope === 'ALL' ? '#0F172A' : '#94A3B8'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.scopeTabText, activeDayScope === 'ALL' && styles.scopeTabTextActive]}>
                    {language === 'en' ? 'Entire trip' : 'Cały wyjazd'}
                  </Text>
                </TouchableOpacity>

                {uniqueDays.map((dStr, idx) => {
                  const isSelected = activeDayScope === dStr;
                  const countOnDay = events.filter((e) => e.type === 'ATTRACTION' && e.dateStr === dStr).length;
                  const shortDate = dStr.slice(0, 5);
                  return (
                    <TouchableOpacity
                      key={dStr}
                      style={[styles.scopeTabBtn, isSelected && styles.scopeTabBtnActive]}
                      onPress={() => {
                        setActiveDayScope(dStr);
                        setIsApproximateMode(false);
                      }}
                      activeOpacity={0.7}
                      testID={`scope-tab-day-${idx}`}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={13}
                        color={isSelected ? '#0F172A' : '#94A3B8'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.scopeTabText, isSelected && styles.scopeTabTextActive]}>
                        {`${language === 'en' ? 'Day' : 'Dzień'} ${idx + 1} • ${shortDate} (${countOnDay})`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Trasa is calculated while loading */}
          {osrmStatus === 'loading' && (
            <View style={styles.liveLoadingBanner} testID="osrm-loading-banner">
              <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.liveLoadingText}>
                {language === 'en' ? 'Arranging stops...' : 'Układam kolejność miejsc...'}
              </Text>
            </View>
          )}

          {/* BANER BŁĘDU POBIERANIA SIECI DROGOWEJ OSRM */}
          {osrmStatus === 'error' && (
            <View style={styles.osrmErrorBanner} testID="osrm-error-banner">
              <Ionicons name="alert-circle-outline" size={24} color="#EF4444" style={{ marginRight: 10, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.osrmErrorTitle}>
                  {hasUnresolvedPoints
                    ? language === 'en' ? 'Some locations need checking' : 'Sprawdź lokalizacje miejsc'
                    : language === 'en' ? 'Could not arrange the route' : 'Nie udało się ułożyć trasy'}
                </Text>
                <Text style={styles.osrmErrorDesc}>
                  {hasUnresolvedPoints
                    ? language === 'en'
                      ? 'Some stops do not have a confirmed location.'
                      : 'Niektóre miejsca nie mają potwierdzonej lokalizacji.'
                    : language === 'en'
                      ? 'Check your connection, try again, or use an approximate order.'
                      : 'Sprawdź połączenie, spróbuj ponownie albo użyj szacunkowej kolejności.'}
                </Text>
                <View style={styles.osrmErrorBtnRow}>
                  <TouchableOpacity
                    style={styles.osrmRetryBtn}
                    onPress={() => {
                      setIsApproximateMode(false);
                      setRetryTrigger((prev) => prev + 1);
                    }}
                    activeOpacity={0.8}
                    testID="osrm-retry-btn"
                  >
                    <Ionicons name="refresh-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.osrmRetryBtnText}>
                      {language === 'en' ? 'Retry' : 'Ponów próbę'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.osrmApproximateBtn}
                    onPress={() => setIsApproximateMode(true)}
                    activeOpacity={0.8}
                    testID="osrm-fallback-btn"
                  >
                    <Text style={styles.osrmApproximateBtnText}>
                      {language === 'en' ? 'Use approximate order' : 'Użyj szacunkowej kolejności'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {geoPoints.length < 2 ? (
            <View style={styles.notEnoughBox}>
              <Ionicons name="information-circle-outline" size={32} color="#F59E0B" style={{ marginBottom: 12 }} />
              <Text style={styles.notEnoughText}>{t.notEnoughAttractions}</Text>
              {activeDayScope !== 'ALL' && uniqueDays.length > 1 && (
                <TouchableOpacity
                  style={[styles.cancelBtnOnly, { marginBottom: 12, backgroundColor: '#F59E0B' }]}
                  onPress={() => setActiveDayScope('ALL')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelBtnText, { color: '#0F172A', fontWeight: '800' }]}>
                    {language === 'en' ? 'Switch to entire trip' : 'Przełącz na cały wyjazd'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelBtnOnly} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>{commonT.button_close}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {activeSource === 'approximate' && osrmStatus !== 'loading' && (
                <View style={styles.approximateWarningBanner} testID="approximate-mode-banner">
                  <Ionicons name="information-circle-outline" size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={styles.approximateWarningText}>
                    {language === 'en' ? 'Order may be approximate.' : 'Kolejność może być orientacyjna.'}
                  </Text>
                </View>
              )}

              {/* OSTRZEŻENIE O BRAKU WSPÓŁRZĘDNYCH / KOLAPSIE PUNKTÓW */}
              {optimizationResult?.hasCollapsedCoordinates && (
                <View style={styles.collapsedWarningBanner} testID="collapsed-coordinates-warning">
                  <Ionicons name="warning-outline" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.collapsedWarningTitle}>
                      {t.approximateCoordsWarningTitle || (language === 'en' ? 'Approximate coordinates' : 'Przybliżone współrzędne')}
                    </Text>
                    <Text style={styles.collapsedWarningDesc}>
                      {t.approximateCoordsWarningDesc || (language === 'en'
                        ? 'Some points do not have exact GPS coordinates. Route sequence and distances are estimated.'
                        : 'Część punktów nie posiada dokładnych współrzędnych GPS. Kolejność i odległości na trasie mają charakter szacunkowy.')}
                    </Text>
                  </View>
                </View>
              )}

              {/* PRZYCISK ZOBACZ CAŁĄ TRASĘ W GOOGLE MAPS */}
              {optimizationResult && (
                <View style={styles.fullRouteContainer}>
                  {isMultiDayAllMode ? (
                    dayRouteCards.map((route, index) => (
                      <View key={route.day} style={{ marginBottom: 8 }}>
                        {route.routeUrls.map((url, segmentIndex) => (
                          <TouchableOpacity
                            key={`${route.day}-${segmentIndex}`}
                            style={[styles.fullRouteBtn, { marginBottom: 6 }]}
                            activeOpacity={0.8}
                            onPress={() => {
                              Linking.openURL(url).catch((err) => {
                                console.warn('Cannot open daily route in Google Maps:', err);
                              });
                            }}
                            testID={segmentIndex === 0
                              ? `maps-day-route-btn-${index}`
                              : `maps-day-route-btn-${index}-segment-${segmentIndex}`}
                          >
                            <View style={styles.fullRouteIconBox}>
                              <Ionicons name="map" size={18} color="#38BDF8" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.fullRouteBtnTitle}>
                                {route.routeUrls.length > 1
                                  ? language === 'en'
                                    ? `Day ${index + 1} · part ${segmentIndex + 1}/${route.routeUrls.length}`
                                    : `Dzień ${index + 1} · etap ${segmentIndex + 1}/${route.routeUrls.length}`
                                  : language === 'en'
                                    ? `Day ${index + 1} route in Google Maps`
                                    : `Trasa dnia ${index + 1} w Google Maps`}
                              </Text>
                              {segmentIndex === 0 && route.hotelUnavailable && (
                                <Text style={styles.fullRouteBtnSubtitle}>
                                  {language === 'en' ? 'Hotel location unavailable' : 'Brak lokalizacji hotelu'}
                                </Text>
                              )}
                            </View>
                            <Ionicons name="open-outline" size={16} color="#38BDF8" style={{ marginLeft: 8 }} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))
                  ) : (
                    fullRouteUrls.map((url, segmentIndex) => (
                      <TouchableOpacity
                        key={`full-route-${segmentIndex}`}
                        style={[styles.fullRouteBtn, { marginBottom: 6 }]}
                        activeOpacity={0.8}
                        onPress={() => {
                          Linking.openURL(url).catch((err) => {
                            console.warn('Cannot open full route in Google Maps:', err);
                          });
                        }}
                        testID={segmentIndex === 0
                          ? 'view-full-route-maps-btn'
                          : `view-full-route-maps-btn-segment-${segmentIndex}`}
                      >
                        <View style={styles.fullRouteIconBox}>
                          <Ionicons name="map" size={18} color="#38BDF8" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fullRouteBtnTitle}>
                            {fullRouteUrls.length > 1
                              ? language === 'en'
                                ? `Route · part ${segmentIndex + 1}/${fullRouteUrls.length}`
                                : `Trasa · etap ${segmentIndex + 1}/${fullRouteUrls.length}`
                              : t.viewEntireRouteInMaps}
                          </Text>
                          {segmentIndex === 0 && (
                            <Text style={styles.fullRouteBtnSubtitle}>
                              {hotelPoint
                                ? language === 'en' ? 'Hotel → sights → hotel' : 'Hotel → atrakcje → hotel'
                                : t.fullRouteCardDesc}
                            </Text>
                          )}
                        </View>
                        <Ionicons name="open-outline" size={16} color="#38BDF8" style={{ marginLeft: 8 }} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* PODGLĄD USZEREGOWANEJ TRASY */}
              {optimizationResult && (
                <View
                  style={styles.routePreviewSection}
                  testID={activeSource === 'osrm' ? 'route-ready-indicator' : undefined}
                >
                  <Text style={styles.routePreviewTitle}>{t.previewRoute}</Text>

                  {hasUnresolvedPoints && (
                    <View style={styles.unresolvedNoticeBanner}>
                      <Ionicons name="warning-outline" size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                      <Text style={styles.unresolvedNoticeText}>
                        {language === 'en'
                          ? 'Some places do not have exact GPS coordinates. Distances and times for these items are estimates.'
                          : 'Niektóre atrakcje nie posiadają dokładnych współrzędnych GPS. Czasy i odległości dla tych miejsc są orientacyjne.'}
                      </Text>
                    </View>
                  )}
                  {isSingleDayMode && hotelPoint && (
                    <View style={styles.previewStepRow}>
                      <View style={styles.previewStepLeft}>
                        <View style={[styles.previewStepNumberBadge, { backgroundColor: '#38BDF8' }]}>
                          <Ionicons name="business" size={13} color="#0F172A" />
                        </View>
                        <View style={styles.previewStepLine} />
                      </View>
                      <View style={styles.previewStepRight}>
                        <View style={[styles.previewPointCard, { borderColor: '#38BDF8' }]}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.previewPointTitle}>{hotelPoint.title}</Text>
                            <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                              {hotelPoint.subtitle || (language === 'en' ? 'Start: Lodging' : 'Start dnia: Nocleg')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                  {optimizationResult.orderedPoints.map((pt, idx) => {
                    const dayInfo = dayAssignmentMap ? dayAssignmentMap[pt.id] : null;
                    const nextCandidate = optimizationResult.orderedPoints[idx + 1];
                    const nextPt = dayAssignmentMap && dayAssignmentMap[nextCandidate?.id || '']?.dayDate !== dayInfo?.dayDate
                      ? undefined
                      : nextCandidate;
                    const dayHotel = dayInfo ? getHotelPointForDay(dayInfo.dayDate) : null;

                    return (
                      <React.Fragment key={pt.id}>
                        {dayInfo && dayInfo.isFirstInDay && (
                          <View style={styles.daySectionHeader}>
                            <Ionicons name="calendar-outline" size={13} color="#F59E0B" style={{ marginRight: 6 }} />
                            <Text style={styles.daySectionHeaderText}>
                              {`${language === 'en' ? 'Day' : 'Dzień'} ${dayInfo.dayIndex} • ${dayInfo.dayDate}`}
                            </Text>
                          </View>
                        )}
                        {dayInfo?.isFirstInDay && dayHotel && (
                          <View style={styles.previewStepRow}>
                            <View style={styles.previewStepLeft}>
                              <View style={[styles.previewStepNumberBadge, { backgroundColor: '#38BDF8' }]}>
                                <Ionicons name="business" size={13} color="#0F172A" />
                              </View>
                              <View style={styles.previewStepLine} />
                            </View>
                            <View style={styles.previewStepRight}>
                              <View style={[styles.previewPointCard, { borderColor: '#38BDF8' }]}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <Text style={styles.previewPointTitle}>{dayHotel.title}</Text>
                                  <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                                    {dayHotel.subtitle || (language === 'en' ? 'Start day: lodging' : 'Start dnia: nocleg')}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        )}
                        <View style={styles.previewStepRow}>
                        <View style={styles.previewStepLeft}>
                          <View style={styles.previewStepNumberBadge}>
                            <Text style={styles.previewStepNumberText}>{idx + 1}</Text>
                          </View>
                          {nextPt && <View style={styles.previewStepLine} />}
                        </View>
                        <View style={styles.previewStepRight}>
                          <View style={styles.previewPointCard}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.previewPointTitle}>{pt.title}</Text>
                              {pt.subtitle ? (
                                <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                                  {pt.subtitle}
                                </Text>
                              ) : null}
                              {pt.isUnresolved && (
                                <View style={styles.unresolvedBadge}>
                                  <Ionicons name="alert-circle-outline" size={12} color="#F59E0B" style={{ marginRight: 4 }} />
                                  <Text style={styles.unresolvedBadgeText}>
                                    {language === 'en' ? 'Estimated GPS' : 'Orientacyjna lokalizacja (brak GPS)'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              style={styles.pointNavigateBtn}
                              activeOpacity={0.7}
                              onPress={() => {
                                const target = pt.isUnresolved
                                  ? { ...pt, lat: undefined, lon: undefined }
                                  : pt;
                                const url = buildGoogleMapsNavigationToDestinationUrl(target, destinationCity);
                                Linking.openURL(url).catch((err) => console.warn('Cannot open Google Maps:', err));
                              }}
                              testID={`preview-point-maps-btn-${idx}`}
                            >
                              <Ionicons name="navigate-outline" size={13} color="#38BDF8" style={{ marginRight: 4 }} />
                              <Text style={styles.pointNavigateBtnText}>{t.navigateBtn || (language === 'en' ? 'Navigate' : 'Nawiguj')}</Text>
                            </TouchableOpacity>
                          </View>

                        </View>
                      </View>
                      {dayInfo?.isLastInDay && dayHotel && (
                        <View style={styles.previewStepRow}>
                          <View style={styles.previewStepLeft}>
                            <View style={[styles.previewStepNumberBadge, { backgroundColor: '#38BDF8' }]}>
                              <Ionicons name="business" size={13} color="#0F172A" />
                            </View>
                          </View>
                          <View style={styles.previewStepRight}>
                            <View style={[styles.previewPointCard, { borderColor: '#38BDF8' }]}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.previewPointTitle}>{dayHotel.title}</Text>
                                <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                                  {dayHotel.subtitle || (language === 'en' ? 'Return: lodging' : 'Powrót: nocleg')}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      )}
                    </React.Fragment>
                  );
                })}
                {isSingleDayMode && hotelPoint && (
                  <View style={styles.previewStepRow}>
                    <View style={styles.previewStepLeft}>
                      <View style={[styles.previewStepNumberBadge, { backgroundColor: '#38BDF8' }]}>
                        <Ionicons name="business" size={13} color="#0F172A" />
                      </View>
                    </View>
                    <View style={styles.previewStepRight}>
                      <View style={[styles.previewPointCard, { borderColor: '#38BDF8' }]}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.previewPointTitle}>{hotelPoint.title}</Text>
                          <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                            {hotelPoint.subtitle || (language === 'en' ? 'Return: Lodging' : 'Powrót: Nocleg')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
              )}

              {/* PRZYCISKI AKCJI */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  testID="confirm-apply-button"
                  style={[
                    styles.applyBtn,
                    (osrmStatus === 'loading' || hasUnresolvedPoints) && styles.applyBtnDisabled,
                  ]}
                  onPress={handleConfirmApply}
                  disabled={osrmStatus === 'loading' || hasUnresolvedPoints}
                  activeOpacity={0.8}
                >
                  {osrmStatus === 'loading' ? (
                    <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 8 }} testID="apply-loading-spinner" />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.applyBtnText}>{t.applyOptimization}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>{commonT.button_cancel}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  onlineBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 189, 248, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  liveLoadingText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  modalDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  notEnoughBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notEnoughText: {
    color: '#CBD5E1',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  cancelBtnOnly: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },

  // Przycisk całej trasy
  fullRouteContainer: {
    marginBottom: 16,
  },
  fullRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
  },
  fullRouteIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  fullRouteBtnTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  fullRouteBtnSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  // Podgląd trasy
  routePreviewSection: {
    marginBottom: 20,
  },
  routePreviewTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  previewStepRow: {
    flexDirection: 'row',
  },
  previewStepLeft: {
    width: 32,
    alignItems: 'center',
  },
  previewStepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewStepNumberText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '900',
  },
  previewStepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  previewStepRight: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 12,
  },
  previewPointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  previewPointTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  previewPointSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  pointNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pointNavigateBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  // Przyciski
  actionsRow: {
    marginTop: 6,
    gap: 10,
  },
  applyBtn: {
    flexDirection: 'row',
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  applyBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  scopeSelectorContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  scopeTabsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  scopeTabBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  scopeTabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  scopeTabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    marginTop: 6,
  },
  daySectionHeaderText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
  },
  collapsedWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  collapsedWarningTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  collapsedWarningDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  osrmErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
  },
  osrmErrorTitle: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  osrmErrorDesc: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  osrmErrorBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  osrmRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  osrmRetryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  osrmApproximateBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  osrmApproximateBtnText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  profileSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  profileOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  profileOptionBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  profileOptionText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  profileOptionTextActive: {
    color: '#0F172A',
  },
  applyBtnDisabled: {
    opacity: 0.6,
  },
  approximateWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  approximateWarningText: {
    fontSize: 12,
    color: '#FDE68A',
    flex: 1,
    lineHeight: 16,
  },
  unresolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  unresolvedBadgeText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '500',
  },
  unresolvedNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  unresolvedNoticeText: {
    fontSize: 12,
    color: '#FCD34D',
    flex: 1,
    lineHeight: 16,
  },
});
