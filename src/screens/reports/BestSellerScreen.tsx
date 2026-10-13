import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { reportService } from '../../services/reportService';
import { Header } from '../../components/common/Header';
import { formatIDR } from '../../utils/formatters';
import {
  Trophy,
  Flame,
  Award,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Layers,
  ChevronRight,
} from 'lucide-react-native';

type PeriodType = 'today' | '7days' | 'thisMonth' | 'all';
type ChannelType = 'all' | 'offline' | 'gofood' | 'shopeefood' | 'grabfood';

interface BestSellerItem {
  id: string;
  nama: string;
  kategori: string;
  qty: number;
  omset: number;
  percent: number;
}

export const BestSellerScreen: React.FC<{ onBack?: () => void; navigation?: any }> = ({
  onBack,
  navigation,
}) => {
  const [period, setPeriod] = useState<PeriodType>('thisMonth');
  const [channel, setChannel] = useState<ChannelType>('all');
  const [items, setItems] = useState<BestSellerItem[]>([]);
  const [totalQty, setTotalQty] = useState(0);
  const [totalOmset, setTotalOmset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await reportService.getBestSellerStats(period, channel);
      setItems(res.items);
      setTotalQty(res.totalQty);
      setTotalOmset(res.totalOmset);
    } catch (e) {
      console.error('Failed to load best seller data:', e);
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [period, channel]);

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [period, channel])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  const top3 = items.slice(0, 3);
  const remainingItems = items.slice(3);

  return (
    <View style={styles.container}>
      <Header
        title="Menu Terlaris (Best Seller)"
        subtitle="Analisis Penjualan Menu & Channel"
        onBack={handleBack}
      />

      {/* Channel Filters Scroll */}
      <View style={styles.channelScrollWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelRow}>
          {[
            { key: 'all', label: 'Semua Channel', emoji: '🌟' },
            { key: 'offline', label: 'Offline / Kasir', emoji: '🏪' },
            { key: 'gofood', label: 'GoFood', emoji: '🟢' },
            { key: 'shopeefood', label: 'ShopeeFood', emoji: '🟠' },
            { key: 'grabfood', label: 'GrabFood', emoji: '🟢' },
          ].map((ch) => {
            const isSelected = channel === ch.key;
            return (
              <TouchableOpacity
                key={`ch-${ch.key}`}
                style={[styles.channelChip, isSelected && styles.channelChipActive]}
                onPress={() => setChannel(ch.key as ChannelType)}
                activeOpacity={0.7}
              >
                <Text style={styles.channelEmoji}>{ch.emoji}</Text>
                <Text style={[styles.channelChipText, isSelected && styles.channelChipTextActive]}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Period Filter Tabs */}
      <View style={styles.periodRow}>
        {[
          { key: 'today', label: 'Hari Ini' },
          { key: '7days', label: '7 Hari' },
          { key: 'thisMonth', label: 'Bulan Ini' },
          { key: 'all', label: 'Semua Waktu' },
        ].map((p) => {
          const isSelected = period === p.key;
          return (
            <TouchableOpacity
              key={`p-${p.key}`}
              style={[styles.periodBtn, isSelected && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key as PeriodType)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodBtnText, isSelected && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Memuat statistik menu terlaris...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />}
        >
          {/* Summary KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { borderLeftColor: '#D97706' }]}>
              <View style={styles.kpiHeader}>
                <ShoppingBag size={14} color="#D97706" />
                <Text style={styles.kpiLabel}>Total Terjual</Text>
              </View>
              <Text style={styles.kpiValue}>{totalQty} <Text style={styles.kpiUnit}>Porsi</Text></Text>
            </View>

            <View style={[styles.kpiCard, { borderLeftColor: '#16A34A' }]}>
              <View style={styles.kpiHeader}>
                <TrendingUp size={14} color="#16A34A" />
                <Text style={styles.kpiLabel}>Total Omset</Text>
              </View>
              <Text style={[styles.kpiValue, { color: '#16A34A' }]}>{formatIDR(totalOmset)}</Text>
            </View>

            <View style={[styles.kpiCard, { borderLeftColor: '#2563EB' }]}>
              <View style={styles.kpiHeader}>
                <Layers size={14} color="#2563EB" />
                <Text style={styles.kpiLabel}>Menu Terjual</Text>
              </View>
              <Text style={styles.kpiValue}>{items.length} <Text style={styles.kpiUnit}>Menu</Text></Text>
            </View>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Award size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Belum Ada Menu Terjual</Text>
              <Text style={styles.emptySub}>
                Belum ada transaksi selesai pada filter periode dan channel yang dipilih.
              </Text>
            </View>
          ) : (
            <>
              {/* TOP 3 PODIUM SECTION */}
              {top3.length > 0 && (
                <View style={styles.podiumSection}>
                  <View style={styles.sectionHeader}>
                    <Trophy size={18} color="#D97706" />
                    <Text style={styles.sectionTitle}>Podium Juara Terlaris</Text>
                  </View>

                  <View style={styles.podiumGrid}>
                    {top3.map((item, index) => {
                      const medalBg =
                        index === 0 ? '#FEF3C7' : index === 1 ? '#F1F5F9' : '#FFEDD5';
                      const medalBorder =
                        index === 0 ? '#F59E0B' : index === 1 ? '#94A3B8' : '#EA580C';
                      const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                      const rankLabel =
                        index === 0 ? 'JUARA 1' : index === 1 ? 'JUARA 2' : 'JUARA 3';

                      return (
                        <View
                          key={`podium-${item.id}-${index}`}
                          style={[
                            styles.podiumCard,
                            { backgroundColor: medalBg, borderColor: medalBorder },
                            index === 0 && styles.podiumCardFirst,
                          ]}
                        >
                          <View style={styles.podiumMedalBox}>
                            <Text style={styles.podiumEmoji}>{medalEmoji}</Text>
                            <Text style={[styles.podiumRankText, { color: medalBorder }]}>
                              {rankLabel}
                            </Text>
                          </View>

                          <Text style={styles.podiumName} numberOfLines={2}>
                            {item.nama}
                          </Text>
                          <Text style={styles.podiumCat}>{item.kategori}</Text>

                          <View style={styles.podiumStats}>
                            <Text style={styles.podiumQty}>
                              {item.qty} <Text style={styles.podiumQtyUnit}>porsi</Text>
                            </Text>
                            <Text style={styles.podiumOmset}>{formatIDR(item.omset)}</Text>
                          </View>

                          <View style={styles.podiumShareBadge}>
                            <Text style={styles.podiumShareText}>{item.percent}% pangsa</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* LEADERBOARD LIST */}
              <View style={styles.leaderboardSection}>
                <View style={styles.sectionHeader}>
                  <Flame size={18} color="#EA580C" />
                  <Text style={styles.sectionTitle}>Klasemen Lengkap Penjualan</Text>
                </View>

                <View style={styles.leaderboardCard}>
                  {items.map((item, index) => {
                    const isTop1 = index === 0;
                    const isTop2 = index === 1;
                    const isTop3 = index === 2;

                    const badgeColor = isTop1
                      ? '#F59E0B'
                      : isTop2
                      ? '#64748B'
                      : isTop3
                      ? '#D97706'
                      : '#94A3B8';

                    return (
                      <View
                        key={`rank-item-${item.id}-${index}`}
                        style={[
                          styles.leaderboardRow,
                          index < items.length - 1 && styles.rowBorderBottom,
                        ]}
                      >
                        {/* Rank Badge */}
                        <View
                          style={[
                            styles.rankBadge,
                            isTop1 && styles.rankBadge1,
                            isTop2 && styles.rankBadge2,
                            isTop3 && styles.rankBadge3,
                          ]}
                        >
                          <Text
                            style={[
                              styles.rankBadgeText,
                              (isTop1 || isTop2 || isTop3) && styles.rankBadgeTextTop,
                            ]}
                          >
                            #{index + 1}
                          </Text>
                        </View>

                        {/* Title & Category & Progress Bar */}
                        <View style={styles.itemInfoCol}>
                          <View style={styles.itemNameRow}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {item.nama}
                            </Text>
                            <View style={styles.percentPill}>
                              <Text style={styles.percentPillText}>{item.percent}%</Text>
                            </View>
                          </View>

                          <Text style={styles.itemCategory}>{item.kategori}</Text>

                          {/* Progress bar */}
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                {
                                  width: `${Math.min(100, Math.max(4, item.percent))}%`,
                                  backgroundColor: isTop1
                                    ? '#F59E0B'
                                    : isTop2
                                    ? '#0284C7'
                                    : '#10B981',
                                },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Qty & Omset */}
                        <View style={styles.itemSalesCol}>
                          <Text style={styles.itemQtyText}>
                            {item.qty} <Text style={styles.itemQtyUnit}>porsi</Text>
                          </Text>
                          <Text style={styles.itemOmsetText}>{formatIDR(item.omset)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    fontWeight: '600',
  },
  channelScrollWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  channelRow: {
    paddingHorizontal: 14,
    gap: 8,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  channelEmoji: {
    fontSize: 12,
  },
  channelChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  channelChipTextActive: {
    color: '#92400E',
    fontWeight: '800',
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  periodBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  periodBtnActive: {
    backgroundColor: '#0F172A',
  },
  periodBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  periodBtnTextActive: {
    color: '#FFFFFF',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 14,
    gap: 14,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3.5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiUnit: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  podiumSection: {
    gap: 4,
  },
  podiumGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  podiumCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  podiumCardFirst: {
    transform: [{ scale: 1.02 }],
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  podiumMedalBox: {
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumEmoji: {
    fontSize: 22,
  },
  podiumRankText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    minHeight: 32,
  },
  podiumCat: {
    fontSize: 9.5,
    color: '#64748B',
    marginBottom: 6,
  },
  podiumStats: {
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumQty: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  podiumQtyUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  podiumOmset: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  podiumShareBadge: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  podiumShareText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#334155',
  },
  leaderboardSection: {
    gap: 4,
  },
  leaderboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    elevation: 1,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  rowBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge1: {
    backgroundColor: '#FEF3C7',
  },
  rankBadge2: {
    backgroundColor: '#E2E8F0',
  },
  rankBadge3: {
    backgroundColor: '#FFEDD5',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  rankBadgeTextTop: {
    color: '#0F172A',
    fontWeight: '900',
  },
  itemInfoCol: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  percentPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  percentPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  itemCategory: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  itemSalesCol: {
    alignItems: 'flex-end',
  },
  itemQtyText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  itemQtyUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  itemOmsetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 1,
  },
});
