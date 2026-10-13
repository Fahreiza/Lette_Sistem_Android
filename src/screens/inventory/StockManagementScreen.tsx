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
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ingredient, StockMovement } from '../../types';
import { stockService } from '../../services/stockService';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { useAuthStore } from '../../stores/authStore';
import { Header } from '../../components/common/Header';
import { BatchRestockModal } from '../../components/stock/BatchRestockModal';
import { formatIDR, formatDateIndo, formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import {
  Package,
  AlertTriangle,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  Sliders,
  History,
  ShoppingCart,
  X,
  CheckCircle2,
  Search,
  RefreshCw,
  TrendingDown,
  Layers,
  Sparkles,
  UploadCloud,
} from 'lucide-react-native';

interface StockManagementProps {
  hideHeader?: boolean;
}

export const StockManagementScreen: React.FC<StockManagementProps> = ({ hideHeader = false }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'stok' | 'pergerakan'>('stok');
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [movementSearchQuery, setMovementSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'out' | 'low' | 'safe'>('all');
  const [movementsFilter, setMovementsFilter] = useState<'all' | 'masuk' | 'keluar' | 'opname'>('all');

  // Add Ingredient Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [unitInput, setUnitInput] = useState('gr');
  const [stockInput, setStockInput] = useState('');
  const [minInput, setMinInput] = useState('');

  // Stock Adjustment / Opname Modal
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [adjustType, setAdjustType] = useState<'adjustment' | 'opname'>('opname');
  const [newStockCount, setNewStockCount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Purchase Stock (Belanja) Modal
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [buyQty, setBuyQty] = useState('');
  const [buyUnitPrice, setBuyUnitPrice] = useState('');
  const [buyCost, setBuyCost] = useState('');
  const [buyNote, setBuyNote] = useState('');
  const [buySumberDana, setBuySumberDana] = useState<'laci_kasir' | 'rekening_owner'>('laci_kasir');

  // Riwayat Mutasi Filters
  const [historyDatePreset, setHistoryDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | 'thisMonth'>('all');
  const [historyIngredientId, setHistoryIngredientId] = useState<number | 'all'>('all');

  // Batch Daily Purchase Modal
  const [batchModalVisible, setBatchModalVisible] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { currentUser, isAdmin } = useAuthStore();

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [ings, moves] = await Promise.all([
        stockService.getAllIngredients(),
        stockService.getStockMovements(undefined, 200),
      ]);
      setIngredients(ings);
      setMovements(moves);
    } catch (e) {
      console.error('Failed to load stock data:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat inventaris bahan.' });
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await desktopSyncService.syncStockFromDesktop().catch(() => {});
    await loadData(false);
  };

  // Auto-refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [])
  );

  // Live WebSocket auto-refresh when Desktop updates stock or ingredients
  useEffect(() => {
    loadData(true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'stock' || event === 'catalog') {
        console.log('[StockManagementScreen] Live update received, reloading stock...');
        loadData(false);
      }
    });
    return unsub;
  }, []);

  const handleSyncFromDesktop = async () => {
    try {
      setRefreshing(true);
      const res = await desktopSyncService.syncStockFromDesktop();
      if (res.success) {
        showToast({ type: 'success', title: 'Sinkron Sukses', message: `Berhasil memperbarui ${res.count || 0} stok bahan baku dari PC Desktop.` });
        loadData();
      } else {
        showToast({ type: 'error', title: 'Gagal Sinkron', message: res.error || 'Pastikan PC Desktop aktif dan terhubung.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal terhubung ke Desktop.' });
    } finally {
      setRefreshing(false);
    }
  };

  const handlePushToDesktop = async () => {
    try {
      setRefreshing(true);
      const res = await desktopSyncService.pushAllStockToDesktop();
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Stok Terkirim',
          message: `Berhasil menyinkronkan ${res.count || 0} stok bahan baku ke PC Desktop.`,
        });
      } else {
        showToast({
          type: 'error',
          title: 'Gagal Kirim',
          message: res.error || 'Pastikan PC Desktop aktif dan terhubung.',
        });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal mengirim stok ke PC.' });
    } finally {
      setRefreshing(false);
    }
  };

  const openAdjust = (ing: Ingredient, type: 'adjustment' | 'opname') => {
    setSelectedIngredient(ing);
    setAdjustType(type);
    setNewStockCount(ing.stok_saat_ini.toString());
    setAdjustReason('');
    setAdjustModalVisible(true);
  };

  const openBuy = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setBuyQty('');
    setBuyCost('');
    setBuyUnitPrice(ing.harga_beli_satuan ? ing.harga_beli_satuan.toString() : '');
    setBuyNote('');
    setBuyModalVisible(true);
  };

  const handleChangeBuyQty = (val: string) => {
    setBuyQty(val);
    const q = parseFloat(val.replace(',', '.')) || 0;
    const u = parseCurrencyInput(buyUnitPrice);
    if (q > 0 && u > 0) {
      setBuyCost(formatCurrencyInput(Math.round(q * u).toString()));
    }
  };

  const handleChangeBuyUnitPrice = (val: string) => {
    const formatted = formatCurrencyInput(val);
    setBuyUnitPrice(formatted);
    const u = parseCurrencyInput(formatted);
    const q = parseFloat(buyQty.replace(',', '.')) || 0;
    if (q > 0 && u > 0) {
      setBuyCost(formatCurrencyInput(Math.round(q * u).toString()));
    }
  };

  const handleChangeBuyCost = (val: string) => {
    const formatted = formatCurrencyInput(val);
    setBuyCost(formatted);
    const c = parseCurrencyInput(formatted);
    const q = parseFloat(buyQty.replace(',', '.')) || 0;
    if (q > 0 && c > 0) {
      setBuyUnitPrice(formatCurrencyInput(Math.round(c / q).toString()));
    }
  };

  const handleSaveAdd = async () => {
    if (!nameInput.trim() || !unitInput.trim()) {
      showToast({ type: 'warning', title: 'Form Belum Lengkap', message: 'Nama bahan dan satuan wajib diisi.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const initialStock = parseFloat(stockInput) || 0;
      const minStock = parseFloat(minInput) || 0;
      const cleanName = nameInput.trim();
      const cleanUnit = unitInput.trim();

      await stockService.createIngredient(
        cleanName,
        cleanUnit,
        initialStock,
        minStock
      );

      // Push new ingredient to Desktop Kasir
      desktopSyncService.pushIngredientToDesktop({
        nama: cleanName,
        satuan: cleanUnit,
        stok_saat_ini: initialStock,
        stok_minimum: minStock,
      }).catch((e) => console.warn('[Stock] Push ingredient to desktop warning:', e));

      showToast({ type: 'success', title: 'Sukses', message: 'Bahan baku baru berhasil ditambahkan.' });
      setAddModalVisible(false);
      setNameInput('');
      setStockInput('');
      setMinInput('');
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAdjust = async () => {
    if (!selectedIngredient || !currentUser) return;
    if (!adjustReason.trim()) {
      showToast({ type: 'warning', title: 'Alasan Wajib Diisi', message: 'Mohon tulis alasan penyesuaian stok/opname.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const targetStock = parseFloat(newStockCount) || 0;
      const selisih = targetStock - selectedIngredient.stok_saat_ini;
      const cleanReason = adjustReason.trim();

      const adjustRes = await stockService.adjustStock(
        selectedIngredient.id,
        adjustType,
        targetStock,
        cleanReason,
        currentUser.id
      );

      // Push stock adjustment to Desktop Kasir
      desktopSyncService.pushStockAdjustmentToDesktop({
        ingredient_id: selectedIngredient.id,
        nama: selectedIngredient.nama,
        target_stock: targetStock,
        tipe: adjustType,
        selisih,
        alasan: cleanReason,
        actor_name: currentUser.nama || 'Kasir',
      }).then(async (pushed) => {
        if (pushed && adjustRes?.movementId) {
          const { getDatabase } = await import('../../database/db');
          const db = await getDatabase();
          await db.runAsync('UPDATE stock_movements SET is_synced = 1 WHERE id = ?;', [adjustRes.movementId]).catch(() => {});
        }
      }).catch((e) => console.warn('[Stock] Push adjust to desktop warning:', e));

      showToast({ type: 'success', title: 'Sukses', message: 'Stok bahan berhasil diperbarui.' });
      setAdjustModalVisible(false);
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveBuy = async () => {
    if (!selectedIngredient || !currentUser) return;
    const qty = parseFloat(buyQty) || 0;
    const cost = parseCurrencyInput(buyCost);

    if (qty <= 0) {
      showToast({ type: 'warning', title: 'Jumlah Belanja Kurang', message: 'Masukkan jumlah stok yang dibeli.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const cleanNote = buyNote.trim();

      const buyRes = await stockService.purchaseStock(
        selectedIngredient.id,
        qty,
        cost,
        cleanNote,
        currentUser.id,
        buySumberDana
      );

      // Push stock purchase to Desktop Kasir
      desktopSyncService.pushStockPurchaseToDesktop({
        ingredient_id: selectedIngredient.id,
        nama: selectedIngredient.nama,
        jumlah_masuk: qty,
        total_biaya: cost,
        harga_beli_satuan: cost > 0 && qty > 0 ? Math.round((cost / qty) * 100) / 100 : undefined,
        keterangan: cleanNote || `Belanja stok ${selectedIngredient.nama}`,
        actor_id: currentUser.id,
        actor_name: currentUser.nama || 'Kasir',
      }).then(async (pushed) => {
        if (pushed) {
          const { getDatabase } = await import('../../database/db');
          const db = await getDatabase();
          if (buyRes?.movementId) {
            await db.runAsync('UPDATE stock_movements SET is_synced = 1 WHERE id = ?;', [buyRes.movementId]).catch(() => {});
          }
        }
      }).catch((e) => console.warn('[Stock] Push purchase to desktop warning:', e));

      if (buyRes?.expenseId && cost > 0) {
        desktopSyncService.pushExpenseToDesktop({
          id: buyRes.expenseId,
          tanggal: buyRes.timestamp || new Date().toISOString(),
          kategori: 'Belanja Bahan Baku',
          jumlah: cost,
          keterangan: cleanNote || `Belanja stok ${selectedIngredient.nama} (+${qty} ${selectedIngredient.satuan || ''})`,
          input_by: currentUser.id,
          input_by_name: currentUser.nama || 'Kasir',
          sumber_dana: buySumberDana,
        }).then(async (res) => {
          if (res?.success) {
            const { getDatabase } = await import('../../database/db');
            const db = await getDatabase();
            await db.runAsync('UPDATE expenses SET is_synced = 1 WHERE id = ?;', [buyRes.expenseId]).catch(() => {});
          }
        }).catch((e) => console.warn('[Stock] Push expense to desktop warning:', e));
      }

      showToast({
        type: 'success',
        title: 'Sukses',
        message: `Stok ${selectedIngredient.nama} bertambah +${qty} ${selectedIngredient.satuan} dan pengeluaran sebesar ${formatIDR(cost)} tercatat otomatis.`,
      });
      setBuyModalVisible(false);
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const outOfStockCount = useMemo(() => {
    return ingredients.filter((i) => i.stok_saat_ini <= 0).length;
  }, [ingredients]);

  const lowStockCount = useMemo(() => {
    return ingredients.filter((i) => i.stok_saat_ini > 0 && i.stok_saat_ini <= i.stok_minimum).length;
  }, [ingredients]);

  const safeStockCount = useMemo(() => {
    return ingredients.filter((i) => i.stok_saat_ini > i.stok_minimum).length;
  }, [ingredients]);

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((item) => {
      const matchSearch =
        item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.satuan.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      if (filterStatus === 'out') return item.stok_saat_ini <= 0;
      if (filterStatus === 'low') return item.stok_saat_ini > 0 && item.stok_saat_ini <= item.stok_minimum;
      if (filterStatus === 'safe') return item.stok_saat_ini > item.stok_minimum;
      return true;
    });
  }, [ingredients, searchQuery, filterStatus]);

  const filteredMovements = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const sevenDaysStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return movements.filter((m) => {
      // 1. Text Search
      if (movementSearchQuery.trim()) {
        const q = movementSearchQuery.toLowerCase();
        const ingName = (m.ingredient_name || '').toLowerCase();
        const note = (m.keterangan || '').toLowerCase();
        const src = (m.sumber || '').toLowerCase();
        if (!ingName.includes(q) && !note.includes(q) && !src.includes(q)) {
          return false;
        }
      }

      // 2. Type filter
      if (movementsFilter === 'masuk' && m.tipe !== 'masuk') return false;
      if (movementsFilter === 'keluar' && m.tipe !== 'keluar' && (m.tipe as string) !== 'penjualan') return false;
      if (movementsFilter === 'opname' && m.tipe !== 'opname' && m.tipe !== 'adjustment') return false;

      // 3. Ingredient filter
      if (historyIngredientId !== 'all' && m.ingredient_id !== historyIngredientId) {
        return false;
      }

      // 4. Date preset filter
      if (historyDatePreset === 'today') {
        return m.tanggal.startsWith(todayStr);
      } else if (historyDatePreset === 'yesterday') {
        return m.tanggal.startsWith(yesterdayStr);
      } else if (historyDatePreset === '7days') {
        return m.tanggal.slice(0, 10) >= sevenDaysStr;
      } else if (historyDatePreset === 'thisMonth') {
        return m.tanggal.startsWith(thisMonthPrefix);
      }

      return true;
    });
  }, [movements, movementsFilter, movementSearchQuery, historyDatePreset, historyIngredientId]);

  const historyStats = useMemo(() => {
    let masukQty = 0;
    let keluarQty = 0;
    let opnameCount = 0;
    for (const m of filteredMovements) {
      if (m.tipe === 'masuk') masukQty += m.jumlah;
      else if (m.tipe === 'keluar' || (m.tipe as string) === 'penjualan') keluarQty += m.jumlah;
      else if (m.tipe === 'opname' || m.tipe === 'adjustment') opnameCount++;
    }
    return { total: filteredMovements.length, masukQty, keluarQty, opnameCount };
  }, [filteredMovements]);

  return (
    <View style={styles.container}>
      {/* Render Header only if not embedded in a subscreen */}
      {!hideHeader && (
        <Header title="Stok Bahan" />
      )}

      {/* Top Quick Actions Bar */}
      <View style={styles.topActionBar}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={styles.syncPcBtn}
            onPress={handleSyncFromDesktop}
            activeOpacity={0.8}
          >
            <RefreshCw size={13} color="#D97706" />
            <Text style={styles.syncPcBtnText}>Tarik PC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.syncPcBtn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}
            onPress={handlePushToDesktop}
            activeOpacity={0.8}
          >
            <UploadCloud size={13} color="#15803D" />
            <Text style={[styles.syncPcBtnText, { color: '#15803D' }]}>Push PC</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rightActionsGroup}>
          <TouchableOpacity
            style={styles.topBatchBtn}
            onPress={() => setBatchModalVisible(true)}
            activeOpacity={0.8}
          >
            <ShoppingCart size={13} color="#B45309" />
            <Text style={styles.topBatchBtnText}>Belanja</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topAddBtn}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.topAddBtnText}>Bahan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs Switcher: Daftar Stok vs Riwayat Mutasi */}
      <View style={styles.tabSection}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'stok' && styles.tabBtnActive]}
            onPress={() => setActiveTab('stok')}
            activeOpacity={0.8}
          >
            <Package size={15} color={activeTab === 'stok' ? '#D97706' : '#64748B'} />
            <Text style={[styles.tabBtnText, activeTab === 'stok' && styles.tabBtnTextActive]}>
              Katalog Stok ({ingredients.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pergerakan' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pergerakan')}
            activeOpacity={0.8}
          >
            <History size={15} color={activeTab === 'pergerakan' ? '#D97706' : '#64748B'} />
            <Text style={[styles.tabBtnText, activeTab === 'pergerakan' && styles.tabBtnTextActive]}>
              Riwayat Mutasi ({movements.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter Controls when on Katalog Stok */}
        {activeTab === 'stok' && (
          <View style={styles.searchAndFilterBox}>
            {/* Search Input */}
            <View style={styles.searchBar}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari bahan..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Chips & Add Button */}
            <View style={styles.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipGroup}>
                <TouchableOpacity
                  style={[styles.chip, filterStatus === 'all' && styles.chipActive]}
                  onPress={() => setFilterStatus('all')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, filterStatus === 'all' && styles.chipTextActive]}>
                    Semua ({ingredients.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, filterStatus === 'out' && styles.chipActiveOut]}
                  onPress={() => setFilterStatus('out')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, filterStatus === 'out' && styles.chipTextActiveOut]}>
                    ⛔ Habis (0) ({outOfStockCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, filterStatus === 'low' && styles.chipActiveAlert]}
                  onPress={() => setFilterStatus('low')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, filterStatus === 'low' && styles.chipTextActiveAlert]}>
                    ⚠️ Menipis ({lowStockCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, filterStatus === 'safe' && styles.chipActiveSafe]}
                  onPress={() => setFilterStatus('safe')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, filterStatus === 'safe' && styles.chipTextActiveSafe]}>
                    ✅ Aman ({safeStockCount})
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Search & Filter chips when on Riwayat Mutasi */}
        {activeTab === 'pergerakan' && (
          <View style={styles.searchAndFilterBox}>
            {/* Search Input for Movements */}
            <View style={styles.searchBar}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama bahan, keterangan, sumber..."
                placeholderTextColor="#94A3B8"
                value={movementSearchQuery}
                onChangeText={setMovementSearchQuery}
              />
              {movementSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setMovementSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.movementsFilterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.movementsFilterScroll}
              >
                {[
                  { type: 'all', label: 'Semua', count: movements.length, icon: '📋' },
                  { type: 'masuk', label: 'Belanja / Masuk', count: movements.filter((m) => m.tipe === 'masuk').length, icon: '📥' },
                  { type: 'keluar', label: 'Terpakai / Keluar', count: movements.filter((m) => (m.tipe as string) === 'keluar' || (m.tipe as string) === 'penjualan').length, icon: '📤' },
                  { type: 'opname', label: 'Opname / Koreksi', count: movements.filter((m) => m.tipe === 'opname' || m.tipe === 'adjustment').length, icon: '⚖️' },
                ].map((item) => {
                  const isSelected = movementsFilter === item.type;
                  return (
                    <TouchableOpacity
                      key={`mf-${item.type}`}
                      style={[styles.moveFilterChip, isSelected && styles.moveFilterChipActive]}
                      onPress={() => setMovementsFilter(item.type as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.moveFilterIcon}>{item.icon}</Text>
                      <Text
                        style={[
                          styles.moveFilterText,
                          isSelected && styles.moveFilterTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <View style={[styles.moveFilterBadge, isSelected && styles.moveFilterBadgeActive]}>
                        <Text style={[styles.moveFilterBadgeText, isSelected && styles.moveFilterBadgeTextActive]}>
                          {item.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Quick Date Presets Row */}
            <View style={[styles.movementsFilterRow, { marginTop: 6 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.movementsFilterScroll}
              >
                {[
                  { key: 'all', label: '📅 Semua Waktu' },
                  { key: 'today', label: 'Hari Ini' },
                  { key: 'yesterday', label: 'Kemarin' },
                  { key: '7days', label: '7 Hari Terakhir' },
                  { key: 'thisMonth', label: 'Bulan Ini' },
                ].map((item) => {
                  const isSelected = historyDatePreset === item.key;
                  return (
                    <TouchableOpacity
                      key={`date-${item.key}`}
                      style={[
                        styles.moveFilterChip,
                        { paddingHorizontal: 10, paddingVertical: 5 },
                        isSelected && { backgroundColor: '#F59E0B', borderColor: '#D97706' },
                      ]}
                      onPress={() => setHistoryDatePreset(item.key as any)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.moveFilterText,
                          { fontSize: 11 },
                          isSelected && { color: '#FFFFFF', fontWeight: '800' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Specific Ingredient Filter Row */}
            <View style={[styles.movementsFilterRow, { marginTop: 6 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.movementsFilterScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.moveFilterChip,
                    { paddingHorizontal: 10, paddingVertical: 5 },
                    historyIngredientId === 'all' && { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
                  ]}
                  onPress={() => setHistoryIngredientId('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.moveFilterText,
                      { fontSize: 11 },
                      historyIngredientId === 'all' && { color: '#FFFFFF', fontWeight: '800' },
                    ]}
                  >
                    🌾 Semua Bahan
                  </Text>
                </TouchableOpacity>

                {ingredients.map((ing) => {
                  const isSelected = historyIngredientId === ing.id;
                  return (
                    <TouchableOpacity
                      key={`ing-filter-${ing.id}`}
                      style={[
                        styles.moveFilterChip,
                        { paddingHorizontal: 10, paddingVertical: 5 },
                        isSelected && { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
                      ]}
                      onPress={() => setHistoryIngredientId(isSelected ? 'all' : ing.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.moveFilterText,
                          { fontSize: 11 },
                          isSelected && { color: '#FFFFFF', fontWeight: '800' },
                        ]}
                      >
                        {ing.nama}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Memuat inventaris bahan...</Text>
        </View>
      ) : activeTab === 'stok' ? (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filteredIngredients.length === 0 ? (
            <View style={styles.emptyState}>
              <Package size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Tidak ada bahan ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `Tidak ada hasil pencarian "${searchQuery}"`
                  : 'Belum ada data bahan baku dalam kategori ini.'}
              </Text>
              {searchQuery ? (
                <TouchableOpacity
                  style={styles.clearSearchBtn}
                  onPress={() => setSearchQuery('')}
                >
                  <Text style={styles.clearSearchText}>Reset Pencarian</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            filteredIngredients.map((ing) => {
              const isOut = ing.stok_saat_ini <= 0;
              const isLow = ing.stok_saat_ini <= ing.stok_minimum;
              const maxRatioTarget = Math.max(ing.stok_minimum * 2, 10);
              const progressPct = Math.min(
                Math.max((ing.stok_saat_ini / maxRatioTarget) * 100, 4),
                100
              );

              return (
                <View
                  key={`ing-${ing.id}`}
                  style={[
                    styles.ingCard,
                    isOut
                      ? styles.ingCardOut
                      : isLow
                        ? styles.ingCardLow
                        : styles.ingCardSafe,
                  ]}
                >
                  {/* Card Top Row: Info & Status Badge */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardHeaderLeft}>
                      <View
                        style={[
                          styles.ingIconCircle,
                          {
                            backgroundColor: isOut
                              ? '#FEE2E2'
                              : isLow
                                ? '#FEF3C7'
                                : '#F0FDF4',
                          },
                        ]}
                      >
                        <Package
                          size={18}
                          color={
                            isOut ? '#DC2626' : isLow ? '#D97706' : '#16A34A'
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ingTitle} numberOfLines={1}>
                          {ing.nama}
                        </Text>
                        <Text style={styles.ingSubInfo}>
                          Batas Minimum: {ing.stok_minimum} {ing.satuan}
                        </Text>
                      </View>
                    </View>

                    {/* Status Pill Badge */}
                    <View
                      style={[
                        styles.statusPill,
                        isOut
                          ? styles.statusPillOut
                          : isLow
                            ? styles.statusPillLow
                            : styles.statusPillSafe,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          isOut
                            ? styles.statusTextOut
                            : isLow
                              ? styles.statusTextLow
                              : styles.statusTextSafe,
                        ]}
                      >
                        {isOut ? '🔴 Habis' : isLow ? '⚠️ Menipis' : '🟢 Aman'}
                      </Text>
                    </View>
                  </View>

                  {/* Card Mid: Stock Value & Progress Visualizer */}
                  <View style={styles.cardMidRow}>
                    <View style={styles.stockNumbers}>
                      <Text style={styles.stockLabelText}>Stok Tersedia:</Text>
                      <View style={styles.stockValueRow}>
                        <Text
                          style={[
                            styles.stockBigNumber,
                            isOut
                              ? styles.stockNumOut
                              : isLow
                                ? styles.stockNumLow
                                : styles.stockNumSafe,
                          ]}
                        >
                          {ing.stok_saat_ini}
                        </Text>
                        <Text style={styles.stockUnitBadge}>{ing.satuan}</Text>
                      </View>
                    </View>

                    <View style={styles.stockProgressBox}>
                      <View style={styles.progressBarTrack}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${progressPct}%`,
                              backgroundColor: isOut
                                ? '#DC2626'
                                : isLow
                                  ? '#F59E0B'
                                  : '#10B981',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressPercentText}>
                        {Math.round((ing.stok_saat_ini / (ing.stok_minimum || 1)) * 100)}% dari min
                      </Text>
                    </View>
                  </View>

                  {/* Card Bottom: Action Buttons */}
                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={styles.buyBtn}
                      onPress={() => openBuy(ing)}
                      activeOpacity={0.8}
                    >
                      <ShoppingCart size={13} color="#15803D" />
                      <Text style={styles.buyBtnText}>Belanja Masuk</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.opnameBtn}
                      onPress={() => openAdjust(ing, 'opname')}
                      activeOpacity={0.8}
                    >
                      <Sliders size={13} color="#0369A1" />
                      <Text style={styles.opnameBtnText}>Opname / Koreksi</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : isAdmin ? (
        /* Movements Log Content (Khusus Admin / Owner) */
        <ScrollView
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Summary Stat Cards */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>Total Mutasi</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>{historyStats.total}</Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>Stok Masuk</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#15803D', marginTop: 2 }}>+{historyStats.masukQty}</Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>Stok Keluar</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#B91C1C', marginTop: 2 }}>-{historyStats.keluarQty}</Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#F0F9FF', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#BAE6FD', alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0284C7' }}>Opname</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0369A1', marginTop: 2 }}>{historyStats.opnameCount}</Text>
            </View>
          </View>

          {filteredMovements.length === 0 ? (
            <View style={styles.emptyState}>
              <History size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Belum ada riwayat mutasi</Text>
              <Text style={styles.emptySubtitle}>
                Pergerakan stok masuk, keluar dan opname akan tercatat di sini secara otomatis.
              </Text>
            </View>
          ) : (
            filteredMovements.map((m) => {
              const isOut = m.tipe === 'keluar';
              const isOpname = m.tipe === 'opname' || m.tipe === 'adjustment';
              return (
                <View key={`mov-${m.id}`} style={styles.movCard}>
                  <View
                    style={[
                      styles.movIconCircle,
                      {
                        backgroundColor: isOut
                          ? '#FEE2E2'
                          : isOpname
                            ? '#E0F2FE'
                            : '#DCFCE7',
                      },
                    ]}
                  >
                    {isOut ? (
                      <ArrowDownRight size={16} color="#DC2626" />
                    ) : isOpname ? (
                      <Sliders size={16} color="#0284C7" />
                    ) : (
                      <ArrowUpRight size={16} color="#16A34A" />
                    )}
                  </View>

                  <View style={styles.movBody}>
                    <View style={styles.movTitleRow}>
                      <Text style={styles.movIngredientName}>
                        {m.ingredient_name || `Bahan #${m.ingredient_id}`}
                      </Text>
                      <Text
                        style={[
                          styles.movAmountText,
                          isOut
                            ? { color: '#DC2626' }
                            : isOpname
                              ? { color: '#0284C7' }
                              : { color: '#16A34A' },
                        ]}
                      >
                        {m.jumlah > 0 ? `+${m.jumlah}` : `${m.jumlah}`}
                      </Text>
                    </View>

                    <Text style={styles.movReasonText}>
                      {m.keterangan || 'Aktivitas stok'}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                      <Text style={styles.movDateText}>
                        {formatDateIndo(m.tanggal)}
                      </Text>
                      {m.sumber ? (
                        <Text style={[styles.movDateText, { color: '#64748B', fontWeight: '600' }]}>
                          [{m.sumber}]
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : null}

      {/* Add Ingredient Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.modalHeaderIcon}>
                  <Plus size={16} color="#D97706" />
                </View>
                <Text style={styles.modalTitle}>Tambah Bahan Baku Baru</Text>
              </View>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nama Bahan Baku / Topping</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: Keju Parut Cheddar"
                placeholderTextColor="#94A3B8"
                value={nameInput}
                onChangeText={setNameInput}
              />

              <Text style={styles.inputLabel}>Satuan Takaran (gr, kg, pcs, ml, pack)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="gr / pcs / ml / butir"
                placeholderTextColor="#94A3B8"
                value={unitInput}
                onChangeText={setUnitInput}
              />

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Stok Awal Saat Ini</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={stockInput}
                    onChangeText={setStockInput}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Batas Stok Minimum</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={minInput}
                    onChangeText={setMinInput}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.saveSubmitBtn}
                onPress={handleSaveAdd}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveSubmitText}>Simpan Bahan Baku</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Stock Opname / Manual Adjustment Modal */}
      <Modal visible={adjustModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.modalHeaderIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Sliders size={16} color="#0284C7" />
                </View>
                <Text style={styles.modalTitle}>Stock Opname & Penyesuaian</Text>
              </View>
              <TouchableOpacity onPress={() => setAdjustModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.highlightIngBox}>
                <Text style={styles.highlightIngTitle}>{selectedIngredient?.nama}</Text>
                <Text style={styles.highlightIngSub}>
                  Stok Terdata di Sistem: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{selectedIngredient?.stok_saat_ini} {selectedIngredient?.satuan}</Text>
                </Text>
              </View>

              <Text style={styles.inputLabel}>
                Jumlah Fisik Riil Terhitung ({selectedIngredient?.satuan})
              </Text>
              <TextInput
                style={[styles.textInput, styles.largeInput]}
                keyboardType="numeric"
                value={newStockCount}
                onChangeText={setNewStockCount}
              />

              {/* Calculated Difference */}
              {selectedIngredient && (
                <View style={styles.diffPreviewBox}>
                  <Text style={styles.diffPreviewLabel}>Selisih Penyesuaian:</Text>
                  <Text
                    style={[
                      styles.diffPreviewVal,
                      parseFloat(newStockCount) - selectedIngredient.stok_saat_ini >= 0
                        ? { color: '#16A34A' }
                        : { color: '#DC2626' },
                    ]}
                  >
                    {parseFloat(newStockCount) - selectedIngredient.stok_saat_ini >= 0 ? '+' : ''}
                    {(parseFloat(newStockCount) || 0) - selectedIngredient.stok_saat_ini}{' '}
                    {selectedIngredient.satuan}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>
                Alasan / Keterangan <Text style={{ color: '#DC2626' }}>* (Wajib Diisi)</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Contoh: Cek fisik mingguan, ada bahan rusak, kaleng bocor..."
                placeholderTextColor="#94A3B8"
                value={adjustReason}
                onChangeText={setAdjustReason}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveSubmitBtn, { backgroundColor: '#0284C7' }]}
                onPress={handleSaveAdjust}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveSubmitText}>Simpan Hasil Opname</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Purchase Stock (Belanja) Modal */}
      <Modal visible={buyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.modalHeaderIcon, { backgroundColor: '#DCFCE7' }]}>
                  <ShoppingCart size={16} color="#16A34A" />
                </View>
                <Text style={styles.modalTitle}>Belanja Stok Bahan Masuk</Text>
              </View>
              <TouchableOpacity onPress={() => setBuyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.highlightIngBox}>
                <Text style={styles.highlightIngTitle}>{selectedIngredient?.nama}</Text>
                <Text style={styles.highlightIngSub}>
                  Satuan: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{selectedIngredient?.satuan}</Text> • Stok Saat Ini: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{selectedIngredient?.stok_saat_ini}</Text>
                </Text>
              </View>

              <Text style={styles.inputLabel}>
                Jumlah Stok Masuk / Dibeli ({selectedIngredient?.satuan})
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: 1000 atau 10"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={buyQty}
                onChangeText={handleChangeBuyQty}
              />

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Harga Beli Satuan (Rp)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Contoh: 5.000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={buyUnitPrice}
                    onChangeText={handleChangeBuyUnitPrice}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>
                    Total Belanja (Rp)
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Contoh: 45.000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={buyCost}
                    onChangeText={handleChangeBuyCost}
                  />
                </View>
              </View>
              <Text style={{ fontSize: 10, color: '#16A34A', fontWeight: '700', marginTop: -4, marginBottom: 8 }}>
                * Harga satuan & total belanja tersinkronisasi otomatis serta tercatat ke kas.
              </Text>

              <Text style={styles.inputLabel}>Sumber Dana Pembayaran</Text>
              <View style={styles.fundingRow}>
                <TouchableOpacity
                  style={[styles.fundingBtn, buySumberDana === 'laci_kasir' && styles.fundingBtnActive]}
                  onPress={() => setBuySumberDana('laci_kasir')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fundingText, buySumberDana === 'laci_kasir' && styles.fundingTextActive]}>
                    💵 Laci Kasir (Fisik)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.fundingBtn, buySumberDana === 'rekening_owner' && styles.fundingBtnActive]}
                  onPress={() => setBuySumberDana('rekening_owner')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fundingText, buySumberDana === 'rekening_owner' && styles.fundingTextActive]}>
                    🏦 Rekening Owner
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Catatan / Supplier (Opsional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: Beli di Toko Bahan Roti Berkah"
                placeholderTextColor="#94A3B8"
                value={buyNote}
                onChangeText={setBuyNote}
              />

              <TouchableOpacity
                style={[styles.saveSubmitBtn, { backgroundColor: '#16A34A' }]}
                onPress={handleSaveBuy}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveSubmitText}>Tambah Stok & Catat Pengeluaran</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Batch Daily Restock Modal */}
      <BatchRestockModal
        visible={batchModalVisible}
        ingredients={ingredients}
        onClose={() => setBatchModalVisible(false)}
        onSaveSuccess={loadData}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  syncPcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  syncPcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  topBatchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  topAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  topAddBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tabSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  searchAndFilterBox: {
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  chipActive: {
    backgroundColor: '#0F172A',
  },
  chipActiveAlert: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  chipActiveOut: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  chipActiveSafe: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chipTextActiveOut: {
    color: '#DC2626',
    fontWeight: '700',
  },
  chipTextActiveAlert: {
    color: '#B45309',
    fontWeight: '700',
  },
  chipTextActiveSafe: {
    color: '#15803D',
    fontWeight: '700',
  },
  batchBuyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  batchBuyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  addNewBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  movementsFilterRow: {
    paddingVertical: 2,
  },
  movementsFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 10,
  },
  moveFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  moveFilterChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  moveFilterIcon: {
    fontSize: 13,
  },
  moveFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  moveFilterTextActive: {
    color: '#92400E',
    fontWeight: '800',
  },
  moveFilterBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveFilterBadgeActive: {
    backgroundColor: '#FDE68A',
  },
  moveFilterBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
  moveFilterBadgeTextActive: {
    color: '#78350F',
  },
  listContainer: {
    padding: 14,
    gap: 10,
    paddingBottom: 40,
  },
  centerLoading: {
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  clearSearchBtn: {
    marginTop: 14,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearSearchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  ingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  ingCardSafe: {
    borderColor: '#E2E8F0',
  },
  ingCardLow: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5',
  },
  ingCardOut: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  ingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ingSubInfo: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillSafe: {
    backgroundColor: '#DCFCE7',
  },
  statusPillLow: {
    backgroundColor: '#FEF3C7',
  },
  statusPillOut: {
    backgroundColor: '#FEE2E2',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusTextSafe: {
    color: '#15803D',
  },
  statusTextLow: {
    color: '#B45309',
  },
  statusTextOut: {
    color: '#DC2626',
  },
  cardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stockNumbers: {
    flex: 1,
  },
  stockLabelText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  stockValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  stockBigNumber: {
    fontSize: 20,
    fontWeight: '900',
  },
  stockNumSafe: {
    color: '#0F172A',
  },
  stockNumLow: {
    color: '#D97706',
  },
  stockNumOut: {
    color: '#DC2626',
  },
  stockUnitBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stockProgressBox: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 14,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressPercentText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  buyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  buyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  opnameBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  opnameBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  movCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  movIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movBody: {
    flex: 1,
  },
  movTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  movIngredientName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  movAmountText: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  movReasonText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  movDateText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  largeInput: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 12,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveSubmitBtn: {
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  highlightIngBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  highlightIngTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  highlightIngSub: {
    fontSize: 11.5,
    color: '#78350F',
    marginTop: 2,
  },
  diffPreviewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  diffPreviewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  diffPreviewVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  fundingRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  fundingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  fundingBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  fundingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  fundingTextActive: {
    color: '#92400E',
  },
});
