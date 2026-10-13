import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SalesReportSummary, TopSellingItem } from '../../types';
import { reportService } from '../../services/reportService';
import { transactionService } from '../../services/transactionService';
import { exportService } from '../../services/exportService';
import { subscribeToSyncEvents } from '../../services/desktopSyncService';
import { Header } from '../../components/common/Header';
import { formatIDR, formatOnlyDate } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import {
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Award,
  Wallet,
  UtensilsCrossed,
  Bike,
  ShoppingBag,
  CreditCard,
  Banknote,
  Percent,
} from 'lucide-react-native';

type PeriodType = 'today' | 'month' | 'all' | 'custom';

export const ReportScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [period, setPeriod] = useState<PeriodType>('today');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatOnlyDate(d);
  });
  const [customEndDate, setCustomEndDate] = useState(formatOnlyDate(new Date()));
  const [summary, setSummary] = useState<SalesReportSummary | null>(null);
  const [topMenus, setTopMenus] = useState<TopSellingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [balances, setBalances] = useState<{
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  }>({
    saldoLaciKasir: 0,
    saldoManager: 0,
    saldoRekeningOwner: 0,
  });

  const getDateRange = (p: PeriodType): { startDate?: string; endDate?: string; label: string } => {
    const todayStr = formatOnlyDate(new Date());
    if (p === 'today') {
      return { startDate: todayStr, endDate: todayStr, label: `Hari Ini (${todayStr})` };
    }
    if (p === 'month') {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return {
        startDate: startOfMonth,
        endDate: todayStr,
        label: `Bulan Ini (${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`,
      };
    }
    if (p === 'custom') {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
        label: `${customStartDate} s/d ${customEndDate}`,
      };
    }
    return { label: 'Semua Waktu' };
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange(period);
      const [sum, top, b] = await Promise.all([
        reportService.getSalesReport(startDate, endDate),
        reportService.getTopSellingMenus(startDate, endDate, 'all', 8),
        reportService.getCurrentBalances(),
      ]);
      setSummary(sum);
      setTopMenus(top);
      setBalances({
        saldoLaciKasir: b.saldoLaciKasir,
        saldoManager: b.saldoManager,
        saldoRekeningOwner: b.saldoRekeningOwner,
      });
    } catch (e) {
      console.error('Failed to load report:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat data laporan.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [period, customStartDate, customEndDate])
  );

  useEffect(() => {
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'orders' || event === 'expenses' || event === 'stock') {
        console.log(`[ReportScreen] Live ${event} sync update, refreshing report...`);
        loadReport();
      }
    });
    return unsub;
  }, [period, customStartDate, customEndDate]);

  const applyCustomDate = () => {
    if (period === 'custom') {
      loadReport();
    } else {
      setPeriod('custom');
    }
  };

  const setPreset7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setCustomStartDate(formatOnlyDate(start));
    setCustomEndDate(formatOnlyDate(end));
    setPeriod('custom');
  };

  const setPreset30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setCustomStartDate(formatOnlyDate(start));
    setCustomEndDate(formatOnlyDate(end));
    setPeriod('custom');
  };

  const handleExportPdf = async () => {
    if (!summary) return;
    try {
      setIsExporting(true);
      const { label } = getDateRange(period);
      await exportService.exportReportPdf(summary, topMenus, label);
      showToast({ type: 'success', title: 'Ekspor Berhasil', message: 'Laporan PDF berhasil dibuat dan siap dibagikan.' });
    } catch (e: any) {
      console.error('Export PDF error:', e);
      showToast({ type: 'error', title: 'Gagal Ekspor PDF', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!summary) return;
    try {
      setIsExporting(true);
      const { startDate, endDate, label } = getDateRange(period);
      const trxs = await transactionService.getTransactions({
        startDate,
        endDate,
        limit: 500,
      });
      await exportService.exportReportExcel(trxs, summary, label);
      showToast({ type: 'success', title: 'Ekspor Berhasil', message: 'Laporan Excel CSV berhasil dibuat dan siap dibagikan.' });
    } catch (e: any) {
      console.error('Export Excel error:', e);
      showToast({ type: 'error', title: 'Gagal Ekspor Excel', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsExporting(false);
    }
  };

  const totalOmset = summary?.totalOmset || 0;
  const avgPerTrx = summary && summary.totalTransaksi > 0 ? Math.round(totalOmset / summary.totalTransaksi) : 0;

  // Channels percentage helper
  const calcPct = (val: number) => {
    if (!totalOmset || totalOmset === 0) return 0;
    return Math.min(100, Math.round((val / totalOmset) * 100));
  };

  const totalPaymentOffline = (summary?.totalTunai || 0) + (summary?.totalQris || 0);
  const cashPct = totalPaymentOffline > 0 ? Math.round(((summary?.totalTunai || 0) / totalPaymentOffline) * 100) : 50;
  const qrisPct = totalPaymentOffline > 0 ? (100 - cashPct) : 50;

  return (
    <View style={styles.container}>
      <Header title="Laporan & Rekap" onBack={onBack} />

      {/* Segmented Period Tabs */}
      <View style={styles.periodBar}>
        <View style={styles.segmentedContainer}>
          {(['today', 'month', 'all', 'custom'] as const).map((p) => {
            const isActive = period === p;
            const label = p === 'today' ? 'Hari Ini' : p === 'month' ? 'Bulan Ini' : p === 'all' ? 'Semua' : 'Kustom';
            return (
              <TouchableOpacity
                key={`p-${p}`}
                style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                onPress={() => setPeriod(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentBtnText, isActive && styles.segmentBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Date Range Sub-Bar */}
        {period === 'custom' && (
          <View style={styles.customDateContainer}>
            <View style={styles.customDateInputsRow}>
              <View style={styles.dateInputCol}>
                <Text style={styles.dateInputLabel}>Dari:</Text>
                <TextInput
                  style={styles.dateTextInput}
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.dateInputCol}>
                <Text style={styles.dateInputLabel}>Sampai:</Text>
                <TextInput
                  style={styles.dateTextInput}
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <TouchableOpacity
                style={styles.applyDateBtn}
                onPress={applyCustomDate}
                activeOpacity={0.8}
              >
                <Text style={styles.applyDateBtnText}>Terapkan</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Presets for Custom */}
            <View style={styles.quickPresetRow}>
              <TouchableOpacity style={styles.presetChip} onPress={setPreset7Days}>
                <Text style={styles.presetChipText}>7 Hari Terakhir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={setPreset30Days}>
                <Text style={styles.presetChipText}>30 Hari Terakhir</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Main Report Body */}
      {loading || !summary ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Menyiapkan ringkasan laporan...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Posisi Kas Toko Saat Ini (3 Wallets) */}
          <View style={styles.walletSection}>
            <View style={styles.walletSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wallet size={15} color="#0F172A" />
                <Text style={styles.walletSectionTitle}>Posisi Saldo Kas Saat Ini</Text>
              </View>
              <Text style={styles.walletSectionSub}>3 Dompet Kas</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.balanceScrollContent}>
              <View style={[styles.balanceCard, styles.balanceCardCash]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <Banknote size={13} color="#D97706" />
                  </View>
                  <Text style={styles.balanceLabel}>Laci Kasir</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#B45309' }]} numberOfLines={1}>
                  {formatIDR(balances.saldoLaciKasir || 0)}
                </Text>
                <Text style={styles.balanceSub}>Fisik Kasir</Text>
              </View>

              <View style={[styles.balanceCard, styles.balanceCardManager]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <Wallet size={13} color="#16A34A" />
                  </View>
                  <Text style={styles.balanceLabel}>Saldo Manager</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#15803D' }]} numberOfLines={1}>
                  {formatIDR(balances.saldoManager || 0)}
                </Text>
                <Text style={styles.balanceSub}>Petty Cash</Text>
              </View>

              <View style={[styles.balanceCard, styles.balanceCardOwner]}>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIconBox, { backgroundColor: '#DBEAFE' }]}>
                    <CreditCard size={13} color="#2563EB" />
                  </View>
                  <Text style={styles.balanceLabel}>Rekening Owner</Text>
                </View>
                <Text style={[styles.balanceValue, { color: '#1D4ED8' }]} numberOfLines={1}>
                  {formatIDR(balances.saldoRekeningOwner || 0)}
                </Text>
                <Text style={styles.balanceSub}>QRIS & Online</Text>
              </View>
            </ScrollView>
          </View>

          {/* Sleek Hero Omset Card */}
          <View style={styles.heroOmsetCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>Total Omset Kotor</Text>
              <View style={styles.trxBadge}>
                <Text style={styles.trxBadgeText}>{summary.totalTransaksi} Transaksi</Text>
              </View>
            </View>

            <Text style={styles.heroOmsetValue}>{formatIDR(summary.totalOmset)}</Text>

            {/* If online commission exists, show commission and net resto */}
            {summary.totalKomisiOnline !== undefined && summary.totalKomisiOnline > 0 && (
              <View style={styles.heroCommissionBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={styles.heroCommLabel}>Potongan Komisi Ojol:</Text>
                  <Text style={styles.heroCommValue}>- {formatIDR(summary.totalKomisiOnline)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.heroNetLabel}>Omset Bersih Resto (Net):</Text>
                  <Text style={styles.heroNetValue}>
                    {formatIDR(summary.totalOmsetNet ?? (summary.totalOmset - summary.totalKomisiOnline))}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.heroFooterRow}>
              <Text style={styles.heroSubText}>
                Rata-rata: <Text style={{ color: '#FCD34D', fontWeight: '800' }}>{formatIDR(avgPerTrx)}</Text> / transaksi
              </Text>
            </View>
          </View>

          {/* Financial Overview Grid */}
          <View style={styles.finGrid}>
            <View style={[styles.finCard, styles.finCardProfit]}>
              <Text style={styles.finCardLabel}>Estimasi Laba Bersih</Text>
              <Text style={styles.finCardProfitVal}>{formatIDR(summary.estimasiLabaBersih)}</Text>
              <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>Omset - Beban</Text>
            </View>

            <View style={[styles.finCard, styles.finCardExpense]}>
              <Text style={styles.finCardLabel}>Total Pengeluaran</Text>
              <Text style={styles.finCardExpenseVal}>{formatIDR(summary.totalPengeluaran)}</Text>
              <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>Operasional & Kas</Text>
            </View>
          </View>

          {/* HPP & Gross Margin Grid */}
          <View style={[styles.finGrid, { marginTop: 10 }]}>
            <View style={[styles.finCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Text style={[styles.finCardLabel, { color: '#1E40AF' }]}>Total HPP Bahan</Text>
              <Text style={[styles.finCardProfitVal, { color: '#1D4ED8' }]}>{formatIDR(summary.totalHpp || 0)}</Text>
              <Text style={{ fontSize: 10, color: '#3B82F6', marginTop: 2, fontWeight: '700' }}>
                Food Cost: {(summary.foodCostPercentage || 0).toFixed(1)}%
              </Text>
            </View>

            <View style={[styles.finCard, { backgroundColor: '#FDF4FF', borderColor: '#F0ABFC' }]}>
              <Text style={[styles.finCardLabel, { color: '#86198F' }]}>Laba Kotor (Gross)</Text>
              <Text style={[styles.finCardProfitVal, { color: '#A21CAF' }]}>
                {formatIDR(summary.labaKotor !== undefined ? summary.labaKotor : (summary.totalOmset - (summary.totalHpp || 0)))}
              </Text>
              <Text style={{ fontSize: 10, color: '#A21CAF', marginTop: 2 }}>Omset - HPP Resep</Text>
            </View>
          </View>

          {/* Channel Breakdown with Visual Bars */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Penjualan Per Channel</Text>

            <View style={styles.channelList}>
              {[
                { label: 'Kasir (Dine In)', val: summary.omsetOffline, icon: UtensilsCrossed, color: '#D97706' },
                { label: 'GoFood', val: summary.omsetGoFood, icon: Bike, color: '#059669' },
                { label: 'ShopeeFood', val: summary.omsetShopeeFood, icon: ShoppingBag, color: '#EA580C' },
                { label: 'GrabFood', val: summary.omsetGrabFood, icon: Bike, color: '#16A34A' },
              ].map((ch, idx) => {
                const pct = calcPct(ch.val);
                const IconComp = ch.icon;
                return (
                  <View key={`ch-row-${idx}`} style={styles.channelItem}>
                    <View style={styles.channelItemHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <IconComp size={14} color={ch.color} />
                        <Text style={styles.channelName}>{ch.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.channelVal}>{formatIDR(ch.val)}</Text>
                        <Text style={styles.channelPct}>({pct}%)</Text>
                      </View>
                    </View>

                    {/* Progress meter bar */}
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.max(pct, ch.val > 0 ? 3 : 0)}%`, backgroundColor: ch.color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Online Commission Notice */}
            {summary.totalKomisiOnline !== undefined && summary.totalKomisiOnline > 0 && (
              <View style={styles.onlineCommissionNotice}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.onlineCommLabel}>Total Komisi Platform Ojol:</Text>
                  <Text style={styles.onlineCommValue}>- {formatIDR(summary.totalKomisiOnline)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={styles.onlineNetLabel}>Omset Bersih Masuk Rekening:</Text>
                  <Text style={styles.onlineNetValue}>
                    {formatIDR(summary.omsetOnlineNet ?? (summary.omsetGoFood + summary.omsetShopeeFood + summary.omsetGrabFood - summary.totalKomisiOnline))}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Payment Method Distribution */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Metode Pembayaran Kasir (Tunai vs QRIS)</Text>

            {/* Visual Split Bar */}
            <View style={styles.splitBarContainer}>
              <View
                style={[
                  styles.splitBarLeft,
                  { width: `${totalPaymentOffline > 0 ? cashPct : 50}%` },
                ]}
              />
              <View
                style={[
                  styles.splitBarRight,
                  { width: `${totalPaymentOffline > 0 ? qrisPct : 50}%` },
                ]}
              />
            </View>

            <View style={styles.paymentLegendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#D97706' }]} />
                <View>
                  <Text style={styles.legendLabel}>Tunai ({cashPct}%)</Text>
                  <Text style={styles.legendVal}>{formatIDR(summary.totalTunai)}</Text>
                </View>
              </View>

              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                <View>
                  <Text style={styles.legendLabel}>QRIS ({qrisPct}%)</Text>
                  <Text style={styles.legendVal}>{formatIDR(summary.totalQris)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Top Selling Menus Leaderboard */}
          <View style={styles.sectionCard}>
            <View style={styles.topMenuTitleRow}>
              <Award size={16} color="#D97706" />
              <Text style={styles.sectionTitle}>Menu Terlaris</Text>
            </View>

            {topMenus.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada penjualan pada periode ini</Text>
            ) : (
              topMenus.map((item, idx) => {
                const isTop1 = idx === 0;
                const isTop2 = idx === 1;
                const isTop3 = idx === 2;

                return (
                  <View key={`top-${item.menu_item_id}`} style={styles.topMenuItem}>
                    {/* Rank Badge */}
                    <View
                      style={[
                        styles.rankBadge,
                        isTop1
                          ? styles.rankBadge1
                          : isTop2
                          ? styles.rankBadge2
                          : isTop3
                          ? styles.rankBadge3
                          : styles.rankBadgeNormal,
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankText,
                          isTop1
                            ? styles.rankText1
                            : isTop2
                            ? styles.rankText2
                            : isTop3
                            ? styles.rankText3
                            : styles.rankTextNormal,
                        ]}
                      >
                        #{idx + 1}
                      </Text>
                    </View>

                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={styles.topMenuName}>{item.menu_name}</Text>
                      <Text style={styles.topMenuCat}>{item.category_name}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.topMenuQty}>{item.total_qty} terjual</Text>
                      <Text style={styles.topMenuSales}>{formatIDR(item.total_sales)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Export Action Card */}
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>Ekspor Laporan</Text>
            <View style={styles.exportBtnRow}>
              <TouchableOpacity
                style={styles.pdfBtn}
                onPress={handleExportPdf}
                disabled={isExporting}
                activeOpacity={0.8}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <FileText size={16} color="#FFFFFF" />
                    <Text style={styles.exportBtnText}>PDF</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.excelBtn}
                onPress={handleExportExcel}
                disabled={isExporting}
                activeOpacity={0.8}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <FileSpreadsheet size={16} color="#FFFFFF" />
                    <Text style={styles.exportBtnText}>Excel</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 30 }} />
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
  periodBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
  scrollContent: {
    padding: 14,
    gap: 12,
  },

  // Hero Card
  heroOmsetCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  trxBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trxBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  heroOmsetValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 6,
    marginBottom: 4,
  },
  heroFooterRow: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  heroSubText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // Fin Grid
  finGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  finCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  finCardProfit: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  finCardExpense: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  finCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  finCardProfitVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#15803D',
    marginTop: 3,
  },
  finCardExpenseVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 3,
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  channelList: {
    gap: 10,
  },
  channelItem: {
    gap: 4,
  },
  channelItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  channelVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  channelPct: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Split Bar
  splitBarContainer: {
    height: 8,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  splitBarLeft: {
    backgroundColor: '#D97706',
  },
  splitBarRight: {
    backgroundColor: '#2563EB',
  },
  paymentLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  legendVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },

  // Top Menus
  topMenuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  topMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 10,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge1: {
    backgroundColor: '#FEF3C7',
  },
  rankBadge2: {
    backgroundColor: '#F1F5F9',
  },
  rankBadge3: {
    backgroundColor: '#FFEDD5',
  },
  rankBadgeNormal: {
    backgroundColor: '#F8FAFC',
  },
  rankText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rankText1: {
    color: '#B45309',
  },
  rankText2: {
    color: '#475569',
  },
  rankText3: {
    color: '#C2410C',
  },
  rankTextNormal: {
    color: '#94A3B8',
  },
  topMenuName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  topMenuCat: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  topMenuQty: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  topMenuSales: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  emptyText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 4,
  },

  // Export
  exportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  exportTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  exportBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    borderRadius: 12,
  },
  excelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: 12,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  // Custom Date Range
  customDateContainer: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  customDateInputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
  },
  dateTextInput: {
    height: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  applyDateBtn: {
    height: 36,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyDateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
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
    marginBottom: 8,
  },
  walletSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletSectionSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  balanceScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  balanceCard: {
    width: 130,
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
    fontSize: 14,
    fontWeight: '900',
  },
  balanceSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },

  // Hero Commission Box
  heroCommissionBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroCommLabel: {
    fontSize: 10.5,
    color: '#FCA5A5',
    fontWeight: '600',
  },
  heroCommValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F87171',
  },
  heroNetLabel: {
    fontSize: 10.5,
    color: '#86EFAC',
    fontWeight: '700',
  },
  heroNetValue: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#4ADE80',
  },

  // Online Commission Notice
  onlineCommissionNotice: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  onlineCommLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C2410C',
  },
  onlineCommValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  onlineNetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  onlineNetValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#15803D',
  },
});
