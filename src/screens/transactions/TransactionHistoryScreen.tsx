import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  RefreshControl,
  FlatList,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Transaction, OrderChannel, TransactionStatus } from '../../types';
import { transactionService } from '../../services/transactionService';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { useAuthStore } from '../../stores/authStore';
import { Header } from '../../components/common/Header';
import { ReceiptSuccessModal } from '../../components/pos/ReceiptSuccessModal';
import { showToast } from '../../stores/toastStore';
import {
  formatIDR,
  formatDateIndo,
  formatTransactionNo,
  getChannelLabel,
  getChannelColor,
  getPaymentMethodLabel,
  formatOnlyDate,
} from '../../utils/formatters';
import {
  Receipt,
  Search,
  AlertOctagon,
  Share2,
  Calendar,
  X,
  Clock,
  User,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  Banknote,
  CreditCard,
  Printer,
  CheckCircle2,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react-native';

interface TransactionCardItemProps {
  trx: Transaction;
  onPress: (trx: Transaction) => void;
}

const TransactionCardItem = React.memo<TransactionCardItemProps>(
  ({ trx, onPress }) => {
    const channelColor = getChannelColor(trx.channel);
    const isVoid = trx.status === 'void';
    const itemCount = trx.items?.reduce((acc, curr) => acc + (curr.qty || 1), 0) || 0;
    const onlineMatch = trx.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
    const onlineOrderCode = onlineMatch ? onlineMatch[1].trim() : null;

    return (
      <TouchableOpacity
        style={[styles.trxCard, isVoid && styles.trxCardVoid]}
        onPress={() => onPress(trx)}
        activeOpacity={0.75}
      >
        {/* Row 1: Struk ID & Badges */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.trxIdContainer}>
            <View style={styles.receiptIconPill}>
              <Receipt size={12} color="#D97706" />
            </View>
            <Text style={styles.trxIdText}>
              {formatTransactionNo(trx.id, trx.tanggal)}
            </Text>
          </View>

          <View style={styles.badgesContainer}>
            {onlineOrderCode && (
              <View style={styles.onlineOrderBadge}>
                <Sparkles size={10} color="#92400E" />
                <Text style={styles.onlineOrderText}>No: {onlineOrderCode}</Text>
              </View>
            )}
            <View style={[styles.channelBadge, { backgroundColor: channelColor.bg }]}>
              <Text style={[styles.channelBadgeText, { color: channelColor.text }]}>
                {getChannelLabel(trx.channel)}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                isVoid ? styles.statusVoidBadge : styles.statusSuccessBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isVoid ? styles.statusVoidText : styles.statusSuccessText,
                ]}
              >
                {isVoid ? 'VOID' : 'SELESAI'}
              </Text>
            </View>
          </View>
        </View>

        {/* Row 2: Date & Time */}
        <View style={styles.cardTimeRow}>
          <Clock size={11} color="#94A3B8" />
          <Text style={styles.cardTimeText}>{formatDateIndo(trx.tanggal)}</Text>
        </View>

        {/* Row 3: Items preview snippet */}
        <View style={styles.itemsSummary}>
          <View style={styles.itemsSummaryHeader}>
            <Text style={styles.itemsCountBadge}>
              {itemCount > 0 ? `${itemCount} Item` : 'Item'}
            </Text>
            <Text style={styles.itemSummaryText} numberOfLines={1}>
              {trx.items?.map((i) => `${i.qty}x ${i.menu_name}`).join(' • ') || 'Pesanan'}
            </Text>
          </View>
        </View>

        {/* Row 4: Footer (Kasir, Metode Bayar & Total Amount) */}
        <View style={styles.cardFooterRow}>
          <View style={styles.kasirInfoCol}>
            <View style={styles.kasirRow}>
              <User size={12} color="#64748B" />
              <Text style={styles.kasirNameText} numberOfLines={1}>
                {trx.kasir_name || 'Kasir'}
              </Text>
            </View>

            <View
              style={[
                styles.paymentBadge,
                trx.metode_bayar === 'qris'
                  ? styles.paymentBadgeQris
                  : styles.paymentBadgeCash,
              ]}
            >
              {trx.metode_bayar === 'qris' ? (
                <CreditCard size={10} color="#4338CA" />
              ) : (
                <Banknote size={10} color="#15803D" />
              )}
              <Text
                style={[
                  styles.paymentBadgeText,
                  trx.metode_bayar === 'qris'
                    ? styles.paymentBadgeTextQris
                    : styles.paymentBadgeTextCash,
                ]}
              >
                {getPaymentMethodLabel(trx.metode_bayar)}
              </Text>
            </View>

            {(() => {
              const isOwner = trx.sumber_dana === 'rekening_owner' || trx.channel !== 'offline' || trx.metode_bayar === 'qris';
              const isMobile = !isOwner && (trx.sumber_dana === 'laci_kasir_mobile' || trx.source?.toLowerCase().includes('mobile') || !trx.desktop_order_id);
              const label = isOwner ? 'Rek. Owner' : isMobile ? 'Laci Kasir (HP)' : 'Laci Kasir (PC)';
              const bg = isOwner ? '#EFF6FF' : isMobile ? '#FFF7ED' : '#F1F5F9';
              const border = isOwner ? '#BFDBFE' : isMobile ? '#FED7AA' : '#CBD5E1';
              const color = isOwner ? '#1D4ED8' : isMobile ? '#C2410C' : '#334155';

              return (
                <View style={[styles.paymentBadge, { backgroundColor: bg, borderColor: border }]}>
                  <Text style={[styles.paymentBadgeText, { color }]}>
                    {label}
                  </Text>
                </View>
              );
            })()}
          </View>

          <View style={styles.totalPriceCol}>
            <Text style={[styles.trxTotalText, isVoid && styles.trxTotalTextVoid]}>
              {formatIDR(trx.total)}
            </Text>
            <ChevronRight size={14} color="#94A3B8" />
          </View>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    return (
      prev.trx.id === next.trx.id &&
      prev.trx.status === next.trx.status &&
      prev.trx.total === next.trx.total &&
      prev.trx.tanggal === next.trx.tanggal
    );
  }
);

