import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';

import {
  useTripCreatorStore,
  TransportOption,
} from '../../store/tripCreatorStore';

import {
  fetchTransportComparisons,
  getTransportRouteMetadata,
  TransportDataProvider,
  TransportRouteMetadata,
} from '../../lib/transportCalculator';

import { useAuthStore } from '../../store/authStore';
import { translations } from '../../i18n/translations';

/**
 * Ten ekran NIE tworzy cen ani czasów.
 *
 * Wszystkie liczby pochodzą z transportCalculator / providera:
 * - LIVE      = aktualna cena zwrócona przez źródło,
 * - ESTIMATE  = obliczenie/orientacyjna wartość,
 * - UNAVAILABLE = brak wiarygodnych danych.
 *
 * Ważne: provider powinien być docelowo wstrzykiwany z warstwy API,
 * np. transportProviders.ts. Dzięki temu ekran nie zna szczegółów
 * poszczególnych API przewoźników.
 */
interface Step2TransportScreenProps {
  navigation?: any;
  transportProvider: TransportDataProvider;
  departureAt?: string;
}

export const Step2TransportScreen: React.FC<Step2TransportScreenProps> = ({
  navigation,
  transportProvider,
  departureAt,
}) => {
  const {
    origin,
    destination,
    transport,
    setTransportOption,
  } = useTripCreatorStore();

  const { language } = useAuthStore();

  const t = translations[language].transport;
  const badgesT = translations[language].badges;
  const commonT = translations[language].common;

  const [loading, setLoading] = useState<boolean>(true);
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTransportOptions() {
      if (!origin?.trim() || !destination?.trim() || !transportProvider) {
        setOptions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const data = await fetchTransportComparisons(
          destination,
          origin,
          transportProvider,
          {
            departureAt,
          }
        );

        if (!isMounted) return;

        setOptions(data);

        // Nie wybieramy automatycznie transportu bez ceny jako "Smart Choice".
        if (!transport.selectedOption && data.length > 0) {
          const smart = data.find((o) =>
            o.badges.includes('SMART_CHOICE')
          );

          const firstPriced = data.find((o) => {
            const metadata = getTransportRouteMetadata(o.id);
            return metadata?.price.status !== 'UNAVAILABLE';
          });

          setTransportOption(smart || firstPriced || data[0]);
        }
      } catch (error: unknown) {
        console.error('Błąd pobierania połączeń:', error);

        if (isMounted) {
          setErrorMessage(
            'Nie udało się pobrać aktualnych danych transportowych.'
          );
          setOptions([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTransportOptions();

    return () => {
      isMounted = false;
    };
  }, [
    destination,
    origin,
    transportProvider,
    departureAt,
  ]);

  const handleOpenBooking = async (url?: string) => {
    if (!url) return;

    try {
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'DESTIVO',
          'Nie można otworzyć linku do zakupu biletu.'
        );
      }
    } catch (error: unknown) {
      console.error('Błąd otwierania linku:', error);
    }
  };

  const renderBadgeText = (badge: string): string => {
    switch (badge) {
      case 'SMART_CHOICE':
        return `🏆 ${badgesT.smartChoice}`;
      case 'FASTEST_D2D':
        return `⚡ ${badgesT.fastestD2D}`;
      case 'CHEAPEST_TOTAL':
        return `💰 ${badgesT.cheapestTotal}`;
      case 'HIGH_COMFORT':
        return `🧘 ${badgesT.highComfort}`;
      default:
        return badge;
    }
  };

  const renderTypeName = (type: string): string => {
    switch (type) {
      case 'flight':
        return t.types.flight;
      case 'train':
        return t.types.train;
      case 'bus':
        return t.types.bus;
      case 'car':
        return t.types.car;
      default:
        return type.toUpperCase();
    }
  };

  const formatDuration = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes < 0) {
      return '—';
    }

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;

    return `${h}h ${m}m`;
  };

  const formatPrice = (metadata?: TransportRouteMetadata): string => {
    if (!metadata) return 'Brak danych';

    const { price } = metadata;

    if (price.status === 'UNAVAILABLE') {
      return 'Brak ceny';
    }

    if (price.min === price.max) {
      return `${price.min} ${price.currency}`;
    }

    return `${price.min}–${price.max} ${price.currency}`;
  };

  const getPriceLabel = (metadata?: TransportRouteMetadata): string => {
    if (!metadata) return 'brak danych cenowych';

    switch (metadata.price.status) {
      case 'LIVE':
        return 'aktualna cena';
      case 'ESTIMATE':
        return 'koszt orientacyjny';
      case 'UNAVAILABLE':
      default:
        return 'brak aktualnej ceny';
    }
  };

  const getDataStatus = (metadata?: TransportRouteMetadata): string => {
    if (!metadata) return 'Brak informacji o źródle';

    switch (metadata.price.status) {
      case 'LIVE':
        return metadata.price.source
          ? `● Aktualne dane · ${metadata.price.source}`
          : '● Aktualne dane';

      case 'ESTIMATE':
        return metadata.price.source
          ? `◐ Estymacja · ${metadata.price.source}`
          : '◐ Estymacja';

      case 'UNAVAILABLE':
      default:
        return '○ Brak aktualnej ceny';
    }
  };

  const formatCheckedAt = (metadata?: TransportRouteMetadata): string => {
    const checkedAt = metadata?.price.checkedAt;

    if (!checkedAt) return '';

    const date = new Date(checkedAt);

    if (Number.isNaN(date.getTime())) return '';

    return `Sprawdzono: ${date.toLocaleString(
      language === 'pl' ? 'pl-PL' : language
    )}`;
  };

  const renderPrice = (
    item: TransportOption,
    metadata?: TransportRouteMetadata
  ) => {
    const status = metadata?.price.status;

    return (
      <View style={styles.priceContainer}>
        <Text
          style={[
            styles.priceText,
            status === 'UNAVAILABLE' && styles.priceUnavailable,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatPrice(metadata)}
        </Text>

        <Text style={styles.priceLabel}>
          {getPriceLabel(metadata)}
        </Text>
      </View>
    );
  };

  const renderDataInfo = (metadata?: TransportRouteMetadata) => {
    if (!metadata) return null;

    return (
      <View style={styles.dataInfoBox}>
        <Text style={styles.dataInfoText}>
          {getDataStatus(metadata)}
        </Text>

        {formatCheckedAt(metadata) ? (
          <Text style={styles.checkedAtText}>
            {formatCheckedAt(metadata)}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderError = () => {
    if (!errorMessage) return null;

    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>Brak danych</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.container}>
        {/* NAGŁÓWEK */}
        <View style={styles.header}>
          <Text style={styles.title}>{t.title}</Text>

          <Text style={styles.routeSubtitle}>
            {origin ? `${origin.toUpperCase()} → ` : ''}
            {destination.toUpperCase() || 'CEL PODRÓŻY'}
          </Text>

          <Text style={styles.desc}>
            {t.subtitle}
          </Text>

          <Text style={styles.trustHint}>
            Ceny oznaczone jako „aktualna cena” pochodzą z dostępnego źródła.
            Estymacje są wyraźnie oznaczone.
          </Text>
        </View>

        {/* LISTA OPCJI */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator
                size="large"
                color="#F59E0B"
              />

              <Text style={styles.loaderText}>
                {t.calculating}
              </Text>

              <Text style={styles.loaderSubtext}>
                Pobieramy rozkłady, ceny i dane potrzebne do porównania.
              </Text>
            </View>
          ) : (
            <>
              {renderError()}

              {options.length === 0 && !errorMessage ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>
                    Brak dostępnych danych
                  </Text>

                  <Text style={styles.emptyText}>
                    Nie znaleziono wiarygodnych połączeń dla wybranej trasy.
                  </Text>
                </View>
              ) : null}

              {options.map((item: TransportOption) => {
                const isSelected =
                  transport.selectedOption?.id === item.id;

                const metadata =
                  getTransportRouteMetadata(item.id);

                const priceUnavailable =
                  metadata?.price.status === 'UNAVAILABLE';

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.85}
                    onPress={() => setTransportOption(item)}
                    style={[
                      styles.card,
                      isSelected && styles.cardSelected,
                    ]}
                  >
                    {/* ODZNAKI */}
                    {item.badges.length > 0 && (
                      <View style={styles.badgesRow}>
                        {item.badges.map((badge: string) => (
                          <View
                            key={badge}
                            style={styles.badge}
                          >
                            <Text style={styles.badgeText}>
                              {renderBadgeText(badge)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* ŚRODEK TRANSPORTU / PRZEWOŹNIK / CENA */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.providerInfo}>
                        <Text style={styles.typeTitle}>
                          {renderTypeName(item.type)}
                        </Text>

                        <Text style={styles.providerSubtitle}>
                          {item.provider}
                        </Text>
                      </View>

                      {renderPrice(item, metadata)}
                    </View>

                    {/* STATUS ŹRÓDŁA */}
                    {renderDataInfo(metadata)}

                    {/* CZAS */}
                    <View style={styles.timeBox}>
                      <View style={styles.timeRow}>
                        <Text style={styles.timeLabel}>
                          {t.rawDuration}
                        </Text>

                        <Text style={styles.timeValue}>
                          {formatDuration(
                            item.rawDurationMinutes
                          )}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.timeRow,
                          { marginTop: 4 },
                        ]}
                      >
                        <Text style={styles.d2dLabel}>
                          {t.doorToDoor}
                        </Text>

                        <Text style={styles.d2dValue}>
                          {formatDuration(
                            item.doorToDoorDurationMinutes
                          )}
                        </Text>
                      </View>
                    </View>

                    {/* UWAGI / SKŁADOWE KOSZTU */}
                    {metadata?.notes?.length ? (
                      <View style={styles.notesBox}>
                        {metadata.notes.map((note) => (
                          <Text
                            key={note}
                            style={styles.noteText}
                          >
                            • {note}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    {/* STRES + ZAKUP */}
                    <View style={styles.cardFooter}>
                      <Text style={styles.stressLabel}>
                        {t.stressScore}{' '}
                        <Text
                          style={[
                            styles.stressValue,
                            item.stressScore > 6
                              ? styles.stressHigh
                              : item.stressScore > 3
                              ? styles.stressMedium
                              : styles.stressLow,
                          ]}
                        >
                          {item.stressScore}/10
                        </Text>
                      </Text>

                      {item.bookingUrl ? (
                        <TouchableOpacity
                          onPress={() =>
                            handleOpenBooking(
                              item.bookingUrl
                            )
                          }
                          style={styles.bookButton}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.bookButtonText}>
                            {priceUnavailable
                              ? 'Sprawdź ↗'
                              : `${t.buyTicket} ↗`}
                          </Text>
                        </TouchableOpacity>
                      ) : item.type === 'car' ? (
                        <Text style={styles.privateVehicleText}>
                          {t.ownVehicle}
                        </Text>
                      ) : (
                        <Text style={styles.privateVehicleText}>
                          Brak zakupu online
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* DOLNY PASEK */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              !transport.selectedOption && {
                opacity: 0.5,
              },
            ]}
            disabled={!transport.selectedOption}
            onPress={() =>
              navigation?.navigate('Step3')
            }
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {commonT.button_nextStep}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation?.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              {commonT.button_goBack}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },

  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  routeSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  desc: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 18,
  },

  trustHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 16,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  loaderContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loaderText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },

  loaderSubtext: {
    color: '#64748B',
    marginTop: 6,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },

  errorBox: {
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },

  errorTitle: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },

  errorText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
  },

  emptyBox: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },

  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },

  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },

  cardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#162032',
  },

  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },

  badge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  badgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },

  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  providerInfo: {
    flex: 1,
    marginRight: 10,
  },

  typeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  providerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },

  priceContainer: {
    alignItems: 'flex-end',
    maxWidth: '52%',
  },

  priceText: {
    color: '#38BDF8',
    fontSize: 20,
    fontWeight: '800',
  },

  priceUnavailable: {
    color: '#64748B',
    fontSize: 15,
  },

  priceLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  dataInfoBox: {
    backgroundColor: '#0B1120',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 10,
  },

  dataInfoText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },

  checkedAtText: {
    color: '#475569',
    fontSize: 9,
    marginTop: 2,
  },

  timeBox: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 12,
  },

  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  timeLabel: {
    color: '#64748B',
    fontSize: 12,
  },

  timeValue: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },

  d2dLabel: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },

  d2dValue: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
  },

  notesBox: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  noteText: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 15,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12,
  },

  stressLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },

  stressValue: {
    fontWeight: '800',
  },

  stressLow: {
    color: '#4ADE80',
  },

  stressMedium: {
    color: '#FACC15',
  },

  stressHigh: {
    color: '#F87171',
  },

  bookButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },

  bookButtonText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },

  privateVehicleText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
  },

  bottomActions: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0B1120',
  },

  primaryButton: {
    backgroundColor: '#F59E0B',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  primaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },

  secondaryButton: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
});