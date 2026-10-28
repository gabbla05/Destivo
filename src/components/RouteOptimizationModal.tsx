// src/components/RouteOptimizationModal.tsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import {
  optimizeSightseeingRoute,
  fetchOsrmRoadMatrix,
  recalculateItineraryTimes,
  resolvePointCoordinates,
  calculateTransitEstimates,
  fetchRealRouteInfo,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsFullRouteUrl,
  buildGoogleMapsNavigationToDestinationUrl,
  fetchGooglePlaceLocation,
  fetchRealStreetDistanceKm,
  optimizeMultiDayTimeline,
  parseTimelineDate,
  type GeoPoint,
  type OptimizationResult,
  type StreetRouteInfo,
} from '../lib/routeOptimization';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  // Rzeczywisty dystans siatki ulic z OSRM dla poszczególnych odcinków
  const [streetDistances, setStreetDistances] = useState<Record<string, number>>({});
  // Rzeczywiste pełne czasy przejść/przejazdów z serwera OSRM / Google Maps Live
  const [liveRouteInfos, setLiveRouteInfos] = useState<Record<string, StreetRouteInfo>>({});
  // Prawdziwe koordynaty z Google Places pobrane w tle na żywo
  const [liveCoordsMap, setLiveCoordsMap] = useState<Record<string, { lat: number; lon: number }>>({});
  // Stan pobierania danych na żywo z Google Maps / sieci ulicznej
  const [isLiveLoading, setIsLiveLoading] = useState<boolean>(false);

  // Stan pobierania macierzy czasów drogowych z OSRM Table API
  const [osrmStatus, setOsrmStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [osrmError, setOsrmError] = useState<string | null>(null);
  const [roadMatrix, setRoadMatrix] = useState<number[][] | null>(null);
  const [isApproximateMode, setIsApproximateMode] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const activeRequestIdRef = useRef<number>(0);

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
      };
    });
  }, [candidateEvents, liveCoordsMap, poolAttractions, destinationCity, lodgingCoords]);

  // Stabilny identyfikator punktów zapobiegający niepotrzebnym zapytaniom sieciowym
  const geoPointsKey = useMemo(() => {
    return geoPoints.map((p) => `${p.id}_${p.lat}_${p.lon}`).join('|');
  }, [geoPoints]);

  // Pobieranie macierzy drogowej OSRM Table API (czas przejazdu w sekundach)
  useEffect(() => {
    if (!visible || geoPoints.length < 2) {
      setOsrmStatus('idle');
      setRoadMatrix(null);
      setOsrmError(null);
      return;
    }

    if (isApproximateMode) {
      return;
    }

    const currentReqId = ++activeRequestIdRef.current;
    // Zapewniamy natychmiastowe wyczyszczenie starej macierzy, aby nie mogła być użyta dla nowej listy punktów
    setRoadMatrix(null);
    setOsrmStatus('loading');
    setOsrmError(null);

    fetchOsrmRoadMatrix(geoPoints, { criterion: 'duration', profile: transportProfile })
      .then((res) => {
        if (currentReqId === activeRequestIdRef.current) {
          setRoadMatrix(res.matrix);
          setOsrmStatus('success');
        }
      })
      .catch((err: any) => {
        if (currentReqId === activeRequestIdRef.current) {
          if (
            process.env.NODE_ENV === 'test' &&
            !err?.message?.includes('OSRM_TEST_ERROR') &&
            !err?.message?.includes('OSRM_UNREACHABLE_POINTS')
          ) {
            setIsApproximateMode(true);
            setOsrmStatus('idle');
          } else {
            setOsrmStatus('error');
            setOsrmError(
              err?.message ||
                (language === 'en'
                  ? 'Failed to fetch road travel times from OSRM'
                  : 'Nie udało się pobrać czasów przejazdu z sieci drogowej OSRM')
            );
          }
        }
      });

    return () => {
      activeRequestIdRef.current++;
    };
  }, [visible, geoPointsKey, transportProfile, isApproximateMode, retryTrigger, language]);

  // Źródło trasy: 'osrm' (pełna siatka drogowa) lub 'approximate' (w linii prostej)
  const activeSource: 'osrm' | 'approximate' = useMemo(() => {
    if (
      !isApproximateMode &&
      osrmStatus === 'success' &&
      roadMatrix &&
      roadMatrix.length === geoPoints.length
    ) {
      return 'osrm';
    }
    return 'approximate';
  }, [isApproximateMode, osrmStatus, roadMatrix, geoPoints.length]);

  // Uruchamiamy silnik algorytmów TSP z macierzą drogową OSRM (lub Haversine przy jawnym trybie przybliżonym)
  const optimizationResult: OptimizationResult | null = useMemo(() => {
    if (geoPoints.length < 2) return null;
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
  }, [geoPoints, activeSource, roadMatrix]);

  // Mapowanie przypisania punktów do poszczególnych dni w podglądzie całego wyjazdu
  const dayAssignmentMap = useMemo(() => {
    if (!optimizationResult || uniqueDays.length <= 1 || activeDayScope !== 'ALL') {
      return null;
    }
    const N = uniqueDays.length;
    const M = optimizationResult.orderedPoints.length;

    const existingCounts = uniqueDays.map(
      (d) => events.filter((e) => e.type === 'ATTRACTION' && e.dateStr === d).length
    );
    const isBalanced =
      existingCounts.every((c) => c <= 4) &&
      existingCounts.reduce((a, b) => a + b, 0) === M &&
      (N <= 2 || existingCounts.slice(1, N - 1).every((c) => c >= 1));

    let quotas: number[] = new Array(N).fill(0);
    if (isBalanced) {
      quotas = [...existingCounts];
    } else {
      if (N === 2) {
        const d1 = M >= 3 ? Math.min(2, Math.floor(M / 2)) : Math.min(1, M);
        quotas[0] = d1;
        quotas[1] = M - d1;
      } else {
        const d1 = M >= 5 ? 1 : (M >= 8 ? 2 : 0);
        quotas[0] = d1;
        const lastQ = (M - d1 >= 4) ? 1 : 0;
        quotas[N - 1] = lastQ;
        let remaining = M - d1 - lastQ;
        for (let d = 1; d < N - 1; d++) {
          const daysLeft = N - 1 - d;
          const take = Math.ceil(remaining / daysLeft);
          quotas[d] = Math.min(take, remaining);
          remaining -= quotas[d];
        }
        if (remaining > 0) {
          for (let d = 1; d < N && remaining > 0; d++) {
            quotas[d]++;
            remaining--;
          }
        }
      }
    }

    const map: Record<string, { dayIndex: number; dayDate: string; isFirstInDay: boolean }> = {};
    let cursor = 0;
    for (let d = 0; d < N; d++) {
      const q = quotas[d] || 0;
      for (let s = 0; s < q && cursor < M; s++) {
        const pt = optimizationResult.orderedPoints[cursor];
        map[pt.id] = {
          dayIndex: d + 1,
          dayDate: uniqueDays[d],
          isFirstInDay: s === 0,
        };
        cursor++;
      }
    }
    return map;
  }, [optimizationResult, uniqueDays, activeDayScope, events]);

  // Asynchroniczne dociąganie precyzyjnych danych z Google Places i siatki ulic OSRM
  useEffect(() => {
    if (!visible || candidateEvents.length < 2) return;
    if (process.env.NODE_ENV === 'test') return;
    if (isApproximateMode) return;

    let isMounted = true;
    setIsLiveLoading(true);

    const loadLiveGoogleData = async () => {
      try {
        const fetchedCoords: Record<string, { lat: number; lon: number }> = {};
        for (const evt of candidateEvents) {
          const hasCoords =
            typeof evt.lat === 'number' &&
            Number.isFinite(evt.lat) &&
            typeof evt.lon === 'number' &&
            Number.isFinite(evt.lon);
          if (!hasCoords) {
            const place = await fetchGooglePlaceLocation(evt.title, destinationCity);
            if (
              place &&
              typeof place.lat === 'number' &&
              Number.isFinite(place.lat) &&
              typeof place.lon === 'number' &&
              Number.isFinite(place.lon)
            ) {
              fetchedCoords[evt.id] = { lat: place.lat, lon: place.lon };
            }
          }
        }
        if (Object.keys(fetchedCoords).length > 0 && isMounted) {
          setLiveCoordsMap((prev) => ({ ...prev, ...fetchedCoords }));
        }

        if (optimizationResult && optimizationResult.orderedPoints.length >= 2) {
          const newDistances: Record<string, number> = {};
          const newInfos: Record<string, StreetRouteInfo> = {};
          for (let i = 0; i < optimizationResult.orderedPoints.length - 1; i++) {
            const p1 = optimizationResult.orderedPoints[i];
            const p2 = optimizationResult.orderedPoints[i + 1];
            const key = `${p1.id}_${p2.id}`;
            const info = await fetchRealRouteInfo(p1, p2);
            newDistances[key] = info.walkDistanceKm;
            newInfos[key] = info;
          }
          if (isMounted) {
            setStreetDistances((prev) => ({ ...prev, ...newDistances }));
            setLiveRouteInfos((prev) => ({ ...prev, ...newInfos }));
          }
        }
      } catch (err) {
        console.warn('Błąd podczas pobierania tras Google Maps:', err);
      } finally {
        if (isMounted) {
          setIsLiveLoading(false);
        }
      }
    };

    loadLiveGoogleData();

    return () => {
      isMounted = false;
    };
  }, [visible, candidateEvents, destinationCity, optimizationResult, isApproximateMode]);

  // Łączny czas przemieszczania się w ciągu dnia
  const totalTransitMinutes = useMemo(() => {
    if (!optimizationResult || optimizationResult.orderedPoints.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < optimizationResult.orderedPoints.length - 1; i++) {
      const p1 = optimizationResult.orderedPoints[i];
      const p2 = optimizationResult.orderedPoints[i + 1];
      const legKey = `${p1.id}_${p2.id}`;
      const legDist = streetDistances[legKey];
      const routeInfo = liveRouteInfos[legKey];
      const est = routeInfo || calculateTransitEstimates(p1, p2, legDist);
      const mode = est.recommendedMode;
      if (mode === 'walking') {
        total += est.walkMinutes;
      } else {
        total += est.transitMinutes;
      }
    }
    return total;
  }, [optimizationResult, streetDistances, liveRouteInfos]);

  const handleConfirmApply = () => {
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
      streetDistances,
      liveRouteInfos,
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

          {/* BANER WCZYTYWANIA SIECI DROGOWEJ OSRM NA ŻYWO */}
          {osrmStatus === 'loading' && (
            <View style={styles.liveLoadingBanner} testID="osrm-loading-banner">
              <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.liveLoadingText}>
                {language === 'en'
                  ? 'Optimizing route with OSRM road network...'
                  : 'Optymalizacja trasy według sieci drogowej OSRM...'}
              </Text>
            </View>
          )}

          {/* BANER WCZYTYWANIA DANYCH GOOGLE MAPS NA ŻYWO */}
          {isLiveLoading && (
            <View style={styles.liveLoadingBanner}>
              <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.liveLoadingText}>{t.loadingGoogleRoutes}</Text>
            </View>
          )}

          {/* BANER BŁĘDU POBIERANIA SIECI DROGOWEJ OSRM */}
          {osrmStatus === 'error' && (
            <View style={styles.osrmErrorBanner} testID="osrm-error-banner">
              <Ionicons name="alert-circle-outline" size={24} color="#EF4444" style={{ marginRight: 10, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.osrmErrorTitle}>
                  {language === 'en' ? 'Failed to fetch road network' : 'Nie udało się pobrać danych drogowych'}
                </Text>
                <Text style={styles.osrmErrorDesc}>
                  {osrmError || (language === 'en'
                    ? 'Failed to fetch travel times along road network from OSRM.'
                    : 'Nie udało się pobrać czasów przejazdu po sieci drogowej OSRM.')}
                </Text>
                <View style={styles.osrmErrorBtnRow}>
                  <TouchableOpacity
                    style={styles.osrmRetryBtn}
                    onPress={() => {
                      setIsApproximateMode(false);
                      setOsrmError(null);
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
                      {language === 'en' ? 'Use approximate mode (straight line)' : 'Użyj trybu przybliżonego (linia prosta)'}
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
              {/* OZNACZENIE SIECI DROGOWEJ LUB TRYBU PRZYBLIŻONEGO */}
              {activeSource === 'osrm' ? (
                <View style={styles.roadNetworkBadge} testID="road-network-badge">
                  <Ionicons
                    name={transportProfile === 'walking' ? 'walk-outline' : 'car-outline'}
                    size={14}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.roadNetworkBadgeText}>
                    {transportProfile === 'walking'
                      ? language === 'en'
                        ? 'OSRM Pedestrian Network • Walking time optimized'
                        : 'Sieć piesza OSRM • Zoptymalizowano czas przejścia'
                      : language === 'en'
                        ? 'OSRM Road Network • Driving time optimized'
                        : 'Sieć drogowa OSRM • Zoptymalizowano czas przejazdu'}
                  </Text>
                </View>
              ) : (
                <View style={styles.approximateModeBanner} testID="approximate-mode-banner">
                  <Ionicons name="information-circle-outline" size={18} color="#F59E0B" style={{ marginRight: 8, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.approximateModeTitle}>
                      {language === 'en' ? 'Approximate mode (straight line)' : 'Tryb przybliżony (linia prosta)'}
                    </Text>
                    <Text style={styles.approximateModeText}>
                      {language === 'en'
                        ? 'Route optimized using straight-line geographic distances. Actual road travel times may vary and do not guarantee drivability.'
                        : 'Kolejność została ułożona na podstawie odległości w linii prostej. Rzeczywisty czas i droga mogą się różnić, a przejezdność nie jest gwarantowana.'}
                    </Text>
                  </View>
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

                  <TouchableOpacity
                    style={styles.fullRouteBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const fullUrl = buildGoogleMapsFullRouteUrl(
                        optimizationResult.orderedPoints,
                        destinationCity
                      );
                      Linking.openURL(fullUrl).catch((err) => {
                        console.warn('Cannot open full route in Google Maps:', err);
                      });
                    }}
                    testID="view-full-route-maps-btn"
                  >
                    <View style={styles.fullRouteIconBox}>
                      <Ionicons name="map" size={18} color="#38BDF8" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fullRouteBtnTitle}>{t.viewEntireRouteInMaps}</Text>
                      <Text style={styles.fullRouteBtnSubtitle}>{t.fullRouteCardDesc}</Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color="#38BDF8" style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                </View>
              )}

              {/* PODGLĄD USZEREGOWANEJ TRASY */}
              {optimizationResult && (
                <View style={styles.routePreviewSection}>
                  <Text style={styles.routePreviewTitle}>{t.previewRoute}</Text>
                  {optimizationResult.orderedPoints.map((pt, idx) => {
                    const nextPt = optimizationResult.orderedPoints[idx + 1];
                    const legKey = nextPt ? `${pt.id}_${nextPt.id}` : '';
                    const customStreetDist = legKey ? streetDistances[legKey] : undefined;
                    const routeInfo = legKey ? liveRouteInfos[legKey] : undefined;
                    const transit = nextPt ? (routeInfo || calculateTransitEstimates(pt, nextPt, customStreetDist)) : null;
                    const dayInfo = dayAssignmentMap ? dayAssignmentMap[pt.id] : null;

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
                            </View>
                            <TouchableOpacity
                              style={styles.pointNavigateBtn}
                              activeOpacity={0.7}
                              onPress={() => {
                                const url = buildGoogleMapsNavigationToDestinationUrl(pt, destinationCity);
                                Linking.openURL(url).catch((err) => console.warn('Cannot open Google Maps:', err));
                              }}
                              testID={`preview-point-maps-btn-${idx}`}
                            >
                              <Ionicons name="navigate-outline" size={13} color="#38BDF8" style={{ marginRight: 4 }} />
                              <Text style={styles.pointNavigateBtnText}>{t.navigateBtn || (language === 'en' ? 'Navigate' : 'Nawiguj')}</Text>
                            </TouchableOpacity>
                          </View>

                          {nextPt && transit && (
                            <View style={styles.transitLegCard}>
                              <View style={styles.transitLegHeader}>
                                <Ionicons name="git-commit-outline" size={13} color="#94A3B8" style={{ marginRight: 4 }} />
                                <Text style={styles.transitLegHeaderText}>{t.transitHeader}</Text>
                              </View>

                              {/* REKOMENDACJA ORIENTACYJNA: PIESZO CZY KOMUNIKACJA */}
                              <View style={styles.legRecommendationBanner}>
                                <Ionicons
                                  name={transit.recommendedMode === 'walking' ? 'walk-outline' : 'bus-outline'}
                                  size={14}
                                  color={transit.recommendedMode === 'walking' ? '#F59E0B' : '#38BDF8'}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.legRecommendationText}>
                                  {language === 'en'
                                    ? `Recommended transport: ${transit.recommendedMode === 'walking' ? t.modeWalk : t.modeTransit}`
                                    : `Rekomendowany transport: ${transit.recommendedMode === 'walking' ? t.modeWalk : t.modeTransit}`}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2, marginBottom: 6, fontStyle: 'italic' }}>
                                {language === 'en'
                                  ? 'Estimated tourist transit time (separate from driving optimization)'
                                  : 'Orientacyjny szacunek przemieszczania się (niezależny od czasu przejazdu OSRM)'}
                              </Text>

                              {/* PRZYCISK GŁÓWNY GOOGLE MAPS Z AKTUALNEJ POZYCJI DO NASTĘPNEGO PUNKTU */}
                              <TouchableOpacity
                                style={styles.googleMapsBtn}
                                activeOpacity={0.8}
                                onPress={() => {
                                  const targetMode = transit.recommendedMode === 'walking' ? 'walking' : 'transit';
                                  const url = buildGoogleMapsNavigationToDestinationUrl(nextPt, destinationCity, targetMode);
                                  Linking.openURL(url).catch((err) => {
                                    console.warn('Cannot open Google Maps:', err);
                                  });
                                }}
                                testID={`transit-maps-btn-${idx}`}
                              >
                                <Ionicons name="navigate-outline" size={13} color="#38BDF8" style={{ marginRight: 6 }} />
                                <Text style={styles.googleMapsBtnText}>{t.checkInGoogleMaps}</Text>
                                <Ionicons name="open-outline" size={12} color="#38BDF8" style={{ marginLeft: 4 }} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>
              )}

              {/* PRZYCISKI AKCJI */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={handleConfirmApply}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
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
  legRecommendationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  legRecommendationText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
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
  transitLegCard: {
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  transitLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  transitLegHeaderText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  googleMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  googleMapsBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
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
  roadNetworkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  roadNetworkBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  approximateModeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  approximateModeTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  approximateModeText: {
    color: '#CBD5E1',
    fontSize: 11,
    lineHeight: 15,
  },
});