export const TransactionHistoryScreen: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<OrderChannel | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'selesai' | 'void'>('all');
  const [dateMode, setDateMode] = useState<'all' | 'today' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatOnlyDate(d);
  });
  const [customEndDate, setCustomEndDate] = useState(formatOnlyDate(new Date()));

  // Modals
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedTrx, setSelectedTrx] = useState<Transaction | null>(null);

  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { currentUser } = useAuthStore();

  // Active filter badge count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedChannel !== 'all') count++;
    if (selectedStatus !== 'all') count++;
    if (dateMode !== 'today' && dateMode !== 'all') count++;
    return count;
  }, [selectedChannel, selectedStatus, dateMode]);

  const resetAllFilters = () => {
    setSelectedChannel('all');
    setSelectedStatus('all');
    setDateMode('today');
    setFilterModalVisible(false);
  };

  const loadTransactions = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const todayStr = formatOnlyDate(new Date());
      const sDate = dateMode === 'today' ? todayStr : dateMode === 'custom' ? customStartDate : undefined;
      const eDate = dateMode === 'today' ? todayStr : dateMode === 'custom' ? customEndDate : undefined;

      const list = await transactionService.getTransactions({
        startDate: sDate,
        endDate: eDate,
        channel: selectedChannel,
        status: selectedStatus,
        limit: 100,
      });
      setTransactions(list);
    } catch (e) {
      console.error('Failed to load transactions:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat riwayat transaksi.' });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await desktopSyncService.syncOrdersFromDesktop().catch(() => {});
    await loadTransactions(false);
    setRefreshing(false);
  };

  // Auto-refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadTransactions(false);
      desktopSyncService.syncOrdersFromDesktop().then(() => loadTransactions(false)).catch(() => {});
    }, [selectedChannel, selectedStatus, dateMode, customStartDate, customEndDate])
  );

  // Live auto-refresh when order events are received from Desktop
  useEffect(() => {
    loadTransactions(true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'orders') {
        console.log('[TransactionHistory] Live orders update received, refreshing list...');
        loadTransactions(false);
      }
    });
    return unsub;
  }, [selectedChannel, selectedStatus, dateMode, customStartDate, customEndDate]);

  // Client-side search filtering
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter((t) => {
      const formattedNo = formatTransactionNo(t.id, t.tanggal).toLowerCase();
      const matchId =
        String(t.id).includes(q) ||
        `#${t.id}`.includes(q) ||
        formattedNo.includes(q) ||
        (t.uuid && t.uuid.toLowerCase().includes(q)) ||
        (t.desktop_order_id && t.desktop_order_id.toLowerCase().includes(q));
      const matchKasir = t.kasir_name && t.kasir_name.toLowerCase().includes(q);
      const matchItems = t.items?.some((item) =>
        item.menu_name?.toLowerCase().includes(q)
      );
      return matchId || matchKasir || matchItems;
    });
  }, [transactions, searchQuery]);

  // Statistics calculation for the quick summary card
  const stats = useMemo(() => {
    let omset = 0;
    let suksesCount = 0;
    let voidCount = 0;
    for (const t of filteredTransactions) {
      if (t.status === 'selesai') {
        omset += t.total || 0;
        suksesCount++;
      } else if (t.status === 'void') {
        voidCount++;
      }
    }
    return {
      omset,
      suksesCount,
      voidCount,
      totalCount: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const handleOpenDetail = useCallback((trx: Transaction) => {
    setSelectedTrx(trx);
    setDetailModalVisible(true);
  }, []);

  const handleOpenVoid = (trx: Transaction) => {
    setSelectedTrx(trx);
    setVoidReason('');
    setVoidModalVisible(true);
  };

  const handleConfirmVoid = async () => {
    if (!selectedTrx || !currentUser) return;
    if (!voidReason.trim()) {
      showToast({ type: 'warning', title: 'Alasan Wajib', message: 'Masukkan alasan pembatalan transaksi.' });
      return;
    }

    try {
      setIsVoiding(true);
      const cleanReason = voidReason.trim();
      await transactionService.voidTransaction(selectedTrx.id, cleanReason, currentUser.id);

      // Push VOID to Desktop Kasir
      desktopSyncService.pushVoidOrderToDesktop({
        orderId: selectedTrx.id,
        uuid: selectedTrx.uuid,
        localTransactionId: selectedTrx.id,
        desktopOrderId: selectedTrx.desktop_order_id,
        alasan: cleanReason,
        actorName: currentUser.nama || 'Kasir',
      }).catch((e) => console.warn('[Void] Push void to desktop warning:', e));

      showToast({
        type: 'info',
        title: 'Transaksi Dibatalkan',
        message: `Transaksi ${formatTransactionNo(selectedTrx.id, selectedTrx.tanggal)} berhasil dibatalkan (VOID).`,
      });
      setVoidModalVisible(false);
      setDetailModalVisible(false);
      loadTransactions();
    } catch (e: any) {
      console.error('Void error:', e);
      showToast({ type: 'error', title: 'Gagal Void', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsVoiding(false);
    }
  };

  const setDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = formatOnlyDate(today);

    if (preset === 'today') {
      setDateMode('today');
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = formatOnlyDate(y);
      setCustomStartDate(yStr);
      setCustomEndDate(yStr);
      setDateMode('custom');
    } else if (preset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 6);
      setCustomStartDate(formatOnlyDate(w));
      setCustomEndDate(todayStr);
      setDateMode('custom');
    } else if (preset === 'month') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      setCustomStartDate(formatOnlyDate(m));
      setCustomEndDate(todayStr);
      setDateMode('custom');
    } else if (preset === 'all') {
      setDateMode('all');
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Riwayat Transaksi" subtitle="Daftar penjualan kasir & struk" />

      {/* Modern KPI Summary Card */}
      <View style={styles.summarySection}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryColLeft}>
            <View style={styles.summaryHeaderRow}>
              <View style={styles.summaryIconBox}>
                <TrendingUp size={14} color="#D97706" />
              </View>
              <Text style={styles.summaryLabel}>
                {dateMode === 'today' ? 'Omset Hari Ini' : 'Total Omset'}
              </Text>
            </View>
            <Text style={styles.summaryValue}>{formatIDR(stats.omset)}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryColRight}>
            <View style={styles.summaryHeaderRow}>
              <View style={[styles.summaryIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Receipt size={14} color="#16A34A" />
              </View>
              <Text style={styles.summaryLabel}>Transaksi</Text>
            </View>
            <View style={styles.summaryCountRow}>
              <Text style={styles.summaryCountValue}>{stats.suksesCount}</Text>
              <Text style={styles.summaryCountSub}> Sukses</Text>
              {stats.voidCount > 0 && (
                <View style={styles.voidBadgeMini}>
                  <Text style={styles.voidBadgeMiniText}>{stats.voidCount} Void</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Streamlined Filter & Search Section */}
      <View style={styles.filterSection}>
        {/* Row 1: Search Bar & Filter Button */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Search size={15} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari no. struk, menu, kasir..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={14} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.7}
          >
            <SlidersHorizontal size={15} color={activeFilterCount > 0 ? '#FFFFFF' : '#475569'} />
            <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
              Filter
            </Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Row 2: Single-line Quick Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFilterScroll}
        >
          {/* Hari Ini */}
          <TouchableOpacity
            style={[
              styles.quickChip,
              dateMode === 'today' && selectedChannel === 'all' && selectedStatus === 'all' && styles.quickChipActive,
            ]}
            onPress={() => {
              setDateMode('today');
              setSelectedChannel('all');
              setSelectedStatus('all');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                dateMode === 'today' && selectedChannel === 'all' && selectedStatus === 'all' && styles.quickChipTextActive,
              ]}
            >
              Hari Ini
            </Text>
          </TouchableOpacity>

          {/* Semua */}
          <TouchableOpacity
            style={[
              styles.quickChip,
              dateMode === 'all' && selectedChannel === 'all' && selectedStatus === 'all' && styles.quickChipActive,
            ]}
            onPress={() => {
              setDateMode('all');
              setSelectedChannel('all');
              setSelectedStatus('all');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                dateMode === 'all' && selectedChannel === 'all' && selectedStatus === 'all' && styles.quickChipTextActive,
              ]}
            >
              Semua
            </Text>
          </TouchableOpacity>

          {/* Channels: Kasir, GoFood, ShopeeFood, GrabFood */}
          {(['offline', 'gofood', 'shopeefood', 'grabfood'] as const).map((ch) => {
            const isChActive = selectedChannel === ch;
            const label = getChannelLabel(ch);
            return (
              <TouchableOpacity
                key={`quick-ch-${ch}`}
                style={[styles.quickChip, isChActive && styles.quickChipActive]}
                onPress={() => setSelectedChannel(isChActive ? 'all' : ch)}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickChipText, isChActive && styles.quickChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Void Filter Chip */}
          <TouchableOpacity
            style={[styles.quickChip, selectedStatus === 'void' && styles.quickChipVoidActive]}
            onPress={() => {
              setSelectedStatus(selectedStatus === 'void' ? 'all' : 'void');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                selectedStatus === 'void' && styles.quickChipVoidTextActive,
              ]}
            >
              Void
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Transaction Cards List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Memuat riwayat transaksi...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => `trx-${item.id}`}
          renderItem={({ item }) => (
            <TransactionCardItem trx={item} onPress={handleOpenDetail} />
          )}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Receipt size={36} color="#D97706" />
              </View>
              <Text style={styles.emptyTitle}>Belum Ada Transaksi</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `Tidak ada transaksi yang sesuai dengan "${searchQuery}"`
                  : activeFilterCount > 0
                  ? 'Tidak ada transaksi pada filter yang dipilih'
                  : 'Transaksi baru dari kasir POS akan otomatis tercatat dan tampil di sini.'}
              </Text>
              {(searchQuery || activeFilterCount > 0) && (
                <TouchableOpacity
                  style={styles.resetFilterEmptyBtn}
                  onPress={() => {
                    setSearchQuery('');
                    resetAllFilters();
                  }}
                  activeOpacity={0.7}
                >
                  <RefreshCw size={13} color="#D97706" />
                  <Text style={styles.resetFilterEmptyText}>Reset Filter & Pencarian</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}

      {/* Transaction Detail Modal (Ticket style) */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            {/* Ticket Header */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailShopName}>Lette Roti Bakar</Text>
                <Text style={styles.detailTitle}>
                  {selectedTrx ? formatTransactionNo(selectedTrx.id, selectedTrx.tanggal) : 'Rincian Transaksi'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} color="#64748B" />
                    <Text style={styles.detailTime}>
                      {selectedTrx ? formatDateIndo(selectedTrx.tanggal) : ''}
                    </Text>
                  </View>
                  {(() => {
                    const selOnlineMatch = selectedTrx?.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
                    const selCode = selOnlineMatch ? selOnlineMatch[1].trim() : null;
                    if (!selCode) return null;
                    return (
                      <View style={styles.detailOnlinePill}>
                        <Sparkles size={10} color="#92400E" />
                        <Text style={styles.detailOnlinePillText}>No: {selCode}</Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
              {/* Meta Grid Cards */}
              <View style={styles.detailInfoGrid}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Channel</Text>
                  <Text style={styles.infoVal}>
                    {selectedTrx ? getChannelLabel(selectedTrx.channel) : ''}
                  </Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Metode Bayar</Text>
                  <Text style={styles.infoVal}>
                    {selectedTrx ? getPaymentMethodLabel(selectedTrx.metode_bayar) : ''}
                  </Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Sumber Dana</Text>
                  {(() => {
                    const isOwner = selectedTrx?.sumber_dana === 'rekening_owner' || selectedTrx?.channel !== 'offline' || selectedTrx?.metode_bayar === 'qris';
                    const isMobile = !isOwner && (selectedTrx?.sumber_dana === 'laci_kasir_mobile' || selectedTrx?.source?.toLowerCase().includes('mobile') || !selectedTrx?.desktop_order_id);
                    const label = isOwner ? 'Rek. Owner' : isMobile ? 'Laci Kasir (HP)' : 'Laci Kasir (PC)';
                    const color = isOwner ? '#1D4ED8' : isMobile ? '#C2410C' : '#334155';
                    return <Text style={[styles.infoVal, { color }]}>{label}</Text>;
                  })()}
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Kasir</Text>
                  <Text style={styles.infoVal}>{selectedTrx?.kasir_name || '-'}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text
                    style={[
                      styles.infoVal,
                      selectedTrx?.status === 'void' ? { color: '#DC2626' } : { color: '#16A34A' },
                    ]}
                  >
                    {selectedTrx?.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {selectedTrx?.catatan ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>Catatan: {selectedTrx.catatan}</Text>
                </View>
              ) : null}

              {/* Items List */}
              <Text style={styles.itemsTableTitle}>Item Pesanan</Text>
              <View style={styles.itemsTable}>
                {selectedTrx?.items?.map((item, idx) => (
                  <View key={`detail-item-${idx}`} style={styles.detailItemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.detailItemName}>{item.menu_name}</Text>
                      {item.variant_ids && item.variant_ids !== '[]' && item.variant_ids.trim() !== '' ? (
                        <Text style={styles.detailItemVariant}>+ {item.variant_ids}</Text>
                      ) : null}
                      <Text style={styles.detailItemQty}>
                        {item.qty} x {formatIDR(item.harga_satuan)}
                      </Text>
                    </View>
                    <Text style={styles.detailItemSubtotal}>{formatIDR(item.subtotal)}</Text>
                  </View>
                ))}
              </View>

              {/* Dashed Separator */}
              <View style={styles.dashedDivider} />

              {/* Subtotal & PPN breakdown if tax was applied */}
              {selectedTrx && typeof selectedTrx.tax_amount === 'number' && selectedTrx.tax_amount > 0 ? (
                <View style={styles.detailTaxContainer}>
                  <View style={styles.detailSubtotalRow}>
                    <Text style={styles.detailSubtotalLabel}>Subtotal</Text>
                    <Text style={styles.detailSubtotalVal}>
                      {formatIDR(selectedTrx.subtotal || (selectedTrx.total - selectedTrx.tax_amount))}
                    </Text>
                  </View>
                  <View style={styles.detailSubtotalRow}>
                    <Text style={styles.detailSubtotalLabel}>PPN ({selectedTrx.tax_percentage || 10}%)</Text>
                    <Text style={styles.detailSubtotalVal}>
                      {formatIDR(selectedTrx.tax_amount)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Bill Total */}
              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Total Tagihan</Text>
                <Text style={styles.detailTotalVal}>
                  {selectedTrx ? formatIDR(selectedTrx.total) : ''}
                </Text>
              </View>

              {selectedTrx?.metode_bayar === 'tunai' && selectedTrx.uang_diterima !== undefined && (
                <View style={styles.cashSummaryBox}>
                  <View style={styles.cashSummaryRow}>
                    <Text style={styles.cashSubLabel}>Tunai Diterima:</Text>
                    <Text style={styles.cashSubValue}>{formatIDR(selectedTrx.uang_diterima)}</Text>
                  </View>
                  <View style={styles.cashSummaryRow}>
                    <Text style={styles.cashSubLabelGreen}>Kembalian:</Text>
                    <Text style={styles.cashSubValueGreen}>{formatIDR(selectedTrx.kembalian ?? 0)}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Actions: Share/Print & Void */}
            <View style={styles.detailFooter}>
              <TouchableOpacity
                style={styles.shareStrukBtn}
                onPress={() => {
                  setDetailModalVisible(false);
                  setReceiptModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Printer size={15} color="#FFFFFF" />
                <Text style={styles.shareStrukBtnText}>Cetak / Bagikan Struk</Text>
              </TouchableOpacity>

              {selectedTrx?.status !== 'void' && (
                <TouchableOpacity
                  style={styles.voidBtn}
                  onPress={() => {
                    setDetailModalVisible(false);
                    handleOpenVoid(selectedTrx!);
                  }}
                  activeOpacity={0.8}
                >
                  <AlertOctagon size={15} color="#DC2626" />
                  <Text style={styles.voidBtnText}>Void</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Clean Void Modal */}
      <Modal visible={voidModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.voidModal}>
            <View style={styles.voidIconBox}>
              <AlertOctagon size={28} color="#DC2626" />
            </View>
            <Text style={styles.voidTitle}>Batalkan Transaksi (VOID)</Text>
            <Text style={styles.voidSubtitle}>
              Transaksi {selectedTrx ? formatTransactionNo(selectedTrx.id, selectedTrx.tanggal) : ''} sebesar{' '}
              <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                {selectedTrx ? formatIDR(selectedTrx.total) : ''}
              </Text>{' '}
              akan dibatalkan dan stok bahan terkait akan dikembalikan ke sistem.
            </Text>

            <View style={styles.voidForm}>
              <Text style={styles.voidReasonLabel}>Alasan Pembatalan (Wajib)</Text>
              <TextInput
                style={styles.voidReasonInput}
                placeholder="Contoh: Pembeli membatalkan pesanan / salah input"
                placeholderTextColor="#94A3B8"
                value={voidReason}
                onChangeText={setVoidReason}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.voidActions}>
              <TouchableOpacity
                style={styles.voidCancelBtn}
                onPress={() => setVoidModalVisible(false)}
                disabled={isVoiding}
              >
                <Text style={styles.voidCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.voidConfirmBtn,
                  !voidReason.trim() && styles.voidConfirmBtnDisabled,
                ]}
                onPress={handleConfirmVoid}
                disabled={!voidReason.trim() || isVoiding}
              >
                {isVoiding ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.voidConfirmText}>Batalkan Transaksi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comprehensive Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalCard}>
            <View style={styles.filterModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={18} color="#D97706" />
                <Text style={styles.filterModalTitle}>Filter Transaksi</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalBody} showsVerticalScrollIndicator={false}>
              {/* Periode Tanggal */}
              <Text style={styles.filterSectionTitle}>Periode Transaksi</Text>
              <View style={styles.filterChipRow}>
                <TouchableOpacity
                  style={[styles.modalChip, dateMode === 'today' && styles.modalChipActive]}
                  onPress={() => setDatePreset('today')}
                >
                  <Text style={[styles.modalChipText, dateMode === 'today' && styles.modalChipTextActive]}>
                    Hari Ini
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalChip, dateMode === 'custom' && customStartDate === customEndDate && customStartDate !== formatOnlyDate(new Date()) && styles.modalChipActive]}
                  onPress={() => setDatePreset('yesterday')}
                >
                  <Text style={[styles.modalChipText, dateMode === 'custom' && customStartDate === customEndDate && customStartDate !== formatOnlyDate(new Date()) && styles.modalChipTextActive]}>
                    Kemarin
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalChip, dateMode === 'custom' && customStartDate !== customEndDate && styles.modalChipActive]}
                  onPress={() => setDatePreset('week')}
                >
                  <Text style={[styles.modalChipText, dateMode === 'custom' && customStartDate !== customEndDate && styles.modalChipTextActive]}>
                    7 Hari Terakhir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalChip, dateMode === 'all' && styles.modalChipActive]}
                  onPress={() => setDatePreset('all')}
                >
                  <Text style={[styles.modalChipText, dateMode === 'all' && styles.modalChipTextActive]}>
                    Semua Tanggal
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Kustom Rentang Tanggal Manual */}
              <View style={styles.customDateBox}>
                <View style={styles.dateInputCol}>
                  <Text style={styles.dateInputLabel}>Dari (YYYY-MM-DD):</Text>
                  <TextInput
                    style={styles.dateTextInput}
                    value={customStartDate}
                    onChangeText={(val) => {
                      setCustomStartDate(val);
                      setDateMode('custom');
                    }}
                    placeholder="2026-09-01"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.dateInputCol}>
                  <Text style={styles.dateInputLabel}>Sampai (YYYY-MM-DD):</Text>
                  <TextInput
                    style={styles.dateTextInput}
                    value={customEndDate}
                    onChangeText={(val) => {
                      setCustomEndDate(val);
                      setDateMode('custom');
                    }}
                    placeholder="2026-09-10"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Channel Penjualan */}
              <Text style={[styles.filterSectionTitle, { marginTop: 18 }]}>Channel Penjualan</Text>
              <View style={styles.filterChipRow}>
                {(['all', 'offline', 'gofood', 'shopeefood', 'grabfood'] as const).map((ch) => {
                  const isActive = selectedChannel === ch;
                  const label = ch === 'all' ? 'Semua Channel' : getChannelLabel(ch);
                  return (
                    <TouchableOpacity
                      key={`modal-ch-${ch}`}
                      style={[styles.modalChip, isActive && styles.modalChipActive]}
                      onPress={() => setSelectedChannel(ch)}
                    >
                      <Text style={[styles.modalChipText, isActive && styles.modalChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Status Pesanan */}
              <Text style={[styles.filterSectionTitle, { marginTop: 18 }]}>Status Pesanan</Text>
              <View style={styles.filterChipRow}>
                {(['all', 'selesai', 'void'] as const).map((st) => {
                  const isActive = selectedStatus === st;
                  const label = st === 'all' ? 'Semua Status' : st === 'selesai' ? 'Selesai' : 'Void';
                  return (
                    <TouchableOpacity
                      key={`modal-st-${st}`}
                      style={[styles.modalChip, isActive && styles.modalChipActive]}
                      onPress={() => setSelectedStatus(st)}
                    >
                      <Text style={[styles.modalChipText, isActive && styles.modalChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity style={styles.resetFilterBtn} onPress={resetAllFilters}>
                <Text style={styles.resetFilterText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyFilterBtn}
                onPress={() => {
                  setFilterModalVisible(false);
                  loadTransactions();
                }}
              >
                <Text style={styles.applyFilterText}>Terapkan Filter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <ReceiptSuccessModal
        visible={receiptModalVisible}
        transaction={selectedTrx}
        onNewOrder={() => setReceiptModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // KPI Summary Bar
  summarySection: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  summaryColLeft: {
    flex: 1.2,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#FDE68A',
    marginHorizontal: 12,
  },
  summaryColRight: {
    flex: 1,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  summaryIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B45309',
  },
  summaryCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  summaryCountValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#15803D',
  },
  summaryCountSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  voidBadgeMini: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  voidBadgeMiniText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },

  // Filter Section
  filterSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  filterBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  quickFilterScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  quickChipVoidActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  quickChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  quickChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  quickChipVoidTextActive: {
    color: '#DC2626',
    fontWeight: '800',
  },

  // Loading & Empty State
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
  listContainer: {
    padding: 12,
    gap: 10,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  resetFilterEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  resetFilterEmptyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },

  // Transaction Cards
  trxCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  trxCardVoid: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FECACA',
    opacity: 0.9,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trxIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptIconPill: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trxIdText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  onlineOrderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  onlineOrderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    fontFamily: 'monospace',
  },
  detailOnlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detailOnlinePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    fontFamily: 'monospace',
  },
  channelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusSuccessBadge: {
    backgroundColor: '#F0FDF4',
  },
  statusVoidBadge: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusSuccessText: {
    color: '#15803D',
  },
  statusVoidText: {
    color: '#DC2626',
  },
  cardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -4,
  },
  cardTimeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  itemsSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  itemsSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemsCountBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemSummaryText: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  kasirInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  kasirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kasirNameText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    maxWidth: 90,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  paymentBadgeCash: {
    backgroundColor: '#F0FDF4',
  },
  paymentBadgeQris: {
    backgroundColor: '#EEF2FF',
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  paymentBadgeTextCash: {
    color: '#15803D',
  },
  paymentBadgeTextQris: {
    color: '#4338CA',
  },
  totalPriceCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trxTotalText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#D97706',
  },
  trxTotalTextVoid: {
    color: '#DC2626',
    textDecorationLine: 'line-through',
  },

  // Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailShopName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  detailTime: {
    fontSize: 11,
    color: '#64748B',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  detailBody: {
    paddingVertical: 12,
  },
  detailInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoCol: {
    width: '47%',
  },
  infoLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  noteText: {
    fontSize: 11,
    color: '#B45309',
    fontStyle: 'italic',
  },
  itemsTableTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemsTable: {
    gap: 8,
    paddingBottom: 8,
  },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  detailItemVariant: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 1,
  },
  detailItemQty: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  detailItemSubtotal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  detailTaxContainer: {
    paddingBottom: 4,
  },
  detailSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailSubtotalLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  detailSubtotalVal: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailTotalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  detailTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#D97706',
  },
  cashSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cashSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashSubLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  cashSubValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  cashSubLabelGreen: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  cashSubValueGreen: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '800',
  },
  detailFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  shareStrukBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 11,
    borderRadius: 12,
  },
  shareStrukBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  voidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  voidBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },

  // Void Modal
  voidModal: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
  },
  voidIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  voidTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  voidSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  voidForm: {
    width: '100%',
    marginBottom: 14,
  },
  voidReasonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  voidReasonInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    height: 70,
  },
  voidActions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  voidCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  voidCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  voidConfirmBtn: {
    flex: 1.6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  voidConfirmBtnDisabled: {
    backgroundColor: '#FCA5A5',
  },
  voidConfirmText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Comprehensive Filter Modal
  filterModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterModalBody: {
    paddingVertical: 14,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  modalChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  modalChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  customDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 8,
    marginTop: 10,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  dateTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '600',
  },
  filterModalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  resetFilterBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  resetFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  applyFilterBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  applyFilterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
