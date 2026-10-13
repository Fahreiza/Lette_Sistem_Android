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
import { subscribeToSyncEvents } from '../../services/desktopSyncService';
import { useAuthStore } from '../../stores/authStore';
import { Header } from '../../components/common/Header';
import { formatIDR } from '../../utils/formatters';
import { TransferWalletModal } from '../../components/wallet/TransferWalletModal';
import { AdjustWalletModal } from '../../components/wallet/AdjustWalletModal';
import {
  TrendingUp,
  AlertTriangle,
  Award,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  ChevronRight,
  Trophy,
  Banknote,
  CreditCard,
  Wallet,
  ArrowRightLeft,
  SlidersHorizontal,
} from 'lucide-react-native';

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isAdmin } = useAuthStore();
  const [data, setData] = useState<{
    omsetHariIni: number;
    transaksiHariIni: number;
    omsetKemarin: number;
    pengeluaranBulanIni: number;
    labaBersihBulanIni: number;
    lowStockCount: number;
    topMenus: any[];
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  } | null>(null);

  const [trendData, setTrendData] = useState<{ date: string; label: string; omset: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);

  const loadDashboard = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [dash, trend] = await Promise.all([
        reportService.getDashboardSummary(),
        reportService.getDailyTrend(7),
      ]);
      setData(dash);
      setTrendData(trend);
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  // Auto-refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadDashboard(false);
    }, [])
  );

  // Live auto-refresh when sync events occur
  useEffect(() => {
    loadDashboard(true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'orders' || event === 'expenses' || event === 'stock' || event === 'wallets') {
        console.log('[DashboardScreen] Live update received, refreshing metrics...');
        loadDashboard(false);
      }
    });
    return unsub;
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const maxTrendOmset = Math.max(...trendData.map((t) => t.omset), 100000);

  return (
    <View style={styles.container}>
      <Header title="Dashboard" />

      {loading || !data ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#D97706" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />}
        >
          {/* Quick Launcher: Buka Mesin Kasir */}
          <TouchableOpacity
            style={styles.launcherCard}
            onPress={() => navigation?.navigate('PosScreen')}
            activeOpacity={0.85}
          >
            <View style={styles.launcherIconBox}>
              <ShoppingBag size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.launcherTitle}>Buka Mesin Kasir</Text>
              <Text style={styles.launcherSubtitle}>Mulai layani pesanan pelanggan</Text>
            </View>
            <View style={styles.launcherArrow}>
              <ChevronRight size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* 3 Dompet Kas Toko: Saldo Laci Kasir, Saldo Manager, & Saldo Rekening Owner */}
          <View style={styles.walletSection}>
            <View style={styles.walletSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wallet size={16} color="#0F172A" />
                <Text style={styles.walletSectionTitle}>Saldo Kas & Dompet</Text>
              </View>

              {/* Action Buttons: Transfer & Kelola Saldo */}
              <View style={styles.walletActionsRow}>
                <TouchableOpacity
                  style={styles.walletActionBtnTransfer}
                  onPress={() => setTransferModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <ArrowRightLeft size={13} color="#2563EB" />
                  <Text style={styles.walletActionBtnTextTransfer}>Transfer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.walletActionBtnAdjust}
                  onPress={() => setAdjustModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <SlidersHorizontal size={13} color="#7E22CE" />
                  <Text style={styles.walletActionBtnTextAdjust}>Kelola</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 3 Horizontal Balance Cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.balanceScrollContent}
            >
              {/* Laci Kasir */}
              <View style={[styles.balanceCard, styles.balanceCardCash]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <Banknote size={14} color="#D97706" />
                  </View>
                  <Text style={styles.balanceLabel}>Laci Kasir</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#B45309' }]} numberOfLines={1}>
                  {formatIDR(data.saldoLaciKasir || 0)}
                </Text>
                <Text style={styles.balanceSub}>Fisik Kasir</Text>
              </View>

              {/* Saldo Manager */}
              <View style={[styles.balanceCard, styles.balanceCardManager]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <Wallet size={14} color="#16A34A" />
                  </View>
                  <Text style={styles.balanceLabel}>Saldo Manager</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#15803D' }]} numberOfLines={1}>
                  {formatIDR(data.saldoManager || 0)}
                </Text>
                <Text style={styles.balanceSub}>Petty Cash</Text>
              </View>

              {/* Rekening Owner */}
              <View style={[styles.balanceCard, styles.balanceCardOwner]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#DBEAFE' }]}>
                    <CreditCard size={14} color="#2563EB" />
                  </View>
                  <Text style={styles.balanceLabel}>Rekening Owner</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#1D4ED8' }]} numberOfLines={1}>
                  {formatIDR(data.saldoRekeningOwner || 0)}
                </Text>
                <Text style={styles.balanceSub}>QRIS & Online</Text>
              </View>
            </ScrollView>
          </View>

          {/* Launcher: Menu Terlaris (Best Seller) */}
          <TouchableOpacity
            style={styles.bestSellerLauncher}
            onPress={() => navigation?.navigate('BestSellerScreen')}
            activeOpacity={0.85}
          >
            <View style={styles.bestSellerIconBox}>
              <Trophy size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.bestSellerTitle}>Menu Terlaris</Text>
              </View>
              <Text style={styles.bestSellerSubtitle}>
                Peringkat menu Offline, Gojek, Shopee & Grab
              </Text>
            </View>
            <View style={styles.bestSellerArrow}>
              <ChevronRight size={18} color="#D97706" />
            </View>
          </TouchableOpacity>


          {/* Main Omset Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>Omset Hari Ini</Text>
              {data.omsetHariIni >= data.omsetKemarin ? (
                <View style={styles.diffBadgePositive}>
                  <ArrowUpRight size={12} color="#16A34A" />
                  <Text style={styles.diffTextPositive}>
                    +{formatIDR(data.omsetHariIni - data.omsetKemarin)}
                  </Text>
                </View>
              ) : (
                <View style={styles.diffBadgeNegative}>
                  <ArrowDownRight size={12} color="#DC2626" />
                  <Text style={styles.diffTextNegative}>
                    -{formatIDR(data.omsetKemarin - data.omsetHariIni)}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.omsetValue}>{formatIDR(data.omsetHariIni)}</Text>
            <Text style={styles.omsetSub}>{data.transaksiHariIni} transaksi selesai</Text>
          </View>

          {/* Monthly Finance Summary Grid */}
          <View style={styles.gridRow}>
            <View style={styles.gridCard}>
              <Text style={styles.cardLabel}>Pengeluaran Bulan Ini</Text>
              <Text style={styles.gridValueExpense}>{formatIDR(data.pengeluaranBulanIni)}</Text>
            </View>

            <View style={styles.gridCard}>
              <Text style={styles.cardLabel}>Estimasi Laba Bersih</Text>
              <Text style={styles.gridValueProfit}>{formatIDR(data.labaBersihBulanIni)}</Text>
            </View>
          </View>

          {/* 7-Day Trend Chart */}
          <View style={styles.card}>
            <View style={styles.chartHeader}>
              <BarChart2 size={16} color="#D97706" />
              <Text style={styles.sectionTitle}>Tren Omset 7 Hari</Text>
            </View>

            <View style={styles.barChartContainer}>
              {trendData.map((item, idx) => {
                const barHeight = Math.max(10, (item.omset / maxTrendOmset) * 90);
                const isToday = idx === trendData.length - 1;
                return (
                  <View key={`trend-${idx}`} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: barHeight },
                          isToday && styles.barFillToday,
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Top Selling Menus */}
          <View style={styles.card}>
            <View style={styles.chartHeader}>
              <Award size={16} color="#D97706" />
              <Text style={styles.sectionTitle}>Menu Terlaris Hari Ini</Text>
            </View>

            {data.topMenus.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada menu terjual hari ini</Text>
            ) : (
              data.topMenus.map((m, idx) => (
                <View key={`top-${idx}`} style={styles.topMenuRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuName}>{m.menu_name}</Text>
                    <Text style={styles.menuCat}>{m.category_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.menuQty}>{m.total_qty} porsi</Text>
                    <Text style={styles.menuSales}>{formatIDR(m.total_sales)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* Transfer Saldo Modal */}
      {data && (
        <TransferWalletModal
          visible={transferModalVisible}
          onClose={() => setTransferModalVisible(false)}
          onSuccess={() => loadDashboard(false)}
          currentBalances={{
            saldoLaciKasir: data.saldoLaciKasir || 0,
            saldoManager: data.saldoManager || 0,
            saldoRekeningOwner: data.saldoRekeningOwner || 0,
          }}
        />
      )}

      {/* Kelola Saldo (Koreksi Fisik) Modal */}
      {data && (
        <AdjustWalletModal
          visible={adjustModalVisible}
          onClose={() => setAdjustModalVisible(false)}
          onSuccess={() => loadDashboard(false)}
          currentBalances={{
            saldoLaciKasir: data.saldoLaciKasir || 0,
            saldoManager: data.saldoManager || 0,
            saldoRekeningOwner: data.saldoRekeningOwner || 0,
          }}
        />
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
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 36,
  },

  // Launcher Card
  launcherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
  },
  launcherIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  launcherTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  launcherSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  launcherArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Wallet Section & Cards
  walletSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  walletSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  walletSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletActionBtnTransfer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  walletActionBtnTextTransfer: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  walletActionBtnAdjust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  walletActionBtnTextAdjust: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E22CE',
  },
  balanceScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  balanceCard: {
    width: 132,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  balanceCardCash: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  balanceCardManager: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  balanceCardOwner: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  balanceIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  balanceValue: {
    fontSize: 14.5,
    fontWeight: '900',
  },
  balanceSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },

  // Best Seller Launcher
  bestSellerLauncher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    elevation: 2,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  bestSellerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestSellerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  bestSellerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  bestSellerPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  bestSellerPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  bestSellerArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stock Alert
  stockAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stockAlertIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },

  // Generic Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  omsetValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  omsetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },

  // Diff Badges
  diffBadgePositive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  diffTextPositive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  diffBadgeNegative: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  diffTextNegative: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gridValueExpense: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 6,
  },
  gridValueProfit: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 6,
  },

  // Charts
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    paddingTop: 10,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    height: 90,
    width: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#CBD5E1',
    borderRadius: 7,
  },
  barFillToday: {
    backgroundColor: '#D97706',
  },
  barLabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '600',
  },
  barLabelToday: {
    color: '#D97706',
    fontWeight: '800',
  },

  // Top Menus
  topMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  menuName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuCat: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  menuQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuSales: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
