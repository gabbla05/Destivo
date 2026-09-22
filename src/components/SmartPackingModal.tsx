// src/components/SmartPackingModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { translations } from '../i18n/translations';
import {
  loadPackingAssistant,
  togglePackingItem,
  addCustomPackingItem,
  deletePackingItem,
  resetPackingList,
  formatPackingListForSharing,
  PackingAssistantData,
  PackingItem,
  PackingCategory,
} from '../lib/smartPackingAssistant';

interface SmartPackingModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  transportType?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SmartPackingModal: React.FC<SmartPackingModalProps> = ({
  visible,
  onClose,
  tripId,
  destination,
  startDate,
  endDate,
  transportType,
}) => {
  const { language } = useAuthStore();
  const t = translations[language].smartPacking;
  const commonT = translations[language].common;

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<PackingAssistantData | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unpacked' | 'packed'>('all');
  const [customItemText, setCustomItemText] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadPackingAssistant({
        tripId,
        destination,
        startDate,
        endDate,
        transportType,
        language,
      });
      setData(result);
    } catch (err) {
      console.warn('Error loading packing assistant:', err);
    } finally {
      setLoading(false);
    }
  }, [tripId, destination, startDate, endDate, transportType, language]);

  useEffect(() => {
    if (visible) {
      fetchData();
    }
  }, [visible, fetchData]);

  const handleToggleItem = async (itemId: string) => {
    if (!data) return;
    // Optymistyczna aktualizacja UI
    const updatedItems = data.items.map((i) =>
      i.id === itemId ? { ...i, checked: !i.checked } : i
    );
    const packedCount = updatedItems.filter((i) => i.checked).length;
    const totalCount = updatedItems.length;
    const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

    setData({
      ...data,
      items: updatedItems,
      packedCount,
      totalCount,
      progressPercent,
    });

    await togglePackingItem(data.tripId, itemId);
  };

  const handleAddCustomItem = async () => {
    if (!customItemText.trim() || !data) return;
    const text = customItemText.trim();
    setCustomItemText('');
    const updated = await addCustomPackingItem(data.tripId, text, 'custom', language);
    if (updated) {
      setData(updated);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!data) return;
    const updated = await deletePackingItem(data.tripId, itemId);
    if (updated) {
      setData(updated);
    }
  };

  const handleResetList = () => {
    Alert.alert(t.resetConfirmTitle, t.resetConfirmMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.resetBtn,
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const resetResult = await resetPackingList({
              tripId,
              destination,
              startDate,
              endDate,
              transportType,
              language,
            });
            setData(resetResult);
          } catch (err) {
            console.warn('Error resetting packing list:', err);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleShareList = async () => {
    if (!data) return;
    const text = formatPackingListForSharing(data, language);
    try {
      await Share.share({
        title: t.modalTitle,
        message: text,
      });
    } catch (err) {
      console.warn('Error sharing packing list:', err);
    }
  };

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  // Grupowanie i filtrowanie
  const getFilteredItems = (): PackingItem[] => {
    if (!data?.items) return [];
    if (activeFilter === 'unpacked') {
      return data.items.filter((i) => !i.checked);
    }
    if (activeFilter === 'packed') {
      return data.items.filter((i) => i.checked);
    }
    return data.items;
  };

  const filteredItems = getFilteredItems();

  const categories: PackingCategory[] = [
    'transport',
    'weather',
    'clothing',
    'toiletries',
    'electronics',
    'documents',
    'custom',
  ];

  const getCategoryTitle = (cat: PackingCategory): string => {
    switch (cat) {
      case 'transport':
        return t.catTransport;
      case 'weather':
        return t.catWeather;
      case 'clothing':
        return t.catClothing;
      case 'toiletries':
        return t.catToiletries;
      case 'electronics':
        return t.catElectronics;
      case 'documents':
        return t.catDocuments || (language === 'pl' ? 'Dokumenty & Płatności' : 'Documents & Payments');
      case 'custom':
        return t.catCustom;
    }
  };

  const getCategoryIcon = (cat: PackingCategory): any => {
    switch (cat) {
      case 'transport':
        return 'airplane-outline';
      case 'weather':
        return 'partly-sunny-outline';
      case 'clothing':
        return 'shirt-outline';
      case 'toiletries':
        return 'medkit-outline';
      case 'electronics':
        return 'phone-portrait-outline';
      case 'documents':
        return 'card-outline';
      case 'custom':
        return 'bookmark-outline';
    }
  };

  // Etykiety i podsumowanie parametrów
  const getTransportBadgeText = () => {
    if (!data) return '';
    switch (data.transportType) {
      case 'flight':
        return { label: t.paramFlight, rule: t.ruleFlight, icon: 'airplane' };
      case 'car':
        return { label: t.paramCar, rule: t.ruleCar, icon: 'car' };
      case 'train':
        return { label: t.paramTrain, rule: t.ruleTrain, icon: 'train' };
      case 'bus':
        return { label: t.paramBus, rule: t.ruleBus, icon: 'bus' };
      default:
        return { label: t.paramOther || 'Podróż', rule: t.ruleFlight, icon: 'navigate' };
    }
  };

  const getWeatherBadgeText = () => {
    if (!data) return { label: '', rule: '', icon: 'sunny' };
    const w = data.weather;
    if (w.isRain) {
      return {
        label: t.paramRain.replace('{{temp}}', String(w.temp)),
        rule: t.ruleRain,
        icon: 'rainy',
      };
    }
    if (w.temp < 10) {
      return {
        label: t.paramCold.replace('{{temp}}', String(w.temp)),
        rule: t.ruleCold,
        icon: 'snow',
      };
    }
    if (w.temp >= 22) {
      return {
        label: t.paramWarm.replace('{{temp}}', String(w.temp)),
        rule: t.ruleWarm,
        icon: 'sunny',
      };
    }
    return {
      label: t.paramMild.replace('{{temp}}', String(w.temp)),
      rule: t.ruleMild,
      icon: 'partly-sunny',
    };
  };

  const transportBadge = getTransportBadgeText();
  const weatherBadge = getWeatherBadgeText();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          {/* HEADER MODALA */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.headerIconBadge}>
                <Ionicons name="briefcase-outline" size={20} color="#F59E0B" />
              </View>
              <View style={styles.headerTitleGroup}>
                <Text style={styles.modalTitle}>{t.modalTitle}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {destination ? destination.toUpperCase() : 'DESTIVO'} • {t.modalSubtitle}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              testID="close-packing-modal-btn"
            >
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>{t.loadingAssistant}</Text>
            </View>
          ) : data ? (
            <ScrollView
              style={styles.scrollArea}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {/* KARTY WARUNKÓW PODRÓŻY (WEATHER, TRANSPORT, DURATION) */}
              <View style={styles.conditionsCard}>
                <View style={styles.conditionsHeaderRow}>
                  <View style={styles.conditionsTitleBadge}>
                    <Ionicons name="sparkles" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.conditionsTitleText}>{t.badgeDynamic}</Text>
                  </View>
                  <View style={styles.conditionsHeaderRight}>
                    <Text style={styles.destinationName}>{destination}</Text>
                    <View style={styles.scrollHintBadge}>
                      <Ionicons name="swap-horizontal-outline" size={11} color="#38BDF8" style={{ marginRight: 3 }} />
                      <Text style={styles.scrollHintText}>{t.scrollPillsHint || (language === 'pl' ? 'Przesuń w lewo' : 'Swipe left')}</Text>
                    </View>
                  </View>
                </View>

                {/* 3 PIGUŁKI WARUNKÓW - PRZEWIJANE W LEWO */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.conditionPillsScroll}
                  style={styles.conditionPillsScrollContainer}
                  testID="condition-pills-scroll"
                >
                  {/* PIGUŁKA 1: DNI WYJAZDU */}
                  <TouchableOpacity
                    style={styles.conditionPill}
                    activeOpacity={0.7}
                    onPress={() =>
                      Alert.alert(
                        t.paramDays.replace('{{days}}', String(data.durationDays)),
                        t.paramDaysRule.replace('{{count}}', String(data.durationDays))
                      )
                    }
                  >
                    <View style={styles.pillIconBox}>
                      <Ionicons name="calendar" size={15} color="#38BDF8" />
                    </View>
                    <View style={styles.pillContent}>
                      <Text style={styles.pillMainText}>
                        {t.paramDays.replace('{{days}}', String(data.durationDays))}
                      </Text>
                      <Text style={styles.pillSubText}>
                        {t.paramDaysRule.replace('{{count}}', String(data.durationDays))}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* PIGUŁKA 2: ŚRODEK TRANSPORTU */}
                  <TouchableOpacity
                    style={styles.conditionPill}
                    activeOpacity={0.7}
                    onPress={() => Alert.alert(transportBadge.label, transportBadge.rule)}
                  >
                    <View style={styles.pillIconBox}>
                      <Ionicons name={transportBadge.icon as any} size={15} color="#F59E0B" />
                    </View>
                    <View style={styles.pillContent}>
                      <Text style={styles.pillMainText}>{transportBadge.label}</Text>
                      <Text style={styles.pillSubText}>
                        {transportBadge.rule}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* PIGUŁKA 3: PROGNOZA POGODY */}
                  <TouchableOpacity
                    style={styles.conditionPill}
                    activeOpacity={0.7}
                    onPress={() => Alert.alert(weatherBadge.label, weatherBadge.rule)}
                  >
                    <View style={styles.pillIconBox}>
                      <Ionicons name={weatherBadge.icon as any} size={15} color="#10B981" />
                    </View>
                    <View style={styles.pillContent}>
                      <Text style={styles.pillMainText}>{weatherBadge.label}</Text>
                      <Text style={styles.pillSubText}>
                        {weatherBadge.rule}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* PASEK POSTĘPU SPAKOWANIA */}
              <View style={styles.progressSection}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>
                    {t.progressLabel
                      .replace('{{packed}}', String(data.packedCount))
                      .replace('{{total}}', String(data.totalCount))
                      .replace('{{percent}}', String(data.progressPercent))}
                  </Text>
                  <Text style={styles.progressPercentText}>{data.progressPercent}%</Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(0, data.progressPercent))}%`,
                        backgroundColor: data.progressPercent === 100 ? '#10B981' : '#38BDF8',
                      },
                    ]}
                  />
                </View>

                {data.progressPercent === 100 && (
                  <View style={styles.completedBanner}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.completedTitle}>{t.badgeCompleted}</Text>
                      <Text style={styles.completedSubtitle}>{t.badgeCompletedSub}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* FILTRY: WSZYSTKIE / DO SPAKOWANIA / SPAKOWANE */}
              <View style={styles.filtersRow}>
                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === 'all' && styles.filterChipTextActive,
                    ]}
                  >
                    {t.filterAll.replace('{{count}}', String(data.totalCount))}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'unpacked' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('unpacked')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === 'unpacked' && styles.filterChipTextActive,
                    ]}
                  >
                    {t.filterUnpacked.replace(
                      '{{count}}',
                      String(data.totalCount - data.packedCount)
                    )}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'packed' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('packed')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === 'packed' && styles.filterChipTextActive,
                    ]}
                  >
                    {t.filterPacked.replace('{{count}}', String(data.packedCount))}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SEKCJE KATEGORII Z PRZEDMIOTAMI */}
              {categories.map((cat) => {
                const catItems = filteredItems.filter((i) => i.category === cat);
                if (catItems.length === 0) return null;

                const isCollapsed = !!collapsedCategories[cat];
                const catPackedCount = catItems.filter((i) => i.checked).length;

                return (
                  <View key={cat} style={styles.categoryBlock}>
                    {/* NAGŁÓWEK KATEGORII */}
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      activeOpacity={0.7}
                      onPress={() => toggleCategoryCollapse(cat)}
                    >
                      <View style={styles.categoryHeaderLeft}>
                        <Ionicons
                          name={getCategoryIcon(cat)}
                          size={17}
                          color="#38BDF8"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.categoryHeaderTitle}>{getCategoryTitle(cat)}</Text>
                        <View style={styles.categoryCountBadge}>
                          <Text style={styles.categoryCountText}>
                            {catPackedCount}/{catItems.length}
                          </Text>
                        </View>
                      </View>

                      <Ionicons
                        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                        size={17}
                        color="#64748B"
                      />
                    </TouchableOpacity>

                    {/* PRZEDMIOTY W KATEGORII */}
                    {!isCollapsed && (
                      <View style={styles.itemsListContainer}>
                        {catItems.map((item) => {
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.itemRow,
                                item.checked && styles.itemRowChecked,
                              ]}
                              activeOpacity={0.7}
                              onPress={() => handleToggleItem(item.id)}
                              testID={`packing-item-row-${item.id}`}
                            >
                              {/* CHECKBOX */}
                              <TouchableOpacity
                                style={styles.checkboxTouch}
                                onPress={() => handleToggleItem(item.id)}
                                testID={`packing-item-check-${item.id}`}
                              >
                                <Ionicons
                                  name={item.checked ? 'checkbox' : 'square-outline'}
                                  size={22}
                                  color={item.checked ? '#10B981' : '#64748B'}
                                />
                              </TouchableOpacity>

                              {/* TREŚĆ POZYCJI */}
                              <View style={styles.itemInfo}>
                                <View style={styles.itemTitleRow}>
                                  <Text
                                    style={[
                                      styles.itemTitle,
                                      item.checked && styles.itemTitleChecked,
                                    ]}
                                  >
                                    {item.title}
                                  </Text>

                                  {item.quantity && (
                                    <View style={styles.quantityBadge}>
                                      <Text style={styles.quantityText}>
                                        {item.quantity} {item.unit || ''}
                                      </Text>
                                    </View>
                                  )}
                                </View>

                                {item.reason ? (
                                  <View style={styles.reasonRow}>
                                    {item.isWarning && (
                                      <View style={styles.warningTag}>
                                        <Ionicons name="alert-circle" size={10} color="#F87171" style={{ marginRight: 2 }} />
                                        <Text style={styles.warningTagText}>{t.warningBadge}</Text>
                                      </View>
                                    )}
                                    <Text
                                      style={[
                                        styles.itemReasonText,
                                        item.isWarning && styles.itemReasonWarning,
                                      ]}
                                    >
                                      {item.reason}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>

                              {/* PRZYCISK USUWANIA DLA WŁASNYCH POZYCJI */}
                              {item.isCustom && (
                                <TouchableOpacity
                                  style={styles.deleteCustomBtn}
                                  onPress={() => handleDeleteItem(item.id)}
                                  activeOpacity={0.7}
                                  testID={`delete-custom-item-${item.id}`}
                                >
                                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* DODAWANIE WŁASNEJ POZYCJI */}
              <View style={styles.addCustomCard}>
                <Text style={styles.addCustomTitle}>{t.catCustom}</Text>
                <View style={styles.addCustomInputRow}>
                  <TextInput
                    style={styles.customTextInput}
                    placeholder={t.addCustomPlaceholder}
                    placeholderTextColor="#64748B"
                    value={customItemText}
                    onChangeText={setCustomItemText}
                    onSubmitEditing={handleAddCustomItem}
                    returnKeyType="done"
                    testID="custom-item-input"
                  />
                  <TouchableOpacity
                    style={[
                      styles.addCustomBtn,
                      !customItemText.trim() && styles.addCustomBtnDisabled,
                    ]}
                    onPress={handleAddCustomItem}
                    activeOpacity={0.7}
                    disabled={!customItemText.trim()}
                    testID="custom-item-add-btn"
                  >
                    <Ionicons name="add" size={18} color="#0F172A" />
                    <Text style={styles.addCustomBtnText}>{t.addCustomBtn}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* PRZYCISKI AKCJI (UDOSTĘPNIJ, ZRESETUJ) */}
              <View style={styles.bottomActionsRow}>
                <TouchableOpacity
                  style={styles.actionBtnSecondary}
                  onPress={handleShareList}
                  activeOpacity={0.7}
                  testID="share-packing-btn"
                >
                  <Ionicons name="share-social-outline" size={16} color="#38BDF8" style={{ marginRight: 6 }} />
                  <Text style={styles.actionBtnSecondaryText}>{t.shareList}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnSecondary}
                  onPress={handleResetList}
                  activeOpacity={0.7}
                  testID="reset-packing-btn"
                >
                  <Ionicons name="refresh-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={[styles.actionBtnSecondaryText, { color: '#94A3B8' }]}>
                    {t.resetList}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t.emptyCategory}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 17, 32, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.94,
    minHeight: SCREEN_HEIGHT * 0.75,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  headerTitleGroup: {
    flex: 1,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
  },
  scrollArea: {
    marginTop: 12,
  },
  // KARTA WARUNKÓW PODRÓŻY
  conditionsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  conditionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  conditionsTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionsTitleText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  destinationName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  conditionsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scrollHintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  scrollHintText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  conditionPillsScrollContainer: {
    marginTop: 2,
  },
  conditionPillsScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 16,
    paddingVertical: 2,
  },
  conditionPill: {
    minWidth: 175,
    maxWidth: 230,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  pillContent: {
    flex: 1,
  },
  pillMainText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pillSubText: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },
  // POSTĘP
  progressSection: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  progressPercentText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  completedTitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  completedSubtitle: {
    color: '#A7F3D0',
    fontSize: 11,
    marginTop: 1,
  },
  // FILTRY
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  // KATEGORIA
  categoryBlock: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryCountBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  categoryCountText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  itemsListContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#26334D',
  },
  itemRowChecked: {
    opacity: 0.6,
  },
  checkboxTouch: {
    padding: 4,
    marginRight: 6,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  itemTitleChecked: {
    textDecorationLine: 'line-through',
    color: '#64748B',
  },
  quantityBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  quantityText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  warningTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 4,
  },
  warningTagText: {
    color: '#F87171',
    fontSize: 9,
    fontWeight: '900',
  },
  itemReasonText: {
    color: '#94A3B8',
    fontSize: 10,
    flex: 1,
  },
  itemReasonWarning: {
    color: '#FBBF24',
  },
  deleteCustomBtn: {
    padding: 6,
    marginLeft: 4,
  },
  // DODAWANIE WŁASNEJ POZYCJI
  addCustomCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
    marginBottom: 12,
  },
  addCustomTitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addCustomInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customTextInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 12,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addCustomBtnDisabled: {
    opacity: 0.5,
  },
  addCustomBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 2,
  },
  // PRZYCISKI W STOPCE
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionBtnSecondaryText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
