// src/components/RouteOptimizationModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
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
  recalculateItineraryTimes,
  resolvePointCoordinates,
  calculateTransitEstimates,
  fetchRealRouteInfo,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsFullRouteUrl,
  fetchGooglePlaceLocation,
  fetchRealStreetDistanceKm,
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
}

export const RouteOptimizationModal: React.FC<RouteOptimizationModalProps> = ({
  visible,
  onClose,
  onApply,
  events,
  poolAttractions = [],
  destinationCity = 'Rome',
  lodgingCoords = null,
}) => {
  const { language } = useAuthStore();
  const t = translations[language].timeline;
  const commonT = translations[language].common;

  // Wybrany przez użytkownika środek transportu dla każdego etapu (indeks odcinka trasy)
  const [selectedModes, setSelectedModes] = useState<Record<number, 'walking' | 'transit' | 'driving'>>({});
  // Rzeczywisty dystans siatki ulic z OSRM dla poszczególnych odcinków
  const [streetDistances, setStreetDistances] = useState<Record<string, number>>({});
  // Rzeczywiste pełne czasy przejść/przejazdów z serwera OSRM / Google Maps Live
  const [liveRouteInfos, setLiveRouteInfos] = useState<Record<string, StreetRouteInfo>>({});
  // Prawdziwe koordynaty z Google Places pobrane w tle na żywo
  const [liveCoordsMap, setLiveCoordsMap] = useState<Record<string, { lat: number; lon: number }>>({});
  // Stan pobierania danych na żywo z Google Maps / sieci ulicznej
  const [isLiveLoading, setIsLiveLoading] = useState<boolean>(false);

  // Filtrujemy punkty do optymalizacji (atrakcje zwiedzania)
  const candidateEvents = useMemo(() => {
    return events.filter((e) => e.type === 'ATTRACTION');
  }, [events]);

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

  // Uruchamiamy silnik algorytmów TSP (szukanie optymalnej ścieżki bez zawracania)
  const optimizationResult: OptimizationResult | null = useMemo(() => {
    if (geoPoints.length < 2) return null;
    return optimizeSightseeingRoute(geoPoints, false);
  }, [geoPoints]);

  // Asynchroniczne dociąganie precyzyjnych danych z Google Places i siatki ulic OSRM (tylko w trybie online)
  useEffect(() => {
    if (!visible || candidateEvents.length < 2) return;
    if (process.env.NODE_ENV === 'test') return;

    let isMounted = true;
    setIsLiveLoading(true);

    const loadLiveGoogleData = async () => {
      try {
        // 1. Dociągamy prawdziwe koordynaty z Google Places dla wszystkich punktów bez precyzyjnych danych
        const fetchedCoords: Record<string, { lat: number; lon: number }> = {};
        for (const evt of candidateEvents) {
          if (!evt.lat || !evt.lon) {
            const place = await fetchGooglePlaceLocation(evt.title, destinationCity);
            if (place && place.lat && place.lon) {
              fetchedCoords[evt.id] = { lat: place.lat, lon: place.lon };
            }
          }
        }
        if (Object.keys(fetchedCoords).length > 0 && isMounted) {
          setLiveCoordsMap((prev) => ({ ...prev, ...fetchedCoords }));
        }

        // 2. Pobieramy rzeczywiste dystanse i czasy uliczne między kolejnymi punktami
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
  }, [visible, candidateEvents, destinationCity, optimizationResult]);

  // Łączny czas przemieszczania się w ciągu dnia (uwzględnia wybory użytkownika)
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
      const mode = selectedModes[i] || est.recommendedMode;
      if (mode === 'walking') {
        total += est.walkMinutes;
      } else if (mode === 'driving') {
        total += est.driveMinutes;
      } else {
        total += est.transitMinutes;
      }
    }
    return total;
  }, [optimizationResult, selectedModes, streetDistances, liveRouteInfos]);

  // Obsługa kliknięcia wybranego trybu transportu
  const handleSelectMode = (
    legIndex: number,
    mode: 'walking' | 'transit' | 'driving',
    pt: GeoPoint,
    nextPt: GeoPoint
  ) => {
    setSelectedModes((prev) => ({ ...prev, [legIndex]: mode }));
    const url = buildGoogleMapsDirectionsUrl(pt, nextPt, mode, destinationCity);
    Linking.openURL(url).catch((err) => console.warn('Nie można otworzyć Google Maps:', err));
  };

  const handleConfirmApply = () => {
    if (!optimizationResult) {
      onClose();
      return;
    }

    // Mapujemy uszeregowane punkty z powrotem na obiekty TimelineEvent wraz ze zaktualizowanymi koordynatami
    const reorderedCandidates: TimelineEventLike[] = optimizationResult.orderedPoints.map((gp) => {
      const original = candidateEvents.find((e) => e.id === gp.id);
      return {
        ...(original || {}),
        id: gp.id,
        type: 'ATTRACTION',
        title: gp.title,
        subtitle: gp.subtitle,
        dateStr: original?.dateStr || candidateEvents[0]?.dateStr || '10-10-2026',
        parsedDate: original?.parsedDate || candidateEvents[0]?.parsedDate || new Date(),
        lat: gp.lat,
        lon: gp.lon,
      };
    });

    // Czasy przejazdów dla każdego odcinka oparte na wyborach użytkownika
    const legTransitMinutes = optimizationResult.orderedPoints.slice(0, -1).map((pt, idx) => {
      const nextPt = optimizationResult.orderedPoints[idx + 1];
      const legKey = `${pt.id}_${nextPt.id}`;
      const legDist = streetDistances[legKey];
      const routeInfo = liveRouteInfos[legKey];
      const est = routeInfo || calculateTransitEstimates(pt, nextPt, legDist);
      const mode = selectedModes[idx] || est.recommendedMode;
      if (mode === 'walking') return est.walkMinutes;
      if (mode === 'driving') return est.driveMinutes;
      return est.transitMinutes;
    });

    // Przeliczamy nowe godziny zwiedzania uwzględniając realne czasy transportu
    const withRecalculatedTimes = recalculateItineraryTimes(reorderedCandidates, 10, 0, legTransitMinutes);

    // Łączymy z punktami logistycznymi (DEPARTURE, LODGING, RETURN)
    let candidateIndex = 0;
    const finalTimeline = events.map((event) => {
      if (event.type === 'ATTRACTION') {
        const replacement = withRecalculatedTimes[candidateIndex];
        candidateIndex++;
        return replacement || event;
      }
      return event;
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

          {/* BANER WCZYTYWANIA DANYCH GOOGLE MAPS NA ŻYWO */}
          {isLiveLoading && (
            <View style={styles.liveLoadingBanner}>
              <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.liveLoadingText}>{t.loadingGoogleRoutes}</Text>
            </View>
          )}

          {geoPoints.length < 2 ? (
            <View style={styles.notEnoughBox}>
              <Ionicons name="information-circle-outline" size={32} color="#F59E0B" style={{ marginBottom: 12 }} />
              <Text style={styles.notEnoughText}>{t.notEnoughAttractions}</Text>
              <TouchableOpacity style={styles.cancelBtnOnly} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>{commonT.button_close}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                    const activeMode = transit ? (selectedModes[idx] || transit.recommendedMode) : 'transit';

                    return (
                      <View key={pt.id} style={styles.previewStepRow}>
                        <View style={styles.previewStepLeft}>
                          <View style={styles.previewStepNumberBadge}>
                            <Text style={styles.previewStepNumberText}>{idx + 1}</Text>
                          </View>
                          {nextPt && <View style={styles.previewStepLine} />}
                        </View>
                        <View style={styles.previewStepRight}>
                          <View style={styles.previewPointCard}>
                            <Text style={styles.previewPointTitle}>{pt.title}</Text>
                            {pt.subtitle ? (
                              <Text style={styles.previewPointSubtitle} numberOfLines={1}>
                                {pt.subtitle}
                              </Text>
                            ) : null}
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
                                  name={transit.recommendedMode === 'walking' ? 'walk' : 'bus'}
                                  size={14}
                                  color={transit.recommendedMode === 'walking' ? '#F59E0B' : '#38BDF8'}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.legRecommendationText}>
                                  {transit.recommendedMode === 'walking'
                                    ? t.recommendedWalkNotice
                                    : t.recommendedTransitNotice}
                                </Text>
                              </View>

                              {/* 3 INTERAKTYWNE TRYBY TRANSPORTU */}
                              <View style={styles.transitModesRow}>
                                {/* PIESZO (Walking) */}
                                <TouchableOpacity
                                  style={[
                                    styles.transitModeItem,
                                    activeMode === 'walking' && styles.transitModeItemActiveWalk,
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => handleSelectMode(idx, 'walking', pt, nextPt)}
                                  testID={`mode-walk-item-${idx}`}
                                >
                                  <View style={styles.transitModeIconBoxWalk}>
                                    <Ionicons name="walk-outline" size={15} color="#F59E0B" />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={styles.modeTitleRow}>
                                      <Text style={styles.transitModeTitle}>{t.modeWalk}</Text>
                                      {transit.recommendedMode === 'walking' && (
                                        <View style={styles.touristBadge}>
                                          <Text style={styles.touristBadgeText}>{t.modeWalkBadge}</Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={styles.transitModeText}>{t.modeWalkDesc}</Text>
                                  </View>
                                  {activeMode === 'walking' ? (
                                    <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                                  ) : (
                                    <Ionicons name="open-outline" size={14} color="#64748B" />
                                  )}
                                </TouchableOpacity>

                                {/* KOMUNIKACJA MIEJSKA (Public Transit) */}
                                <TouchableOpacity
                                  style={[
                                    styles.transitModeItem,
                                    activeMode === 'transit' && styles.transitModeItemActiveTransit,
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => handleSelectMode(idx, 'transit', pt, nextPt)}
                                  testID={`mode-transit-item-${idx}`}
                                >
                                  <View style={styles.transitModeIconBoxTransit}>
                                    <Ionicons name="bus-outline" size={15} color="#38BDF8" />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={styles.modeTitleRow}>
                                      <Text style={styles.transitModeTitle}>{t.modeTransit}</Text>
                                      {transit.recommendedMode === 'transit' && (
                                        <View style={styles.touristBadge}>
                                          <Text style={styles.touristBadgeText}>{t.modeTransitBadge}</Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={styles.transitModeText}>{t.modeTransitDesc}</Text>
                                  </View>
                                  {activeMode === 'transit' ? (
                                    <Ionicons name="checkmark-circle" size={18} color="#38BDF8" />
                                  ) : (
                                    <Ionicons name="open-outline" size={14} color="#64748B" />
                                  )}
                                </TouchableOpacity>

                                {/* AUTO (Driving) */}
                                <TouchableOpacity
                                  style={[
                                    styles.transitModeItem,
                                    activeMode === 'driving' && styles.transitModeItemActiveDrive,
                                  ]}
                                  activeOpacity={0.7}
                                  onPress={() => handleSelectMode(idx, 'driving', pt, nextPt)}
                                  testID={`mode-drive-item-${idx}`}
                                >
                                  <View style={styles.transitModeIconBoxDrive}>
                                    <Ionicons name="car-outline" size={15} color="#10B981" />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={styles.modeTitleRow}>
                                      <Text style={styles.transitModeTitle}>{t.modeDrive}</Text>
                                    </View>
                                    <Text style={styles.transitModeText}>{t.modeDriveDesc}</Text>
                                  </View>
                                  {activeMode === 'driving' ? (
                                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                                  ) : (
                                    <Ionicons name="open-outline" size={14} color="#64748B" />
                                  )}
                                </TouchableOpacity>
                              </View>

                              {/* PRZYCISK GŁÓWNY GOOGLE MAPS DLA WYBRANEGO TRYBU */}
                              <TouchableOpacity
                                style={styles.googleMapsBtn}
                                activeOpacity={0.8}
                                onPress={() => {
                                  const targetMode = activeMode || transit.recommendedMode;
                                  const url = buildGoogleMapsDirectionsUrl(pt, nextPt, targetMode, destinationCity);
                                  Linking.openURL(url).catch((err) => {
                                    console.warn('Cannot open Google Maps:', err);
                                  });
                                }}
                                testID={`transit-maps-btn-${idx}`}
                              >
                                <Ionicons name="navigate-outline" size={13} color="#38BDF8" style={{ marginRight: 6 }} />
                                <Text style={styles.googleMapsBtnText}>{t.checkInGoogleMaps}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
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
  transitModesRow: {
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
  },
  transitModeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  transitModeItemActiveWalk: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  transitModeItemActiveTransit: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  transitModeItemActiveDrive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  touristBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  touristBadgeText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '700',
  },
  previewBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  previewBadgeText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '600',
  },
  transitModeIconBoxWalk: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  transitModeIconBoxTransit: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  transitModeIconBoxDrive: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  transitModeTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transitModeText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
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
});
