// src/components/ProximityAlertBanner.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  checkProximityStatus,
  ProximityCheckResult,
} from '../lib/proximityAlertService';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';

interface ProximityAlertBannerProps {
  trip: any;
  userCoords?: { latitude: number; longitude: number } | null;
  onShowTicket: (result: ProximityCheckResult) => void;
  onDismiss?: () => void;
  testID?: string;
}

export const ProximityAlertBanner: React.FC<ProximityAlertBannerProps> = ({
  trip,
  userCoords,
  onShowTicket,
  onDismiss,
  testID = 'proximity-alert-banner',
}) => {
  const { language } = useAuthStore();
  const t = translations[language]?.proximityAlert || translations.pl.proximityAlert;

  const [dismissed, setDismissed] = useState(false);
  const [proximityResult, setProximityResult] = useState<ProximityCheckResult | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      if (!trip || dismissed) return;
      const res = await checkProximityStatus(trip, userCoords);
      if (isMounted) {
        setProximityResult(res);
      }
    };

    runCheck();

    // Sprawdzaj co 60 sekund w trakcie aktywnej podróży
    const interval = setInterval(runCheck, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [trip, userCoords, dismissed]);

  // Efekt delikatnej pulsacji obramowania
  useEffect(() => {
    if (proximityResult?.shouldAlert && !dismissed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [proximityResult?.shouldAlert, dismissed]);

  if (!proximityResult?.shouldAlert || dismissed) {
    return null;
  }

  const isLocationReason =
    proximityResult.reason === 'LOCATION' || proximityResult.reason === 'BOTH';
  const minutes = proximityResult.minutesUntilDeparture;

  const titleText =
    isLocationReason || minutes === null
      ? t.bannerTitleNear
      : t.bannerTitleTime.replace('{{minutes}}', String(Math.max(0, minutes)));

  const subtitleText = t.bannerSubtitle.replace(
    '{{destination}}',
    proximityResult.destination || trip?.destination || ''
  );

  return (
    <View style={styles.container} testID={testID}>
      <Animated.View
        style={[
          styles.bannerCard,
          {
            borderColor: isLocationReason ? '#38BDF8' : '#F59E0B',
            shadowOpacity: pulseAnim,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.iconBox}>
            <Ionicons
              name={isLocationReason ? 'location' : 'time'}
              size={18}
              color={isLocationReason ? '#38BDF8' : '#F59E0B'}
            />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.titleText}>{titleText}</Text>
            <Text style={styles.subtitleText} numberOfLines={2}>
              {subtitleText}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.dismissTouch}
            onPress={() => {
              setDismissed(true);
              onDismiss?.();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="proximity-banner-dismiss"
          >
            <Ionicons name="close" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={styles.showTicketBtn}
            activeOpacity={0.8}
            onPress={() => onShowTicket(proximityResult)}
            testID="proximity-banner-show-ticket"
          >
            <Ionicons name="qr-code-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.showTicketBtnText}>{t.showTicketBtn}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  bannerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: 6,
  },
  titleText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  subtitleText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  dismissTouch: {
    padding: 2,
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  showTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  showTicketBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
