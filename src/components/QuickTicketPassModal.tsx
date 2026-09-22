// src/components/QuickTicketPassModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Brightness from 'expo-brightness';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';

const { height: screenHeight } = Dimensions.get('window');

export interface QuickTicketPassModalProps {
  visible: boolean;
  onClose: () => void;
  ticketFile: {
    id?: string;
    name?: string;
    uri?: string;
    type?: string;
    createdAt?: string;
  } | null;
  departureTime?: string;
  stationName?: string;
  destination?: string;
  transportType?: string;
  onOpenVault?: () => void;
  activeLeg?: 'outbound' | 'return';
  outboundTicket?: any;
  returnTicket?: any;
  outboundDepartureTime?: string;
  returnDepartureTime?: string;
  outboundStation?: string;
  returnStation?: string;
}

export const QuickTicketPassModal: React.FC<QuickTicketPassModalProps> = ({
  visible,
  onClose,
  ticketFile,
  departureTime,
  stationName,
  destination,
  transportType = 'train',
  onOpenVault,
  activeLeg = 'outbound',
  outboundTicket,
  returnTicket,
  outboundDepartureTime,
  returnDepartureTime,
  outboundStation,
  returnStation,
}) => {
  const { language } = useAuthStore();
  const t = translations[language]?.proximityAlert || translations.pl.proximityAlert;

  const [selectedLeg, setSelectedLeg] = useState<'outbound' | 'return'>(activeLeg || 'outbound');
  const [imageError, setImageError] = useState(false);
  const [scale, setScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);

  const scaleRef = useRef(1);
  scaleRef.current = scale;

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const gestureStateRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    isPinching: false,
    lastTap: 0,
  });

  const previousBrightnessRef = useRef<number | null>(null);

  // Aktualizacja aktywnego odcinka gdy modal się otwiera
  useEffect(() => {
    if (activeLeg) {
      setSelectedLeg(activeLeg);
    }
  }, [activeLeg, visible]);

  // Automatyczne podjaśnianie ekranu (100%) pod skanery bramek i przywracanie po zamknięciu
  useEffect(() => {
    let isMounted = true;

    const optimizeBrightness = async () => {
      if (Platform.OS === 'web') return;
      try {
        const isAvail = await Brightness.isAvailableAsync().catch(() => true);
        if (!isAvail) return;

        const current = await Brightness.getBrightnessAsync().catch(() => null);
        if (isMounted && current !== null && previousBrightnessRef.current === null) {
          previousBrightnessRef.current = current;
        }
        await Brightness.setBrightnessAsync(1.0).catch(() => {});
      } catch (err) {
        console.warn('Destivo: Nie udało się zoptymalizować jasności ekranu:', err);
      }
    };

    const restoreBrightness = async () => {
      if (Platform.OS === 'web') return;
      try {
        if (Platform.OS === 'android') {
          await Brightness.restoreSystemBrightnessAsync().catch(() => {});
        } else if (previousBrightnessRef.current !== null) {
          await Brightness.setBrightnessAsync(previousBrightnessRef.current).catch(() => {});
        }
        previousBrightnessRef.current = null;
      } catch (err) {
        console.warn('Destivo: Nie udało się przywrócić jasności ekranu:', err);
      }
    };

    if (visible) {
      optimizeBrightness();
    } else {
      restoreBrightness();
    }

    return () => {
      isMounted = false;
      restoreBrightness();
    };
  }, [visible]);

  // Rozstrzyganie czy mamy dane dla obu odcinków (TAM i POWRÓT)
  const hasOutbound = Boolean(outboundTicket || outboundDepartureTime);
  const hasReturn = Boolean(returnTicket || returnDepartureTime);
  const showLegTabs = hasOutbound || hasReturn;

  const currentFile =
    selectedLeg === 'return'
      ? returnTicket || (activeLeg === 'return' ? ticketFile : null)
      : outboundTicket || (activeLeg === 'outbound' ? ticketFile : null) || ticketFile;

  const currentDepartureTime =
    selectedLeg === 'return'
      ? returnDepartureTime || '12:00'
      : outboundDepartureTime || departureTime || '08:00';

  const currentStation =
    selectedLeg === 'return'
      ? returnStation || destination || 'Stacja / Lotnisko'
      : outboundStation || stationName || 'Stacja / Lotnisko';

  const currentDestination =
    selectedLeg === 'return'
      ? outboundStation || stationName || 'Powrót'
      : destination || 'Cel podróży';

  const calcDistance = (t0: any, t1: any) => {
    const dx = t0.pageX - t1.pageX;
    const dy = t0.pageY - t1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(3.5, Number((prev + 0.5).toFixed(1))));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(1)));
      if (next === 1) {
        pan.setValue({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    pan.setValue({ x: 0, y: 0 });
  };

  // Reset zoom & pan gdy zmieniamy bilet lub odcinek
  useEffect(() => {
    setScale(1);
    pan.setValue({ x: 0, y: 0 });
    setImageError(false);
  }, [selectedLeg, currentFile?.uri]);

  // Obsługa gestów: rozciąganie dwoma palcami (pinch-to-zoom jak w galerii), przesuwanie (pan) oraz double-tap
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        return evt.nativeEvent.touches.length >= 2 || scaleRef.current > 1;
      },
      onMoveShouldSetPanResponder: (evt, gesture) => {
        return (
          evt.nativeEvent.touches.length >= 2 ||
          (scaleRef.current > 1 && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2))
        );
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        const now = Date.now();

        // Podwójne stuknięcie jak w galerii (Double tap: przełączenie 1x <-> 2.5x)
        if (touches.length === 1 && now - gestureStateRef.current.lastTap < 280) {
          if (scaleRef.current > 1) {
            handleResetZoom();
          } else {
            setScale(2.5);
          }
          gestureStateRef.current.lastTap = 0;
          return;
        }
        gestureStateRef.current.lastTap = now;

        if (touches.length >= 2) {
          gestureStateRef.current.isPinching = true;
          setIsPinching(true);
          gestureStateRef.current.initialDistance = calcDistance(touches[0], touches[1]);
          gestureStateRef.current.initialScale = scaleRef.current;
        } else {
          gestureStateRef.current.isPinching = false;
          setIsPinching(false);
          pan.setOffset({
            x: (pan.x as any)._value || 0,
            y: (pan.y as any)._value || 0,
          });
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          // Rozciąganie dwoma palcami (Pinch-to-zoom jak w galerii telefonu)
          if (!gestureStateRef.current.isPinching || gestureStateRef.current.initialDistance === 0) {
            gestureStateRef.current.isPinching = true;
            setIsPinching(true);
            gestureStateRef.current.initialDistance = calcDistance(touches[0], touches[1]);
            gestureStateRef.current.initialScale = scaleRef.current;
            return;
          }

          const currentDist = calcDistance(touches[0], touches[1]);
          if (gestureStateRef.current.initialDistance > 0) {
            const ratio = currentDist / gestureStateRef.current.initialDistance;
            const newScale = Math.min(
              4.0,
              Math.max(1.0, gestureStateRef.current.initialScale * ratio)
            );
            setScale(Number(newScale.toFixed(2)));
          }
        } else if (touches.length === 1 && !gestureStateRef.current.isPinching) {
          // Przesuwanie powiększonego obrazu (Pan)
          if (scaleRef.current > 1) {
            pan.setValue({ x: gesture.dx, y: gesture.dy });
          }
        }
      },
      onPanResponderRelease: () => {
        gestureStateRef.current.isPinching = false;
        setIsPinching(false);
        gestureStateRef.current.initialDistance = 0;
        pan.flattenOffset();
        if (scaleRef.current <= 1.05) {
          setScale(1);
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderTerminate: () => {
        gestureStateRef.current.isPinching = false;
        setIsPinching(false);
        gestureStateRef.current.initialDistance = 0;
        pan.flattenOffset();
      },
    })
  ).current;

  const getTransportIcon = (): any => {
    switch (transportType?.toLowerCase()) {
      case 'flight':
        return 'airplane';
      case 'train':
        return 'train';
      case 'bus':
        return 'bus';
      case 'car':
        return 'car';
      default:
        return 'train';
    }
  };

  const isPdf =
    currentFile?.type?.toUpperCase() === 'PDF' ||
    (currentFile?.name && currentFile.name.toLowerCase().endsWith('.pdf'));

  const handleShareOrOpen = async () => {
    if (!currentFile?.uri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(currentFile.uri, {
          mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
          dialogTitle: currentFile.name || t.quickPassTitle,
          UTI: isPdf ? 'com.adobe.pdf' : 'public.jpeg',
        });
      }
    } catch (e) {
      console.warn('Error sharing ticket pass file:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* PASEK TYTUŁOWY I ZAMKNIĘCIE */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="ticket" size={20} color="#38BDF8" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalTitle}>{t.quickPassTitle}</Text>
                <Text style={styles.modalSubtitle}>{t.quickPassSubtitle}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="quick-pass-close-btn"
            >
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            scrollEnabled={scale === 1 && !isPinching}
          >
            {/* PRZEŁĄCZNIK ODCINKÓW PODRÓŻY: TAM / POWRÓT */}
            {showLegTabs && (
              <View style={styles.legTabsContainer}>
                <TouchableOpacity
                  style={[
                    styles.legTab,
                    selectedLeg === 'outbound' && styles.legTabActive,
                  ]}
                  onPress={() => setSelectedLeg('outbound')}
                  activeOpacity={0.8}
                  testID="quick-pass-leg-outbound-btn"
                >
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={selectedLeg === 'outbound' ? '#38BDF8' : '#94A3B8'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.legTabText,
                      selectedLeg === 'outbound' && styles.legTabTextActive,
                    ]}
                  >
                    {t.legOutbound || 'TAM'} ({outboundDepartureTime || departureTime || '08:00'})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.legTab,
                    selectedLeg === 'return' && styles.legTabActive,
                  ]}
                  onPress={() => setSelectedLeg('return')}
                  activeOpacity={0.8}
                  testID="quick-pass-leg-return-btn"
                >
                  <Ionicons
                    name="arrow-back"
                    size={14}
                    color={selectedLeg === 'return' ? '#38BDF8' : '#94A3B8'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.legTabText,
                      selectedLeg === 'return' && styles.legTabTextActive,
                    ]}
                  >
                    {t.legReturn || 'POWRÓT'} ({returnDepartureTime || '12:00'})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STATUS READY PILL */}
            <View style={styles.readyBadgeRow}>
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={15} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.readyBadgeText}>{t.statusReady}</Text>
              </View>

              <View style={styles.transportTypeBadge}>
                <Ionicons name={getTransportIcon()} size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                <Text style={styles.transportTypeText}>
                  {transportType?.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* KARTY DANYCH ODJAZDU (STACJA -> CEL, GODZINA) */}
            <View style={styles.travelDetailsCard}>
              <View style={styles.routeRow}>
                <View style={styles.stationBlock}>
                  <Text style={styles.detailLabel}>{t.stationLabel}</Text>
                  <Text style={styles.stationValue} numberOfLines={2}>
                    {currentStation}
                  </Text>
                </View>

                <View style={styles.arrowBlock}>
                  <Ionicons name="arrow-forward" size={18} color="#64748B" />
                </View>

                <View style={styles.stationBlock}>
                  <Text style={styles.detailLabel}>{t.destinationLabel}</Text>
                  <Text style={styles.destinationValue} numberOfLines={2}>
                    {currentDestination}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.timeRow}>
                <View style={styles.timeItem}>
                  <Ionicons name="time-outline" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                  <Text style={styles.detailLabel}>{t.departureLabel}:</Text>
                  <Text style={styles.timeValue}>{currentDepartureTime}</Text>
                </View>

                {currentFile?.name ? (
                  <View style={styles.fileNameItem}>
                    <Ionicons name="document-text-outline" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.fileNameText} numberOfLines={1}>
                      {currentFile.name}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* PODGLĄD BILETU / KODU QR */}
            {currentFile?.uri ? (
              <View style={styles.ticketPreviewSection}>
                {isPdf ? (
                  <View style={styles.pdfCard}>
                    <View style={styles.pdfIconCircle}>
                      <Ionicons name="document-text" size={34} color="#EF4444" />
                    </View>
                    <Text style={styles.pdfTitle} numberOfLines={2}>
                      {currentFile.name || 'Bilet_Podrozy.pdf'}
                    </Text>
                    <Text style={styles.pdfSubtitle}>
                      {t.openPdfHint || 'Uruchamia zewnętrzną przeglądarkę PDF (np. Adobe Acrobat, Dysk Google)'}
                    </Text>

                    {/* GŁÓWNY PRZYCISK: OTWARCIE W APLIKACJI PDF */}
                    <TouchableOpacity
                      style={styles.openPdfPrimaryBtn}
                      activeOpacity={0.8}
                      onPress={handleShareOrOpen}
                      testID="quick-pass-open-pdf-btn"
                    >
                      <Ionicons name="open-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.openPdfPrimaryBtnText}>{t.openPdfApp || 'Otwórz w aplikacji PDF'}</Text>
                    </TouchableOpacity>

                    {/* DRUGI PRZYCISK: UDOSTĘPNIJ / ZAPISZ */}
                    <TouchableOpacity
                      style={styles.shareSecondaryBtn}
                      activeOpacity={0.8}
                      onPress={handleShareOrOpen}
                      testID="quick-pass-share-pdf-btn"
                    >
                      <Ionicons name="share-social-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
                      <Text style={styles.shareSecondaryBtnText}>{t.shareFile || 'Udostępnij / Zapisz plik'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.imageCard}>
                    {/* ZOOM CONTROLS TOOLBAR - Czyste przyciski bez ciasnego opisu */}
                    <View style={styles.zoomToolbar}>
                      <View style={styles.zoomIconPill}>
                        <Ionicons name="scan-outline" size={16} color="#38BDF8" />
                      </View>

                      <View style={styles.zoomButtonsRow}>
                        {scale > 1 && (
                          <TouchableOpacity
                            style={styles.zoomResetBtn}
                            activeOpacity={0.7}
                            onPress={handleResetZoom}
                            testID="quick-pass-zoom-reset-btn"
                          >
                            <Ionicons name="refresh-outline" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
                            <Text style={styles.zoomResetText}>{t.zoomReset || 'Reset'}</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.zoomBtn}
                          activeOpacity={0.7}
                          onPress={handleZoomOut}
                          disabled={scale <= 1}
                          testID="quick-pass-zoom-out-btn"
                        >
                          <Ionicons
                            name="remove"
                            size={18}
                            color={scale <= 1 ? '#475569' : '#38BDF8'}
                          />
                        </TouchableOpacity>

                        <View style={styles.zoomLevelBadge}>
                          <Text style={styles.zoomLevelText}>{`${Math.round(scale * 100)}%`}</Text>
                        </View>

                        <TouchableOpacity
                          style={styles.zoomBtn}
                          activeOpacity={0.7}
                          onPress={handleZoomIn}
                          disabled={scale >= 3.5}
                          testID="quick-pass-zoom-in-btn"
                        >
                          <Ionicons
                            name="add"
                            size={18}
                            color={scale >= 3.5 ? '#475569' : '#38BDF8'}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* OBSZAR OBRAZU Z ROZCIĄGANIEM DWOMA PALCAMI ORAZ PRZESUWANIEM */}
                    <View style={styles.imageViewport} {...panResponder.panHandlers}>
                      {!imageError ? (
                        <Animated.Image
                          source={{ uri: currentFile.uri }}
                          style={[
                            styles.ticketImage,
                            {
                              transform: [
                                { scale },
                                { translateX: pan.x },
                                { translateY: pan.y },
                              ],
                            },
                          ]}
                          resizeMode="contain"
                          onError={() => setImageError(true)}
                        />
                      ) : (
                        <View style={styles.imageFallbackBox}>
                          <Ionicons name="image-outline" size={40} color="#64748B" />
                          <Text style={styles.imageFallbackText}>{currentFile.name}</Text>
                        </View>
                      )}
                    </View>

                    {/* PRZYCISK UDOSTĘPNIENIA / PEŁNEGO PLIKU */}
                    <TouchableOpacity
                      style={styles.openDocBtn}
                      activeOpacity={0.8}
                      onPress={handleShareOrOpen}
                      testID="quick-pass-share-img-btn"
                    >
                      <Ionicons name="share-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.openDocBtnText}>{t.shareFile || t.openFullFile}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noTicketCard}>
                <Ionicons name="file-tray-outline" size={34} color="#64748B" style={{ marginBottom: 8 }} />
                <Text style={styles.noTicketText}>{t.noTicketFound}</Text>
              </View>
            )}

            {/* PRZYCISKI AKCJI NA DOLE */}
            <View style={styles.actionButtonsRow}>
              {onOpenVault && (
                <TouchableOpacity
                  style={styles.vaultButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    onClose();
                    onOpenVault();
                  }}
                  testID="quick-pass-goto-vault-btn"
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color="#38BDF8" style={{ marginRight: 6 }} />
                  <Text style={styles.vaultButtonText}>{t.openVault}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.doneButton}
                activeOpacity={0.8}
                onPress={onClose}
                testID="quick-pass-dismiss-btn"
              >
                <Text style={styles.doneButtonText}>{t.close}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    maxHeight: screenHeight * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  legTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  legTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  legTabActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  legTabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  legTabTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  readyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  readyBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  transportTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  transportTypeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  travelDetailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stationBlock: {
    flex: 1,
  },
  arrowBlock: {
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  stationValue: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  destinationValue: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeValue: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 4,
  },
  fileNameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: 10,
  },
  fileNameText: {
    color: '#94A3B8',
    fontSize: 11,
    maxWidth: 140,
  },
  ticketPreviewSection: {
    marginBottom: 14,
  },
  pdfCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  pdfIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pdfTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  pdfSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  openPdfPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  openPdfPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  shareSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'center',
  },
  shareSecondaryBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  imageCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
  },
  zoomToolbar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  zoomIconPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  zoomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLevelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    minWidth: 54,
    alignItems: 'center',
  },
  zoomLevelText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  zoomResetText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  imageViewport: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  ticketImage: {
    width: '100%',
    height: '100%',
  },
  imageFallbackBox: {
    width: '100%',
    height: 180,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
  openDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'center',
  },
  openDocBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  noTicketCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  noTicketText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  brightnessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: 20,
  },
  brightnessText: {
    color: '#FBBF24',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vaultButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
  },
  vaultButtonText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  doneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
