import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Expense, ExpenseCategory, WalletTransfer, BalanceAdjustmentLog, WalletType } from '../../types';
import { expenseService, DEFAULT_EXPENSE_CATEGORIES } from '../../services/expenseService';
import { stockService } from '../../services/stockService';
import { reportService } from '../../services/reportService';
import { walletService } from '../../services/walletService';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { useAuthStore } from '../../stores/authStore';
import { Header } from '../../components/common/Header';
import {
  formatIDR,
  formatDateIndo,
  formatCurrencyInput,
  parseCurrencyInput,
  formatOnlyDate,
  formatCurrentTimestamp,
} from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import { TransferWalletModal } from '../../components/wallet/TransferWalletModal';
import { AdjustWalletModal } from '../../components/wallet/AdjustWalletModal';
import {
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  X,
  CreditCard,
  Banknote,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Wallet,
  FolderPlus,
  ArrowRightLeft,
  SlidersHorizontal,
  Search,
  Receipt,
  Check,
  Filter,
  AlertTriangle,
} from 'lucide-react-native';

interface ParsedRestock {
  isRestock: boolean;
  itemCount: number;
  items: string[];
  noteTitle: string;
  raw: string;
}

function parseRestockNote(note?: string): ParsedRestock {
  if (!note) return { isRestock: false, itemCount: 0, items: [], noteTitle: '', raw: '' };

  let clean = note;
  // Strip potential prefixes like "[HP Kasir - Staff]"
  clean = clean.replace(/^\[HP Kasir(?:\s*-\s*[^\]]+)?\]\s*/i, '').trim();

  const restockMatch = clean.match(/^Restock Harian\s*(?:\((\d+)\s*bahan\))?:\s*(.+)$/i);
  if (restockMatch) {
    const count = restockMatch[1] ? parseInt(restockMatch[1], 10) : 0;
    const body = restockMatch[2];
    let itemsPart = body;
    let noteTitle = 'Restock Harian Bahan Baku';

    const lastDashIdx = body.lastIndexOf(' - ');
    if (lastDashIdx !== -1) {
      itemsPart = body.substring(0, lastDashIdx).trim();
      noteTitle = body.substring(lastDashIdx + 3).trim();
    }

    const items = itemsPart
      .split(', ')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      isRestock: true,
      itemCount: count || items.length,
      items,
      noteTitle,
      raw: note,
    };
  }
  return { isRestock: false, itemCount: 0, items: [], noteTitle: '', raw: note };
}

export interface LinkedStockItem {
  ingredientId: number;
  nama: string;
  qty: number;
  satuan: string;
  currentStock: number;
}

async function detectLinkedStockItems(exp: Expense): Promise<LinkedStockItem[]> {
  try {
    const allIngredients = await stockService.getAllIngredients();
    const parsed = parseRestockNote(exp.keterangan);
    const linked: LinkedStockItem[] = [];

    if (parsed.isRestock && parsed.items && parsed.items.length > 0) {
      for (const itemStr of parsed.items) {
        // Format misal: "Roti (+200 pcs)" atau "Susu (+5 botol)"
        const match = itemStr.match(/^(.+?)\s*\(\+([\d.,]+)\s*([^)]*)\)$/);
        if (match) {
          const rawName = match[1].trim();
          const rawQtyStr = match[2].trim().replace(',', '.');
          const qtyNum = parseFloat(rawQtyStr);
          if (qtyNum > 0) {
            const matchedIng = allIngredients.find(
              (i) => i.nama.toLowerCase().trim() === rawName.toLowerCase()
            );
            if (matchedIng) {
              linked.push({
                ingredientId: matchedIng.id,
                nama: matchedIng.nama,
                qty: qtyNum,
                satuan: matchedIng.satuan || match[3]?.trim() || 'unit',
                currentStock: matchedIng.stok_saat_ini,
              });
            }
          }
        }
      }
    }

    // Fallback jika kategori Belanja Bahan Baku atau terdapat kata restock
    if (linked.length === 0 && (exp.kategori === 'Belanja Bahan Baku' || /restock/i.test(exp.keterangan))) {
      const moves = await stockService.getStockMovements(undefined, 50);
      const expTime = new Date(exp.tanggal).getTime();
      const nearbyMoves = moves.filter((m) => {
        if (m.tipe !== 'masuk' || m.jumlah <= 0) return false;
        const movTime = new Date(m.tanggal).getTime();
        return Math.abs(movTime - expTime) <= 15 * 60 * 1000;
      });

      for (const mov of nearbyMoves) {
        const matchedIng = allIngredients.find((i) => i.id === mov.ingredient_id);
        if (matchedIng && !linked.some((li) => li.ingredientId === matchedIng.id)) {
          linked.push({
            ingredientId: matchedIng.id,
            nama: matchedIng.nama,
            qty: mov.jumlah,
            satuan: matchedIng.satuan || 'unit',
            currentStock: matchedIng.stok_saat_ini,
          });
        }
      }
    }

    return linked;
  } catch (err) {
    console.warn('[ExpenseScreen] Error detecting linked stock:', err);
    return [];
  }
}

type DateFilterPreset = 'all' | 'today' | 'yesterday' | '7days' | 'thisMonth';

export const ExpenseScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  // Main Tab: 'expenses' (Pengeluaran Toko) | 'mutations' (Mutasi & Saldo)
  const [activeMainTab, setActiveMainTab] = useState<'expenses' | 'mutations'>('expenses');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});

  // Filter States for Expenses Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilterPreset, setDateFilterPreset] = useState<DateFilterPreset>('all');
  const [selectedCat, setSelectedCat] = useState<ExpenseCategory | 'all'>('all');
  const [selectedSumberDana, setSelectedSumberDana] = useState<WalletType | 'all'>('all');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [walletPickerVisible, setWalletPickerVisible] = useState(false);

  // Dynamic Categories
  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isSavingCat, setIsSavingCat] = useState(false);

  // Real-time Balances (3 Wallets)
  const [balances, setBalances] = useState<{
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  }>({
    saldoLaciKasir: 0,
    saldoManager: 0,
    saldoRekeningOwner: 0,
  });

  // Wallet Modals & History State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [adjustments, setAdjustments] = useState<BalanceAdjustmentLog[]>([]);
  const [mutationsLoading, setMutationsLoading] = useState(false);
  const [mutationSearch, setMutationSearch] = useState('');
  const [mutationFilter, setMutationFilter] = useState<'all' | 'transfer' | 'adjustment'>('all');
  const [mutationToDelete, setMutationToDelete] = useState<{
    id: string;
    tipe: 'transfer' | 'adjustment';
    nominal: number;
    dompetInfo: string;
    actor: string;
    keterangan: string;
  } | null>(null);
  const [isDeletingMutation, setIsDeletingMutation] = useState(false);

  // Form Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [formCat, setFormCat] = useState<ExpenseCategory>('Operasional Lain');
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formSumberDana, setFormSumberDana] = useState<WalletType>('laci_kasir');
  const [formDateOption, setFormDateOption] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [formCustomDate, setFormCustomDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { currentUser, isAdmin } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const loadCategories = async () => {
    try {
      const cats = await expenseService.getExpenseCategories();
      setCategories(cats);
    } catch (e) {
      console.warn('Failed to load expense categories:', e);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      showToast({ type: 'warning', title: 'Nama Kategori Kosong', message: 'Tulis nama kategori pengeluaran terlebih dahulu.' });
      return;
    }
    try {
      setIsSavingCat(true);
      const res = await expenseService.addExpenseCategory(trimmed, currentUser?.id);
      if (res.success) {
        setCategories(res.categories);
        setFormCat(trimmed);
        setNewCatName('');
        setCatModalVisible(false);
        showToast({
          type: 'success',
          title: 'Kategori Berhasil Dibuat',
          message: `Kategori "${trimmed}" siap digunakan.`,
        });
      } else {
        showToast({ type: 'warning', title: 'Perhatian', message: res.error || 'Gagal membuat kategori.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSavingCat(false);
    }
  };

  const handleDeleteCategory = (cat: string) => {
    Alert.alert(
      'Hapus Kategori',
      `Hapus kategori "${cat}" dari daftar pilihan? Riwayat transaksi lama tidak akan terhapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const res = await expenseService.deleteExpenseCategory(cat, currentUser?.id);
            if (res.success) {
              setCategories(res.categories);
              if (formCat === cat) {
                setFormCat(res.categories[0] || 'Operasional Lain');
              }
              if (selectedCat === cat) {
                setSelectedCat('all');
              }
              showToast({ type: 'info', title: 'Kategori Dihapus', message: `Kategori "${cat}" telah dihapus.` });
            }
          },
        },
      ]
    );
  };

  const loadBalances = async () => {
    try {
      const b = await reportService.getCurrentBalances();
      setBalances({
        saldoLaciKasir: b.saldoLaciKasir,
        saldoManager: b.saldoManager,
        saldoRekeningOwner: b.saldoRekeningOwner,
      });
    } catch (e) {
      console.warn('Failed to load balances in ExpenseScreen:', e);
    }
  };

  const loadMutations = async () => {
    if (!isAdmin) return;
    try {
      setMutationsLoading(true);
      const [tfs, adjs] = await Promise.all([
        walletService.getWalletTransfers(150),
        walletService.getBalanceAdjustments(150),
      ]);
      setTransfers(tfs);
      setAdjustments(adjs);
    } catch (e) {
      console.warn('Failed to load mutations:', e);
    } finally {
      setMutationsLoading(false);
    }
  };

  // Pastikan akun Kasir selalu terkunci di tab Pengeluaran
  useEffect(() => {
    if (!isAdmin && activeMainTab !== 'expenses') {
      setActiveMainTab('expenses');
    }
  }, [isAdmin, activeMainTab]);

  const loadExpenses = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [list] = await Promise.all([
        expenseService.getAllExpenses({
          limit: 300,
        }),
        loadBalances(),
        loadCategories(),
        loadMutations(),
      ]);
      setExpenses(list);
    } catch (e) {
      console.error('Failed to load expenses:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat pengeluaran.' });
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  // Filtered expenses based on search, date preset, category, and funding source
  const filteredExpenses = useMemo(() => {
    const today = formatOnlyDate(new Date());
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterday = formatOnlyDate(yesterdayDate);
    const sevenDaysAgoDate = new Date(Date.now() - 7 * 86400000);
    const sevenDaysAgo = formatOnlyDate(sevenDaysAgoDate);
    const startOfMonth = today.slice(0, 8) + '01';

    return expenses.filter((e) => {
      // 1. Category filter
      if (selectedCat !== 'all' && e.kategori !== selectedCat) return false;

      // 2. Funding source filter
      if (selectedSumberDana !== 'all' && e.sumber_dana !== selectedSumberDana) return false;

      // 3. Date Preset filter
      const expDate = e.tanggal ? e.tanggal.slice(0, 10) : '';
      if (dateFilterPreset === 'today' && expDate !== today) return false;
      if (dateFilterPreset === 'yesterday' && expDate !== yesterday) return false;
      if (dateFilterPreset === '7days' && expDate < sevenDaysAgo) return false;
      if (dateFilterPreset === 'thisMonth' && expDate < startOfMonth) return false;

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ketMatch = (e.keterangan || '').toLowerCase().includes(q);
        const catMatch = (e.kategori || '').toLowerCase().includes(q);
        const staffMatch = (e.input_by_name || '').toLowerCase().includes(q);
        const amountMatch = String(e.jumlah).includes(q);
        if (!ketMatch && !catMatch && !staffMatch && !amountMatch) return false;
      }

      return true;
    });
  }, [expenses, selectedCat, selectedSumberDana, dateFilterPreset, searchQuery]);

  const totalFilteredSum = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.jumlah, 0);
  }, [filteredExpenses]);

  const combinedMutations = useMemo(() => {
    type UnifiedMutation = {
      id: string;
      tanggal: string;
      tipe: 'transfer' | 'adjustment';
      from_wallet?: string;
      to_wallet?: string;
      dompet?: string;
      nominal: number;
      saldo_sebelum?: number;
      saldo_sesudah?: number;
      selisih?: number;
      keterangan: string;
      actor: string;
    };

    const list: UnifiedMutation[] = [];

    if (mutationFilter === 'all' || mutationFilter === 'transfer') {
      transfers.forEach((t) => {
        list.push({
          id: t.id,
          tanggal: t.tanggal,
          tipe: 'transfer',
          from_wallet: t.from_wallet,
          to_wallet: t.to_wallet,
          nominal: t.jumlah,
          keterangan: t.keterangan || 'Transfer saldo antar dompet',
          actor: t.actor_nama || 'Kasir / Petugas',
        });
      });
    }

    if (mutationFilter === 'all' || mutationFilter === 'adjustment') {
      adjustments.forEach((a) => {
        list.push({
          id: a.id,
          tanggal: a.tanggal,
          tipe: 'adjustment',
          dompet: a.dompet,
          nominal: a.saldo_sesudah,
          saldo_sebelum: a.saldo_sebelum,
          saldo_sesudah: a.saldo_sesudah,
          selisih: a.selisih,
          keterangan: a.alasan || 'Koreksi saldo dompet',
          actor: a.actor_nama || 'Owner / Admin',
        });
      });
    }

    list.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    if (!mutationSearch.trim()) return list;
    const q = mutationSearch.toLowerCase();
    return list.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.keterangan.toLowerCase().includes(q) ||
        m.actor.toLowerCase().includes(q) ||
        (m.from_wallet && m.from_wallet.toLowerCase().includes(q)) ||
        (m.to_wallet && m.to_wallet.toLowerCase().includes(q)) ||
        (m.dompet && m.dompet.toLowerCase().includes(q))
    );
  }, [transfers, adjustments, mutationFilter, mutationSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await desktopSyncService.syncExpensesFromDesktop().catch(() => {});
    await loadExpenses(false);
  };

  // Auto-refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadExpenses(false);
    }, [])
  );

  // Live WebSocket auto-refresh when Desktop updates expenses or orders
  useEffect(() => {
    loadExpenses(true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'expenses' || event === 'orders' || event === 'wallets') {
        loadExpenses(false);
      }
    });
    return unsub;
  }, []);

  const toggleExpandNote = (id: number) => {
    setExpandedNotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAddModal = () => {
    setFormAmount('');
    setFormNote('');
    setFormCat(categories[0] || 'Operasional Lain');
    setFormSumberDana('laci_kasir');
    setFormDateOption('today');
    setFormCustomDate(formatOnlyDate(new Date()));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    const amount = parseCurrencyInput(formAmount);
    if (amount <= 0) {
      showToast({ type: 'warning', title: 'Jumlah Belum Valid', message: 'Masukkan nominal pengeluaran lebih dari 0.' });
      return;
    }

    // Resolve date custom if chosen
    let resolvedTanggal: string | undefined;
    if (formDateOption === 'yesterday') {
      const yesterdayDate = new Date(Date.now() - 86400000);
      resolvedTanggal = `${formatOnlyDate(yesterdayDate)} 12:00:00`;
    } else if (formDateOption === 'custom' && formCustomDate.trim()) {
      resolvedTanggal = `${formCustomDate.trim()} 12:00:00`;
    }

    try {
      setIsSaving(true);
      await expenseService.createExpense(
        formCat,
        amount,
        formNote.trim() || formCat,
        currentUser.id,
        formSumberDana,
        resolvedTanggal
      );

      showToast({ type: 'success', title: 'Sukses', message: `Pengeluaran ${formatIDR(amount)} berhasil dicatat.` });
      setModalVisible(false);
      setFormAmount('');
      setFormNote('');
      setFormSumberDana('laci_kasir');
      loadExpenses(false);
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (exp: Expense) => {
    if (!currentUser) return;

    try {
      const linkedItems = await detectLinkedStockItems(exp);

      const executeDelete = async (revertStock: boolean) => {
        try {
          if (revertStock && linkedItems.length > 0) {
            for (const item of linkedItems) {
              const targetStock = Math.max(0, item.currentStock - item.qty);
              await stockService.adjustStock(
                item.ingredientId,
                'adjustment',
                targetStock,
                `Pembatalan Belanja / Hapus Pengeluaran #${exp.id}`,
                currentUser.id
              );
              desktopSyncService.pushStockAdjustmentToDesktop({
                ingredient_id: item.ingredientId,
                nama: item.nama,
                target_stock: targetStock,
                tipe: 'adjustment',
                selisih: -item.qty,
                alasan: `Pembatalan Belanja / Hapus Pengeluaran #${exp.id}`,
              }).catch(() => {});
            }
          }

          await expenseService.deleteExpense(exp.id, currentUser.id);

          if (revertStock && linkedItems.length > 0) {
            const summary = linkedItems.map((i) => `${i.nama} (-${i.qty} ${i.satuan})`).join(', ');
            showToast({
              type: 'info',
              title: 'Dihapus & Stok Dikurangi',
              message: `Catatan pengeluaran dihapus. Stok dikembalikan: ${summary}.`,
            });
          } else {
            showToast({
              type: 'info',
              title: 'Dihapus',
              message: `Catatan pengeluaran berhasil dihapus${linkedItems.length > 0 ? ' (stok tidak diubah)' : ''}.`,
            });
          }

          loadExpenses(false);
        } catch (e: any) {
          showToast({ type: 'error', title: 'Gagal Hapus', message: e?.message || 'Terjadi kesalahan.' });
        }
      };

      if (linkedItems.length > 0) {
        const itemDesc = linkedItems.map((i) => `• ${i.nama}: +${i.qty} ${i.satuan} (Stok: ${i.currentStock})`).join('\n');
        Alert.alert(
          'Hapus Pengeluaran & Stok?',
          `Pengeluaran ini terhubung dengan stok bahan:\n${itemDesc}\n\nPilih tindakan terhadap stok bahan:`,
          [
            { text: 'Batal', style: 'cancel' },
            {
              text: 'Hanya Hapus Pengeluaran',
              onPress: () => executeDelete(false),
            },
            {
              text: 'Hapus & Kurangi Balik Stok',
              style: 'destructive',
              onPress: () => executeDelete(true),
            },
          ]
        );
      } else {
        Alert.alert(
          'Hapus Pengeluaran',
          `Apakah Anda yakin ingin menghapus catatan pengeluaran ${formatIDR(exp.jumlah)} (${exp.kategori})?`,
          [
            { text: 'Batal', style: 'cancel' },
            {
              text: 'Hapus',
              style: 'destructive',
              onPress: () => executeDelete(false),
            },
          ]
        );
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal memproses data pengeluaran.' });
    }
  };

  const promptDeleteMutation = (mut: {
    id: string;
    tipe: 'transfer' | 'adjustment';
    nominal: number;
    from_wallet?: string;
    to_wallet?: string;
    dompet?: string;
    actor: string;
    keterangan: string;
  }) => {
    const getWalletName = (w?: string) => {
      if (w === 'laci_kasir') return 'Laci Kasir';
      if (w === 'saldo_manager') return 'Saldo Manager';
      if (w === 'rekening_owner') return 'Rekening Owner';
      return w || '-';
    };

    const dompetInfo = mut.tipe === 'transfer'
      ? `${getWalletName(mut.from_wallet)} → ${getWalletName(mut.to_wallet)}`
      : getWalletName(mut.dompet);

    setMutationToDelete({
      id: mut.id,
      tipe: mut.tipe,
      nominal: mut.nominal,
      dompetInfo,
      actor: mut.actor,
      keterangan: mut.keterangan,
    });
  };

  const handleConfirmDeleteMutation = async () => {
    if (!mutationToDelete || !currentUser) return;
    setIsDeletingMutation(true);
    try {
      if (mutationToDelete.tipe === 'transfer') {
        const res = await walletService.deleteWalletTransfer(mutationToDelete.id, currentUser.id);
        if (res.success) {
          showToast({
            type: 'info',
            title: 'Transfer Dihapus',
            message: `Mutasi transfer ${mutationToDelete.id} berhasil dihapus.`,
          });
          await loadBalances();
          await loadMutations();
          setMutationToDelete(null);
        } else {
          showToast({
            type: 'error',
            title: 'Gagal Hapus Transfer',
            message: res.error || 'Terjadi kesalahan.',
          });
        }
      } else {
        const res = await walletService.deleteBalanceAdjustment(mutationToDelete.id, currentUser.id);
        if (res.success) {
          showToast({
            type: 'info',
            title: 'Koreksi Saldo Dihapus',
            message: `Catatan koreksi saldo ${mutationToDelete.id} berhasil dihapus.`,
          });
          await loadBalances();
          await loadMutations();
          setMutationToDelete(null);
        } else {
          showToast({
            type: 'error',
            title: 'Gagal Hapus Koreksi Saldo',
            message: res.error || 'Terjadi kesalahan.',
          });
        }
      }
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Error Hapus Mutasi',
        message: e?.message || 'Terjadi kesalahan sistem saat menghapus.',
      });
    } finally {
      setIsDeletingMutation(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Pengeluaran & Kas" onBack={onBack} />

      {/* Top Section: 3 Wallets & Tab Switcher */}
      <View style={styles.topSection}>
        {/* 3 Wallets Balance Cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.balanceScroll}>
          {/* Laci Kasir */}
          <View style={[styles.balanceCard, styles.balanceCardCash]}>
            <View style={styles.balanceHeader}>
              <View style={[styles.balanceIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Banknote size={14} color="#D97706" />
              </View>
              <Text style={styles.balanceLabel}>Laci Kasir</Text>
            </View>
            <Text style={[styles.balanceValue, { color: '#B45309' }]} numberOfLines={1}>
              {formatIDR(balances.saldoLaciKasir || 0)}
            </Text>
            <Text style={styles.balanceSub}>Uang Fisik Kasir</Text>
          </View>

          {/* Saldo Manager (Khusus Owner / Admin) */}
          {isAdmin && (
            <View style={[styles.balanceCard, styles.balanceCardManager]}>
              <View style={styles.balanceHeader}>
                <View style={[styles.balanceIconBox, { backgroundColor: '#DCFCE7' }]}>
                  <Wallet size={14} color="#16A34A" />
                </View>
                <Text style={styles.balanceLabel}>Saldo Manager</Text>
              </View>
              <Text style={[styles.balanceValue, { color: '#15803D' }]} numberOfLines={1}>
                {formatIDR(balances.saldoManager || 0)}
              </Text>
              <Text style={styles.balanceSub}>Petty Cash Toko</Text>
            </View>
          )}

          {/* Rekening Owner / Saldo QRIS */}
          <View style={[styles.balanceCard, styles.balanceCardOwner]}>
            <View style={styles.balanceHeader}>
              <View style={[styles.balanceIconBox, { backgroundColor: '#DBEAFE' }]}>
                <CreditCard size={14} color="#2563EB" />
              </View>
              <Text style={styles.balanceLabel}>{isAdmin ? 'Rekening Owner' : 'Saldo QRIS'}</Text>
            </View>
            <Text style={[styles.balanceValue, { color: '#1D4ED8' }]} numberOfLines={1}>
              {formatIDR(balances.saldoRekeningOwner || 0)}
            </Text>
            <Text style={styles.balanceSub}>QRIS & Online</Text>
          </View>
        </ScrollView>

        {/* Main Tab Segmented Control (Hanya tampil jika Admin/Owner) */}
        {isAdmin && (
          <View style={styles.segmentedTabContainer}>
            <TouchableOpacity
              style={[styles.segmentedTabBtn, activeMainTab === 'expenses' && styles.segmentedTabBtnActiveExpenses]}
              onPress={() => setActiveMainTab('expenses')}
              activeOpacity={0.7}
            >
              <Receipt size={14} color={activeMainTab === 'expenses' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.segmentedTabText, activeMainTab === 'expenses' && styles.segmentedTabTextActive]}>
                Pengeluaran
              </Text>
              <View style={[styles.segmentedBadge, activeMainTab === 'expenses' ? styles.segmentedBadgeActive : styles.segmentedBadgeInactive]}>
                <Text style={[styles.segmentedBadgeText, activeMainTab === 'expenses' && { color: '#FFFFFF' }]}>
                  {filteredExpenses.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentedTabBtn, activeMainTab === 'mutations' && styles.segmentedTabBtnActiveMutations]}
              onPress={() => setActiveMainTab('mutations')}
              activeOpacity={0.7}
            >
              <ArrowRightLeft size={14} color={activeMainTab === 'mutations' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.segmentedTabText, activeMainTab === 'mutations' && styles.segmentedTabTextActive]}>
                Mutasi & Saldo
              </Text>
              <View style={[styles.segmentedBadge, activeMainTab === 'mutations' ? styles.segmentedBadgeActive : styles.segmentedBadgeInactive]}>
                <Text style={[styles.segmentedBadgeText, activeMainTab === 'mutations' && { color: '#FFFFFF' }]}>
                  {transfers.length + adjustments.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Baris Khusus Aksi Dompet: Transfer & Kelola Saldo (Hanya Admin / Owner) */}
        {isAdmin && (
          <View style={styles.walletActionsRow}>
            <TouchableOpacity
              style={styles.actionCardTransfer}
              onPress={() => setTransferModalVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.actionIconWrapperTransfer}>
                <ArrowRightLeft size={14} color="#1D4ED8" />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitleTransfer}>Transfer Saldo</Text>
                <Text style={styles.actionSubTransfer}>Pindah kas antar dompet</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCardAdjust}
              onPress={() => setAdjustModalVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.actionIconWrapperAdjust}>
                <SlidersHorizontal size={14} color="#7E22CE" />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitleAdjust}>Kelola Saldo</Text>
                <Text style={styles.actionSubAdjust}>Koreksi / opname kas</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 1 FILTERS & SUMMARY */}
        {activeMainTab === 'expenses' && (
          <View style={{ gap: 6 }}>
            {/* Summary Card with Record Button */}
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryLabel}>
                  {dateFilterPreset === 'today' ? 'PENGELUARAN HARI INI' :
                   dateFilterPreset === 'yesterday' ? 'PENGELUARAN KEMARIN' :
                   dateFilterPreset === '7days' ? 'PENGELUARAN 7 HARI' :
                   dateFilterPreset === 'thisMonth' ? 'PENGELUARAN BULAN INI' : 'TOTAL PENGELUARAN'}
                </Text>
                <Text style={styles.summaryAmount}>{formatIDR(totalFilteredSum)}</Text>
              </View>
              <TouchableOpacity
                style={styles.addExpBtn}
                onPress={handleOpenAddModal}
                activeOpacity={0.7}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.addExpBtnText}>Catat Pengeluaran</Text>
              </TouchableOpacity>
            </View>

            {/* Live Search Bar */}
            <View style={styles.searchBar}>
              <Search size={14} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari keterangan, bahan, atau petugas..."
                placeholderTextColor="#94A3B8"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Filter Bar: Dropdown Periode Waktu & Sumber Dompet */}
            <View style={styles.quickFilterRow}>
              {/* Dropdown Periode */}
              <TouchableOpacity
                style={[
                  styles.filterDropdownBtn,
                  dateFilterPreset !== 'all' && styles.filterDropdownBtnActiveDate,
                ]}
                onPress={() => setDatePickerVisible(true)}
                activeOpacity={0.75}
              >
                <Calendar size={13} color={dateFilterPreset !== 'all' ? '#B45309' : '#64748B'} />
                <Text
                  style={[
                    styles.filterDropdownBtnText,
                    dateFilterPreset !== 'all' && styles.filterDropdownBtnTextActiveDate,
                  ]}
                  numberOfLines={1}
                >
                  {dateFilterPreset === 'all'
                    ? 'Semua Waktu'
                    : dateFilterPreset === 'today'
                    ? 'Hari Ini'
                    : dateFilterPreset === 'yesterday'
                    ? 'Kemarin'
                    : dateFilterPreset === '7days'
                    ? '7 Hari Terakhir'
                    : 'Bulan Ini'}
                </Text>
                <ChevronDown size={12} color={dateFilterPreset !== 'all' ? '#B45309' : '#94A3B8'} />
              </TouchableOpacity>

              {/* Dropdown Sumber Dompet */}
              <TouchableOpacity
                style={[
                  styles.filterDropdownBtn,
                  selectedSumberDana !== 'all' && styles.filterDropdownBtnActiveWallet,
                ]}
                onPress={() => setWalletPickerVisible(true)}
                activeOpacity={0.75}
              >
                <Wallet size={13} color={selectedSumberDana !== 'all' ? '#1D4ED8' : '#64748B'} />
                <Text
                  style={[
                    styles.filterDropdownBtnText,
                    selectedSumberDana !== 'all' && styles.filterDropdownBtnTextActiveWallet,
                  ]}
                  numberOfLines={1}
                >
                  {selectedSumberDana === 'all'
                    ? 'Semua Dompet'
                    : selectedSumberDana === 'laci_kasir'
                    ? 'Laci Kasir'
                    : selectedSumberDana === 'saldo_manager'
                    ? 'Saldo Manager'
                    : 'Rekening Owner'}
                </Text>
                <ChevronDown size={12} color={selectedSumberDana !== 'all' ? '#1D4ED8' : '#94A3B8'} />
              </TouchableOpacity>

              {/* Reset filter button if any active */}
              {(dateFilterPreset !== 'all' || selectedSumberDana !== 'all') && (
                <TouchableOpacity
                  style={styles.filterResetBtn}
                  onPress={() => {
                    setDateFilterPreset('all');
                    setSelectedSumberDana('all');
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={13} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChips}>
              <TouchableOpacity
                style={[styles.catChip, selectedCat === 'all' && styles.catChipActive]}
                onPress={() => setSelectedCat('all')}
              >
                <Text style={[styles.catChipText, selectedCat === 'all' && styles.catChipTextActive]}>
                  Semua Kategori
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={`cat-filter-${cat}`}
                  style={[styles.catChip, selectedCat === cat && styles.catChipActive]}
                  onPress={() => setSelectedCat(cat)}
                >
                  <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addCatChip}
                onPress={() => setCatModalVisible(true)}
                activeOpacity={0.7}
              >
                <FolderPlus size={13} color="#D97706" />
                <Text style={styles.addCatChipText}>+ Kategori</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* TAB 2 FILTERS: Search & Mutation Type Filter (Khusus Admin) */}
        {activeMainTab === 'mutations' && isAdmin && (
          <View style={styles.mutationFilterContainer}>
            <View style={styles.searchBar}>
              <Search size={14} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={mutationSearch}
                onChangeText={setMutationSearch}
                placeholder="Cari ID mutasi, alasan, atau petugas..."
                placeholderTextColor="#94A3B8"
              />
              {mutationSearch.length > 0 && (
                <TouchableOpacity onPress={() => setMutationSearch('')}>
                  <X size={14} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterPillRow}>
              {(['all', 'transfer', 'adjustment'] as const).map((type) => {
                const label = type === 'all' ? 'Semua' : type === 'transfer' ? 'Transfer Saldo' : 'Koreksi Saldo';
                const isActive = mutationFilter === type;
                return (
                  <TouchableOpacity
                    key={`mf-${type}`}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => setMutationFilter(type)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* TAB 1 CONTENT: Expenses List */}
      {activeMainTab === 'expenses' && (
        loading ? (
          <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
            }
          >
            {filteredExpenses.length === 0 ? (
              <View style={styles.emptyBox}>
                <CreditCard size={40} color="#94A3B8" />
                <Text style={styles.emptyText}>Tidak ada catatan pengeluaran</Text>
                <Text style={styles.emptySubText}>
                  {searchQuery || selectedCat !== 'all' || selectedSumberDana !== 'all' || dateFilterPreset !== 'all'
                    ? 'Coba ubah atau bersihkan filter pencarian.'
                    : 'Gunakan tombol "+ Catat Pengeluaran" di atas.'}
                </Text>
              </View>
            ) : (
              filteredExpenses.map((exp) => {
                const parsed = parseRestockNote(exp.keterangan);
                const isExpanded = !!expandedNotes[exp.id];
                const canDelete = isAdmin || exp.input_by === currentUser?.id;

                return (
                  <View key={`exp-${exp.id}`} style={styles.expCard}>
                    <View style={styles.expMain}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        {/* Badges: Kategori & Sumber Dana */}
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                          <View style={styles.catBadge}>
                            <Text style={styles.catBadgeText}>{exp.kategori}</Text>
                          </View>
                          <View style={[
                            styles.catBadge,
                            { flexDirection: 'row', alignItems: 'center', gap: 4 },
                            exp.sumber_dana === 'rekening_owner' ? { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 } :
                            exp.sumber_dana === 'saldo_manager' ? { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 } :
                            { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 }
                          ]}>
                            {exp.sumber_dana === 'rekening_owner' ? (
                              <CreditCard size={10} color="#2563EB" />
                            ) : exp.sumber_dana === 'saldo_manager' ? (
                              <Wallet size={10} color="#16A34A" />
                            ) : (
                              <Banknote size={10} color="#D97706" />
                            )}
                            <Text style={[
                              styles.catBadgeText,
                              exp.sumber_dana === 'rekening_owner' ? { color: '#1D4ED8' } :
                              exp.sumber_dana === 'saldo_manager' ? { color: '#15803D' } :
                              { color: '#B45309' }
                            ]}>
                              {exp.sumber_dana === 'rekening_owner' ? 'Rekening Owner' : exp.sumber_dana === 'saldo_manager' ? 'Saldo Manager' : 'Laci Kasir'}
                            </Text>
                          </View>
                        </View>

                        {/* Content: Restock items collapsible or Normal note */}
                        {parsed.isRestock && parsed.items.length > 0 ? (
                          <View style={styles.restockContainer}>
                            <View style={styles.restockHeader}>
                              <View style={styles.restockBadge}>
                                <ShoppingBag size={11} color="#4F46E5" />
                                <Text style={styles.restockBadgeText}>Restock Belanja</Text>
                              </View>
                              <Text style={styles.restockCountBadge}>{parsed.itemCount} Bahan</Text>
                            </View>

                            <Text style={styles.restockTitleText}>{parsed.noteTitle}</Text>

                            {isExpanded ? (
                              <View style={styles.expandedItemsBox}>
                                <View style={styles.chipsWrap}>
                                  {parsed.items.map((item, idx) => (
                                    <View key={idx} style={styles.itemChip}>
                                      <Text style={styles.itemChipText}>{item}</Text>
                                    </View>
                                  ))}
                                </View>
                                <TouchableOpacity
                                  onPress={() => toggleExpandNote(exp.id)}
                                  style={styles.toggleCollapseBtn}
                                  activeOpacity={0.7}
                                >
                                  <ChevronUp size={13} color="#D97706" />
                                  <Text style={styles.toggleCollapseText}>Sembunyikan rincian bahan</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={styles.collapsedItemsBox}>
                                <Text style={styles.collapsedPreviewText} numberOfLines={1}>
                                  {parsed.items.slice(0, 3).join(', ')}
                                  {parsed.items.length > 3 ? ` ... (+${parsed.items.length - 3} lainnya)` : ''}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => toggleExpandNote(exp.id)}
                                  style={styles.toggleExpandBtn}
                                  activeOpacity={0.7}
                                >
                                  <ChevronDown size={12} color="#475569" />
                                  <Text style={styles.toggleExpandText}>Lihat {parsed.itemCount} Bahan</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.expDesc}>{exp.keterangan || '-'}</Text>
                        )}

                        <Text style={styles.expMeta}>
                          {formatDateIndo(exp.tanggal)} • Input: {exp.input_by_name || 'Petugas'}
                        </Text>
                      </View>

                      <View style={styles.amountCol}>
                        <Text style={styles.amountText}>{formatIDR(exp.jumlah)}</Text>
                        {canDelete && (
                          <TouchableOpacity
                            style={styles.delBtn}
                            onPress={() => handleDelete(exp)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={14} color="#DC2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {/* TAB 2 CONTENT: Mutations & Balance Adjustments List (Khusus Admin) */}
      {activeMainTab === 'mutations' && isAdmin && (
        mutationsLoading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
            }
          >
            {combinedMutations.length === 0 ? (
              <View style={styles.emptyBox}>
                <ArrowRightLeft size={40} color="#94A3B8" />
                <Text style={styles.emptyText}>Belum ada riwayat mutasi / koreksi</Text>
              </View>
            ) : (
              combinedMutations.map((m) => {
                const isTransfer = m.tipe === 'transfer';
                return (
                  <View key={`mut-${m.id}`} style={styles.mutCard}>
                    <View style={styles.mutHeaderRow}>
                      <View style={[styles.mutTypeBadge, isTransfer ? styles.mutTypeBadgeTransfer : styles.mutTypeBadgeAdjust]}>
                        {isTransfer ? (
                          <ArrowRightLeft size={11} color="#2563EB" />
                        ) : (
                          <SlidersHorizontal size={11} color="#7E22CE" />
                        )}
                        <Text style={[styles.mutTypeBadgeText, isTransfer ? { color: '#1D4ED8' } : { color: '#6B21A8' }]}>
                          {isTransfer ? 'Transfer Antar Dompet' : 'Koreksi Saldo (Opname)'}
                        </Text>
                      </View>
                      <Text style={styles.mutDateText}>{formatDateIndo(m.tanggal)}</Text>
                    </View>

                    {isTransfer ? (
                      <View style={styles.transferFlowRow}>
                        <View style={styles.walletPill}>
                          <Text style={styles.walletPillText}>{m.from_wallet === 'laci_kasir' ? 'Laci Kasir' : m.from_wallet === 'saldo_manager' ? 'Saldo Manager' : 'Rekening Owner'}</Text>
                        </View>
                        <Text style={{ color: '#94A3B8', fontWeight: '800' }}>→</Text>
                        <View style={[styles.walletPill, { backgroundColor: '#DBEAFE' }]}>
                          <Text style={[styles.walletPillText, { color: '#1D4ED8' }]}>{m.to_wallet === 'laci_kasir' ? 'Laci Kasir' : m.to_wallet === 'saldo_manager' ? 'Saldo Manager' : 'Rekening Owner'}</Text>
                        </View>
                        <View style={{ flex: 1 }} />
                        <Text style={styles.mutAmountTransfer}>Rp {m.nominal.toLocaleString('id-ID')}</Text>
                        {isAdmin && (
                          <TouchableOpacity
                            onPress={() =>
                              promptDeleteMutation({
                                id: m.id,
                                tipe: 'transfer',
                                nominal: m.nominal,
                                from_wallet: m.from_wallet,
                                to_wallet: m.to_wallet,
                                actor: m.actor,
                                keterangan: m.keterangan,
                              })
                            }
                            style={{ padding: 6, marginLeft: 6 }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color="#DC2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <View style={styles.adjustDetailsCol}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={styles.walletPill}>
                            <Text style={styles.walletPillText}>{m.dompet === 'laci_kasir' ? 'Laci Kasir' : m.dompet === 'saldo_manager' ? 'Saldo Manager' : 'Rekening Owner'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[
                              styles.diffBadge,
                              (m.selisih || 0) >= 0 ? styles.diffBadgeSurplus : styles.diffBadgeDeficit
                            ]}>
                              <Text style={[
                                styles.diffBadgeText,
                                (m.selisih || 0) >= 0 ? { color: '#15803D' } : { color: '#DC2626' }
                              ]}>
                                {(m.selisih || 0) >= 0 ? '+' : ''}{formatIDR(m.selisih || 0)}
                              </Text>
                            </View>
                            {isAdmin && (
                              <TouchableOpacity
                                onPress={() =>
                                  promptDeleteMutation({
                                    id: m.id,
                                    tipe: 'adjustment',
                                    nominal: m.nominal,
                                    dompet: m.dompet,
                                    actor: m.actor,
                                    keterangan: m.keterangan,
                                  })
                                }
                                style={{ padding: 6, marginLeft: 2 }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Trash2 size={15} color="#DC2626" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        <Text style={styles.adjustBeforeAfter}>
                          Sebelum: <Text style={{ fontWeight: '700' }}>{formatIDR(m.saldo_sebelum || 0)}</Text> → Sesudah: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{formatIDR(m.saldo_sesudah || 0)}</Text>
                        </Text>
                      </View>
                    )}

                    {/* Footer: Keterangan & Petugas */}
                    <View style={styles.mutFooterRow}>
                      <Text style={styles.mutNoteText} numberOfLines={2}>
                        {m.keterangan}
                      </Text>
                      <Text style={styles.mutActorText}>
                        Oleh: {m.actor}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {/* MODAL 1: Catat Pengeluaran Baru (Wrapped with KeyboardAvoidingView & ScrollView) */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.catModalIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Receipt size={18} color="#D97706" />
                </View>
                <Text style={styles.modalTitle}>Catat Pengeluaran</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Body to prevent keyboard overflow */}
            <ScrollView
              style={styles.modalScrollBody}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Nominal Input */}
              <Text style={styles.label}>Nominal Pengeluaran (Rp) *</Text>
              <TextInput
                style={[styles.input, styles.amountInput]}
                placeholder="0"
                placeholderTextColor="#CBD5E1"
                keyboardType="numeric"
                value={formAmount}
                onChangeText={(val) => setFormAmount(formatCurrencyInput(val))}
              />

              {/* Kategori Pengeluaran */}
              <View style={styles.catHeaderRow}>
                <Text style={styles.label}>Kategori Pengeluaran *</Text>
                <TouchableOpacity
                  style={styles.addCatInlineBtn}
                  onPress={() => setCatModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Plus size={12} color="#D97706" />
                  <Text style={styles.addCatInlineText}>+ Buat Kategori</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.catOptions}>
                {categories.map((c) => {
                  const isSelected = formCat === c;
                  return (
                    <TouchableOpacity
                      key={`opt-${c}`}
                      style={[styles.catOptBtn, isSelected && styles.catOptBtnActive]}
                      onPress={() => setFormCat(c)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catOptText, isSelected && styles.catOptTextActive]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Keterangan / Deskripsi */}
              <Text style={styles.label}>Keterangan / Keperluan</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="Contoh: Beli gas LPG 3kg, token listrik, kasbon karyawan..."
                placeholderTextColor="#94A3B8"
                value={formNote}
                onChangeText={setFormNote}
                multiline
              />

              {/* Sumber Dana Selector */}
              <Text style={styles.label}>Sumber Dana Pemotongan *</Text>
              <View style={styles.sumberDanaGroup}>
                <TouchableOpacity
                  style={[
                    styles.sumberDanaBtn,
                    formSumberDana === 'laci_kasir' && styles.sumberDanaBtnActiveCash,
                  ]}
                  onPress={() => setFormSumberDana('laci_kasir')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.sumberDanaIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Banknote size={16} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sumberDanaTitle, formSumberDana === 'laci_kasir' && { color: '#B45309' }]}>
                      Laci Kasir
                    </Text>
                    <Text style={styles.sumberDanaSub}>Uang fisik laci kasir</Text>
                  </View>
                  {formSumberDana === 'laci_kasir' && <Check size={16} color="#B45309" />}
                </TouchableOpacity>

                {isAdmin && (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.sumberDanaBtn,
                        formSumberDana === 'saldo_manager' && styles.sumberDanaBtnActiveManager,
                      ]}
                      onPress={() => setFormSumberDana('saldo_manager')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.sumberDanaIcon, { backgroundColor: '#DCFCE7' }]}>
                        <Wallet size={16} color="#16A34A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sumberDanaTitle, formSumberDana === 'saldo_manager' && { color: '#15803D' }]}>
                          Saldo Manager
                        </Text>
                        <Text style={styles.sumberDanaSub}>Petty cash operasional</Text>
                      </View>
                      {formSumberDana === 'saldo_manager' && <Check size={16} color="#15803D" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.sumberDanaBtn,
                        formSumberDana === 'rekening_owner' && styles.sumberDanaBtnActiveOwner,
                      ]}
                      onPress={() => setFormSumberDana('rekening_owner')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.sumberDanaIcon, { backgroundColor: '#DBEAFE' }]}>
                        <CreditCard size={16} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sumberDanaTitle, formSumberDana === 'rekening_owner' && { color: '#1D4ED8' }]}>
                          Rekening Owner
                        </Text>
                        <Text style={styles.sumberDanaSub}>QRIS / transfer bank</Text>
                      </View>
                      {formSumberDana === 'rekening_owner' && <Check size={16} color="#1D4ED8" />}
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Pilihan Tanggal Transaksi */}
              <Text style={styles.label}>Tanggal Pengeluaran</Text>
              <View style={styles.dateOptionRow}>
                <TouchableOpacity
                  style={[styles.dateOptBtn, formDateOption === 'today' && styles.dateOptBtnActive]}
                  onPress={() => setFormDateOption('today')}
                >
                  <Text style={[styles.dateOptBtnText, formDateOption === 'today' && styles.dateOptBtnTextActive]}>
                    Hari Ini
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dateOptBtn, formDateOption === 'yesterday' && styles.dateOptBtnActive]}
                  onPress={() => setFormDateOption('yesterday')}
                >
                  <Text style={[styles.dateOptBtnText, formDateOption === 'yesterday' && styles.dateOptBtnTextActive]}>
                    Kemarin
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dateOptBtn, formDateOption === 'custom' && styles.dateOptBtnActive]}
                  onPress={() => setFormDateOption('custom')}
                >
                  <Text style={[styles.dateOptBtnText, formDateOption === 'custom' && styles.dateOptBtnTextActive]}>
                    Tanggal Lain
                  </Text>
                </TouchableOpacity>
              </View>

              {formDateOption === 'custom' && (
                <TextInput
                  style={[styles.input, { marginTop: 6 }]}
                  placeholder="YYYY-MM-DD (Contoh: 2026-09-23)"
                  placeholderTextColor="#94A3B8"
                  value={formCustomDate}
                  onChangeText={setFormCustomDate}
                />
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Simpan Pengeluaran</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: Buat Kategori Baru (Keyboard Avoiding & Scrollable) */}
      <Modal visible={catModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.catModalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.catModalIconBox}>
                  <FolderPlus size={18} color="#D97706" />
                </View>
                <Text style={styles.modalTitle}>Buat Kategori Baru</Text>
              </View>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingVertical: 12 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Nama Kategori Pengeluaran *</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Bensin & Transport, Servis Mesin..."
                placeholderTextColor="#94A3B8"
                value={newCatName}
                onChangeText={setNewCatName}
                autoFocus
              />

              {/* Suggestions */}
              <Text style={styles.suggestLabel}>Rekomendasi Kategori Toko:</Text>
              <View style={styles.suggestWrap}>
                {[
                  'Bensin & Transport',
                  'Servis & Perbaikan',
                  'Packing & Plastik',
                  'Marketing & Promo',
                  'Kebersihan & Galon',
                  'Pajak & Retribusi',
                ].map((sug) => (
                  <TouchableOpacity
                    key={`sug-${sug}`}
                    style={styles.sugChip}
                    onPress={() => setNewCatName(sug)}
                  >
                    <Text style={styles.sugChipText}>+ {sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Daftar Kategori Tersimpan */}
              <Text style={[styles.label, { marginTop: 12 }]}>
                Daftar Kategori Saat Ini ({categories.length})
              </Text>
              <ScrollView style={{ maxHeight: 110 }} nestedScrollEnabled>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((cat) => {
                    const isDefault = DEFAULT_EXPENSE_CATEGORIES.includes(cat);
                    return (
                      <View key={`badge-cat-${cat}`} style={styles.existingCatBadge}>
                        <Text style={styles.existingCatText}>{cat}</Text>
                        {!isDefault && (
                          <TouchableOpacity
                            onPress={() => handleDeleteCategory(cat)}
                            style={{ padding: 2 }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <X size={11} color="#DC2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.submitBtn, { marginTop: 16 }]}
                onPress={handleAddCategory}
                disabled={isSavingCat}
                activeOpacity={0.8}
              >
                {isSavingCat ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Simpan Kategori</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Transfer Wallet Modal */}
      <TransferWalletModal
        visible={transferModalVisible}
        onClose={() => setTransferModalVisible(false)}
        onSuccess={() => {
          loadBalances();
          loadExpenses(false);
          loadMutations();
        }}
        currentBalances={balances}
      />

      {/* Adjust Wallet (Kelola Saldo) Modal */}
      <AdjustWalletModal
        visible={adjustModalVisible}
        onClose={() => setAdjustModalVisible(false)}
        onSuccess={() => {
          loadBalances();
          loadExpenses(false);
          loadMutations();
        }}
        currentBalances={balances}
      />

      {/* MODAL PICKER: Pilihan Periode Waktu */}
      <Modal visible={datePickerVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setDatePickerVisible(false)}>
          <View style={styles.pickerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerModalCard}>
                <View style={styles.pickerHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.catModalIconBox, { backgroundColor: '#FEF3C7' }]}>
                      <Calendar size={18} color="#D97706" />
                    </View>
                    <Text style={styles.pickerTitle}>Pilih Periode Waktu</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDatePickerVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {([
                  { id: 'all', title: 'Semua Waktu', sub: 'Tampilkan seluruh riwayat pengeluaran' },
                  { id: 'today', title: 'Hari Ini', sub: 'Transaksi pengeluaran hari ini' },
                  { id: 'yesterday', title: 'Kemarin', sub: 'Transaksi pengeluaran kemarin' },
                  { id: '7days', title: '7 Hari Terakhir', sub: 'Pengeluaran seminggu terakhir' },
                  { id: 'thisMonth', title: 'Bulan Ini', sub: 'Total pengeluaran bulan berjalan' },
                ] as const).map((opt) => {
                  const isActive = dateFilterPreset === opt.id;
                  return (
                    <TouchableOpacity
                      key={`date-opt-${opt.id}`}
                      style={[styles.pickerOptionItem, isActive && styles.pickerOptionItemActive]}
                      onPress={() => {
                        setDateFilterPreset(opt.id);
                        setDatePickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View>
                        <Text style={[styles.pickerOptionTitle, isActive && { color: '#B45309', fontWeight: '800' }]}>
                          {opt.title}
                        </Text>
                        <Text style={styles.pickerOptionSub}>{opt.sub}</Text>
                      </View>
                      {isActive && <Check size={18} color="#D97706" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL PICKER: Pilihan Sumber Dompet */}
      <Modal visible={walletPickerVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setWalletPickerVisible(false)}>
          <View style={styles.pickerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerModalCard}>
                <View style={styles.pickerHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.catModalIconBox, { backgroundColor: '#DBEAFE' }]}>
                      <Wallet size={18} color="#2563EB" />
                    </View>
                    <Text style={styles.pickerTitle}>Pilih Sumber Dompet</Text>
                  </View>
                  <TouchableOpacity onPress={() => setWalletPickerVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {([
                  { id: 'all' as const, title: 'Semua Dompet', sub: 'Gabungan pengeluaran seluruh kas toko' },
                  { id: 'laci_kasir' as const, title: 'Laci Kasir', sub: 'Pemotongan fisik kasir toko' },
                  ...(isAdmin
                    ? [
                        { id: 'saldo_manager' as const, title: 'Saldo Manager', sub: 'Petty cash operasional manager' },
                      ]
                    : []),
                  { id: 'rekening_owner' as const, title: isAdmin ? 'Rekening Owner' : 'Saldo QRIS', sub: 'QRIS & transfer rekening owner' },
                ]).map((opt) => {
                  const isActive = selectedSumberDana === opt.id;
                  return (
                    <TouchableOpacity
                      key={`wallet-opt-${opt.id}`}
                      style={[styles.pickerOptionItem, isActive && styles.pickerOptionItemActiveWallet]}
                      onPress={() => {
                        setSelectedSumberDana(opt.id);
                        setWalletPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View>
                        <Text style={[styles.pickerOptionTitle, isActive && { color: '#1D4ED8', fontWeight: '800' }]}>
                          {opt.title}
                        </Text>
                        <Text style={styles.pickerOptionSub}>{opt.sub}</Text>
                      </View>
                      {isActive && <Check size={18} color="#2563EB" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Konfirmasi Hapus Mutasi (Transfer / Koreksi Saldo) */}
      <Modal
        visible={!!mutationToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingMutation) setMutationToDelete(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => !isDeletingMutation && setMutationToDelete(null)}>
          <View style={styles.deleteModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.deleteModalContainer}>
                {/* Header Icon */}
                <View style={styles.deleteModalIconBox}>
                  <AlertTriangle size={28} color="#DC2626" />
                </View>

                {/* Title & Desc */}
                <Text style={styles.deleteModalTitle}>
                  Hapus {mutationToDelete?.tipe === 'transfer' ? 'Mutasi Transfer' : 'Koreksi Saldo'}?
                </Text>
                <Text style={styles.deleteModalDesc}>
                  Tindakan ini akan menghapus riwayat mutasi dari database sistem dan tidak dapat dipulihkan kembali.
                </Text>

                {/* Mutation Details Card */}
                {mutationToDelete && (
                  <View style={styles.deleteModalDetailsCard}>
                    <View style={styles.deleteDetailRow}>
                      <Text style={styles.deleteDetailLabel}>Nominal / Nilai</Text>
                      <Text style={styles.deleteDetailValueAmount}>
                        {formatIDR(mutationToDelete.nominal)}
                      </Text>
                    </View>
                    <View style={styles.deleteDetailDivider} />
                    <View style={styles.deleteDetailRow}>
                      <Text style={styles.deleteDetailLabel}>Dompet / Alur</Text>
                      <Text style={styles.deleteDetailValue}>
                        {mutationToDelete.dompetInfo}
                      </Text>
                    </View>
                    <View style={styles.deleteDetailDivider} />
                    <View style={styles.deleteDetailRow}>
                      <Text style={styles.deleteDetailLabel}>ID Referensi</Text>
                      <Text style={styles.deleteDetailCode}>
                        {mutationToDelete.id}
                      </Text>
                    </View>
                    <View style={styles.deleteDetailDivider} />
                    <View style={styles.deleteDetailRow}>
                      <Text style={styles.deleteDetailLabel}>Oleh Petugas</Text>
                      <Text style={styles.deleteDetailValue}>
                        {mutationToDelete.actor}
                      </Text>
                    </View>
                    {mutationToDelete.keterangan ? (
                      <>
                        <View style={styles.deleteDetailDivider} />
                        <View style={styles.deleteDetailRow}>
                          <Text style={styles.deleteDetailLabel}>Keterangan</Text>
                          <Text style={styles.deleteDetailValue} numberOfLines={2}>
                            {mutationToDelete.keterangan}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.deleteModalActionRow}>
                  <TouchableOpacity
                    style={styles.deleteModalCancelBtn}
                    onPress={() => setMutationToDelete(null)}
                    disabled={isDeletingMutation}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteModalCancelText}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.deleteModalConfirmBtn,
                      isDeletingMutation && { opacity: 0.6 }
                    ]}
                    onPress={handleConfirmDeleteMutation}
                    disabled={isDeletingMutation}
                    activeOpacity={0.8}
                  >
                    {isDeletingMutation ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Trash2 size={16} color="#FFFFFF" />
                        <Text style={styles.deleteModalConfirmText}>Ya, Hapus</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 1,
  },
  addExpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
  },
  addExpBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterDropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
  },
  filterDropdownBtnActiveDate: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  filterDropdownBtnActiveWallet: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  filterDropdownBtnText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterDropdownBtnTextActiveDate: {
    color: '#B45309',
    fontWeight: '800',
  },
  filterDropdownBtnTextActiveWallet: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  filterResetBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 10,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pickerOptionItemActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  pickerOptionItemActiveWallet: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  pickerOptionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerOptionSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  catChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 2,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  catChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  catChipTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  addCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
  },
  addCatChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
  },
  catHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addCatInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
  },
  addCatInlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  catModalContent: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  catModalIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  suggestWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  sugChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sugChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  existingCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  existingCatText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  listContainer: {
    padding: 14,
    gap: 9,
    paddingBottom: 40,
  },
  emptyBox: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  emptySubText: {
    marginTop: 4,
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
  },
  expCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  expMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  catBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  expDesc: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  expMeta: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 4,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  amountText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  delBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalScrollBody: {
    paddingTop: 12,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  catOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  catOptBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catOptBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  catOptText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  catOptTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  sumberDanaGroup: {
    gap: 7,
    marginBottom: 12,
  },
  sumberDanaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  sumberDanaBtnActiveCash: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  sumberDanaBtnActiveManager: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  sumberDanaBtnActiveOwner: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  sumberDanaIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sumberDanaTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  sumberDanaSub: {
    fontSize: 10,
    color: '#64748B',
  },
  dateOptionRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  dateOptBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  dateOptBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  dateOptBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  dateOptBtnTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // 3 Wallets Balance Styles
  balanceScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  balanceCard: {
    width: 130,
    padding: 9,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  balanceCardCash: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  balanceCardManager: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  balanceCardOwner: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  balanceIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontSize: 13.5,
    fontWeight: '900',
    marginBottom: 1,
  },
  balanceSub: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  // Restock Collapsible Styles
  restockContainer: {
    marginVertical: 3,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  restockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  restockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  restockBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338CA',
  },
  restockCountBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  restockTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  expandedItemsBox: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  itemChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },
  toggleCollapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  toggleCollapseText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  collapsedItemsBox: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  collapsedPreviewText: {
    flex: 1,
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  toggleExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  toggleExpandText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  // Segmented Tab Control
  segmentedTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    marginTop: 2,
  },
  segmentedTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentedTabBtnActiveExpenses: {
    backgroundColor: '#D97706',
    elevation: 2,
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  segmentedTabBtnActiveMutations: {
    backgroundColor: '#2563EB',
    elevation: 2,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  segmentedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  segmentedBadgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  segmentedBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  segmentedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },

  // Dedicated Wallet Actions Row (Transfer & Kelola Saldo)
  walletActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  actionCardTransfer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionIconWrapperTransfer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitleTransfer: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  actionSubTransfer: {
    fontSize: 9,
    color: '#3B82F6',
    fontWeight: '600',
  },
  actionCardAdjust: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionIconWrapperAdjust: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitleAdjust: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#7E22CE',
  },
  actionSubAdjust: {
    fontSize: 9,
    color: '#9333EA',
    fontWeight: '600',
  },
  // Search & Filter Bars
  mutationFilterContainer: {
    gap: 8,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  filterPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  filterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  // Mutation Cards
  mutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  mutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mutTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mutTypeBadgeTransfer: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  mutTypeBadgeAdjust: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  mutTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  mutDateText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  transferFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  walletPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  mutAmountTransfer: {
    fontSize: 15,
    fontWeight: '900',
    color: '#15803D',
  },
  adjustDetailsCol: {
    gap: 6,
  },
  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  diffBadgeSurplus: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  diffBadgeDeficit: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  diffBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  adjustBeforeAfter: {
    fontSize: 11,
    color: '#64748B',
  },
  mutFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mutNoteText: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    marginRight: 8,
  },
  mutActorText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteModalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  deleteModalIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  deleteModalDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  deleteModalDetailsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 20,
  },
  deleteDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  deleteDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  deleteDetailValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
    maxWidth: '60%',
    textAlign: 'right',
  },
  deleteDetailValueAmount: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '800',
  },
  deleteDetailCode: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  deleteDetailDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  deleteModalActionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  deleteModalConfirmBtn: {
    flex: 1.2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteModalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
