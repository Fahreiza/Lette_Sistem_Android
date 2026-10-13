import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Header } from '../../components/common/Header';
import { dataService, DatabaseStats } from '../../services/dataService';
import { desktopSyncService, notifySyncListeners } from '../../services/desktopSyncService';
import { showToast } from '../../stores/toastStore';
import {
  Database,
  Trash2,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  Receipt,
  Utensils,
  Package,
  FileClock,
  Wallet,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Info,
  X,
  Monitor,
  Download,
  Upload,
} from 'lucide-react-native';
import { useSyncStore } from '../../stores/syncStore';

export const DataManagementScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Custom Confirmation Modals
  const [clearLogsModalVisible, setClearLogsModalVisible] = useState(false);
  const [resetSalesModalVisible, setResetSalesModalVisible] = useState(false);
  const [clearMenuModalVisible, setClearMenuModalVisible] = useState(false);
  const [clearStockModalVisible, setClearStockModalVisible] = useState(false);
  const [resetAllModalVisible, setResetAllModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [syncTarget, setSyncTarget] = useState<'all' | 'local_only'>('all');
  const isConnected = useSyncStore((s) => s.isConnected);

  const handleExportBackup = async () => {
    try {
      setIsProcessing(true);
      const res = await dataService.exportFullDatabaseBackup();
      if (res.success) {
        showToast({ type: 'success', title: 'Backup Siap', message: 'File backup (.json) siap dibagikan / disimpan.' });
      } else {
        showToast({ type: 'error', title: 'Gagal', message: res.error || 'Gagal mengekspor data backup.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mengekspor backup.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const executeImportBackup = async () => {
    if (!importJsonText.trim()) {
      showToast({ type: 'error', title: 'Data Kosong', message: 'Silakan tempel teks backup JSON terlebih dahulu.' });
      return;
    }
    try {
      setIsProcessing(true);
      const res = await dataService.importFullDatabaseBackup(importJsonText.trim());
      if (res.success) {
        showToast({ type: 'success', title: 'Pulihkan Berhasil', message: res.message });
        setImportModalVisible(false);
        setImportJsonText('');
        loadStats();
      } else {
        showToast({ type: 'error', title: 'Gagal Pulihkan', message: res.message });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Pulihkan', message: e?.message || 'Terjadi kesalahan saat memulihkan database.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dataService.getDatabaseStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to load database stats:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat informasi data sistem.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const handleVacuum = async () => {
    try {
      setIsProcessing(true);
      await dataService.optimizeDatabase();
      showToast({ type: 'success', title: 'Sukses', message: 'Penyimpanan data sistem berhasil dioptimalkan.' });
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mengoptimalkan penyimpanan sistem.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearOldLogs = () => {
    setClearLogsModalVisible(true);
  };

  const executeClearOldLogs = async () => {
    try {
      setIsProcessing(true);
      const deleted = await dataService.clearOldLogs(30);
      showToast({ type: 'info', title: 'Sukses', message: `Berhasil menghapus ${deleted} log aktivitas lama.` });
      setClearLogsModalVisible(false);
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal membersihkan log.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetSales = () => {
    setSyncTarget('all');
    setResetSalesModalVisible(true);
  };

  const executeResetSales = async () => {
    try {
      setIsProcessing(true);
      await dataService.resetSalesData();

      // If connected to Desktop Kasir and user chose all devices, trigger reset on desktop too
      if (isConnected && syncTarget === 'all') {
        desktopSyncService.resetSalesOnDesktop().catch((e) => {
          console.warn('[DataManagement] Remote reset sales warning:', e);
        });
      }

      showToast({
        type: 'info',
        title: 'Sukses',
        message: isConnected && syncTarget === 'all'
          ? 'Riwayat transaksi kasir berhasil dibersihkan di seluruh perangkat.'
          : 'Riwayat transaksi kasir berhasil dibersihkan pada HP ini.',
      });
      setResetSalesModalVisible(false);
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mereset data.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearMenu = () => {
    setClearMenuModalVisible(true);
  };

  const executeClearMenu = async () => {
    try {
      setIsProcessing(true);
      await dataService.clearAllMenusAndRecipes();
      showToast({
        type: 'success',
        title: 'Sukses',
        message: 'Katalog menu & resep berhasil dikosongkan.',
      });
      setClearMenuModalVisible(false);
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mengosongkan menu.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearStock = () => {
    setClearStockModalVisible(true);
  };

  const executeClearStock = async () => {
    try {
      setIsProcessing(true);
      await dataService.clearAllStock();
      showToast({
        type: 'success',
        title: 'Sukses',
        message: 'Seluruh stok bahan baku berhasil dikosongkan (0 bahan).',
      });
      setClearStockModalVisible(false);
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mengosongkan stok.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAll = () => {
    setSyncTarget('all');
    setResetAllModalVisible(true);
  };

  const executeResetAll = async () => {
    try {
      setIsProcessing(true);
      await dataService.resetToDefaultOnlyAdminAndStock();

      // If connected to Desktop Kasir and user chose all devices, trigger reset on desktop too
      if (isConnected && syncTarget === 'all') {
        desktopSyncService.resetAllToDefaultOnDesktop().catch((e) => {
          console.warn('[DataManagement] Remote reset all to default warning:', e);
        });
      }

      showToast({
        type: 'success',
        title: 'Data Toko Direset',
        message: isConnected && syncTarget === 'all'
          ? 'Data berhasil di-reset di seluruh perangkat. Hanya akun Admin dan stok bahan baku yang tersimpan. Saldo dompet direset ke 0.'
          : 'Data berhasil di-reset pada HP ini. Hanya akun Admin dan stok bahan baku yang tersimpan. Saldo dompet direset ke 0.',
      });
      notifySyncListeners('wallets');
      notifySyncListeners('orders');
      notifySyncListeners('expenses');
      notifySyncListeners('stock');
      notifySyncListeners('catalog');
      setResetAllModalVisible(false);
      loadStats();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Gagal mereset data toko.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Manajemen Data" onBack={onBack} />

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#D97706" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
          }
        >
          {/* Storage & Engine Info Card */}
          <View style={styles.engineCard}>
            <View style={styles.engineIconBox}>
              <HardDrive size={22} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.engineTitleRow}>
                <Text style={styles.engineTitle}>Penyimpanan Data</Text>
                <View style={styles.activeBadge}>
                  <View style={styles.greenDot} />
                  <Text style={styles.activeBadgeText}>Aman</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Stats Section */}
          <Text style={styles.sectionHeader}>STATISTIK DATA TERSIMPAN</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Receipt size={16} color="#2563EB" />
              </View>
              <Text style={styles.statValue}>{stats?.totalTransactions ?? 0}</Text>
              <Text style={styles.statLabel}>Total Transaksi</Text>
            </View>

            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Utensils size={16} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{stats?.totalMenuItems ?? 0}</Text>
              <Text style={styles.statLabel}>Daftar Menu</Text>
            </View>

            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Package size={16} color="#16A34A" />
              </View>
              <Text style={styles.statValue}>{stats?.totalIngredients ?? 0}</Text>
              <Text style={styles.statLabel}>Bahan Baku</Text>
            </View>

            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#F5F3FF' }]}>
                <FileClock size={16} color="#7C3AED" />
              </View>
              <Text style={styles.statValue}>{stats?.totalLogs ?? 0}</Text>
              <Text style={styles.statLabel}>Log Aktivitas</Text>
            </View>

            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#FFF7ED' }]}>
                <Wallet size={16} color="#EA580C" />
              </View>
              <Text style={styles.statValue}>{stats?.totalExpenses ?? 0}</Text>
              <Text style={styles.statLabel}>Pengeluaran Kas</Text>
            </View>

            <View style={styles.statBox}>
              <View style={[styles.statIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Clock size={16} color="#475569" />
              </View>
              <Text style={styles.statValue}>{stats?.totalShifts ?? 0}</Text>
              <Text style={styles.statLabel}>Rekap Shift</Text>
            </View>
          </View>

          {/* Maintenance Actions */}
          <Text style={styles.sectionHeader}>PEMELIHARAAN & OPTIMASI</Text>

          {/* VACUUM */}
          <View style={styles.actionCard}>
            <View style={styles.actionCardLeft}>
              <View style={[styles.actionIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Sparkles size={18} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Optimasi Perangkat Lunak</Text>
                <Text style={styles.actionDesc}>
                  Merapikan alokasi memori dan mempercepat respon aplikasi kasir.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={handleVacuum}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <RefreshCw size={13} color="#2563EB" />
              <Text style={styles.actionBtnSecondaryText}>Optimalkan</Text>
            </TouchableOpacity>
          </View>

          {/* Clear Old Logs */}
          <View style={styles.actionCard}>
            <View style={styles.actionCardLeft}>
              <View style={[styles.actionIconBox, { backgroundColor: '#F5F3FF' }]}>
                <FileClock size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Bersihkan Log Lama (&gt;30 Hari)</Text>
                <Text style={styles.actionDesc}>
                  Hapus riwayat audit dan log aktivitas sensitif yang sudah berumur lebih dari 30 hari.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={handleClearOldLogs}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <Trash2 size={13} color="#7C3AED" />
              <Text style={[styles.actionBtnSecondaryText, { color: '#7C3AED' }]}>Bersihkan</Text>
            </TouchableOpacity>
          </View>

          {/* Backup & Restore Section */}
          <Text style={[styles.sectionHeader, { color: '#0284C7', marginTop: 24 }]}>
            CADANGKAN & PULIHKAN DATA (FULL BACKUP)
          </Text>

          {/* Export Full Backup */}
          <View style={styles.actionCard}>
            <View style={styles.actionCardLeft}>
              <View style={[styles.actionIconBox, { backgroundColor: '#E0F2FE' }]}>
                <Download size={18} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Ekspor Backup Database (.json)</Text>
                <Text style={styles.actionDesc}>
                  Unduh seluruh database (menu, resep, transaksi, stok, shift, log) untuk disimpan ke Google Drive atau WhatsApp.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnSecondary, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}
              onPress={handleExportBackup}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <Download size={13} color="#0284C7" />
              <Text style={[styles.actionBtnSecondaryText, { color: '#0284C7' }]}>Ekspor</Text>
            </TouchableOpacity>
          </View>

          {/* Import Full Backup */}
          <View style={styles.actionCard}>
            <View style={styles.actionCardLeft}>
              <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Upload size={18} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Pulihkan Data dari File Backup</Text>
                <Text style={styles.actionDesc}>
                  Pulihkan seluruh data sistem dari salinan file backup JSON yang pernah Anda unduh.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnSecondary, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}
              onPress={() => setImportModalVisible(true)}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <Upload size={13} color="#16A34A" />
              <Text style={[styles.actionBtnSecondaryText, { color: '#16A34A' }]}>Pulihkan</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone: Reset Sales */}
          <Text style={[styles.sectionHeader, { color: '#DC2626', marginTop: 24 }]}>
            ZONA BERBAHAYA
          </Text>

          <View style={styles.dangerCard}>
            <View style={styles.dangerNotice}>
              <AlertTriangle size={18} color="#DC2626" />
              <Text style={styles.dangerNoticeText}>
               Jika anda menekan tombol ini makan data transaksi akan terhapus seluruhnya.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleResetSales}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <Trash2 size={15} color="#FFFFFF" />
              <Text style={styles.resetBtnText}>Reset Seluruh Transaksi</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone: Clear Menu & Recipes */}
          <View style={[styles.dangerCard, { marginTop: 12, borderColor: '#FED7AA' }]}>
            <View style={[styles.dangerNotice, { backgroundColor: '#FFF7ED' }]}>
              <Utensils size={18} color="#EA580C" />
              <Text style={[styles.dangerNoticeText, { color: '#9A3412' }]}>
               Jika anda menekan tombol ini maka data menu dan resep akan terhapus seluruhnya.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.resetBtn, { backgroundColor: '#EA580C' }]}
              onPress={handleClearMenu}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <Trash2 size={15} color="#FFFFFF" />
              <Text style={styles.resetBtnText}>Kosongkan Menu & Resep</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone: Clear Stock */}
          <View style={[styles.dangerCard, { marginTop: 12, borderColor: '#FED7AA' }]}>
            <View style={[styles.dangerNotice, { backgroundColor: '#FFF7ED' }]}>
              <Package size={18} color="#C2410C" />
              <Text style={[styles.dangerNoticeText, { color: '#9A3412' }]}>
               Jika anda menekan tombol ini maka seluruh data stok dan bahan baku akan terhapus menjadi 0.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.resetBtn, { backgroundColor: '#C2410C' }]}
              onPress={handleClearStock}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <Trash2 size={15} color="#FFFFFF" />
              <Text style={styles.resetBtnText}>Kosongkan Stok Bahan Baku</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone: Reset Default Database (Hanya Admin & Stok) */}
          <View style={[styles.dangerCard, { marginTop: 16, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
            <View style={[styles.dangerNotice, { backgroundColor: '#FEE2E2' }]}>
              <AlertTriangle size={18} color="#DC2626" />
              <Text style={[styles.dangerNoticeText, { color: '#991B1B', fontWeight: '700' }]}>
                RESET DATA TOKO KE DEFAULT (HANYA ADMIN & STOK)
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 12, lineHeight: 18 }}>
              Menghapus seluruh transaksi penjualan, shift kasir, pengeluaran, total isi dompet kas (Laci Kasir, Manager, Rekening), dan kasir lain. Default tersisa: 1 Akun Admin (Owner) dan 52 Master Stok Bahan Baku (stok 0).
            </Text>

            <TouchableOpacity
              style={[styles.resetBtn, { backgroundColor: '#DC2626' }]}
              onPress={handleResetAll}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <Trash2 size={15} color="#FFFFFF" />
              <Text style={styles.resetBtnText}>Reset ke Default (Admin & Stok)</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ===== Custom Modal 1: Bersihkan Log Lama ===== */}
      <Modal visible={clearLogsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#F5F3FF' }]}>
              <FileClock size={28} color="#7C3AED" />
            </View>

            <Text style={styles.modalDialogTitle}>Bersihkan Log Lama?</Text>

            <Text style={styles.modalDialogDesc}>
              Hapus seluruh riwayat audit dan log aktivitas yang sudah berumur lebih dari{' '}
              <Text style={{ fontWeight: '700', color: '#0F172A' }}>30 hari</Text>.
            </Text>

            <View style={styles.modalNoticeBox}>
              <Info size={14} color="#7C3AED" />
              <Text style={[styles.modalNoticeText, { color: '#6D28D9' }]}>
                Log aktivitas 30 hari terakhir tetap tersimpan aman. Memori penyimpanan data sistem akan dioptimalkan.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setClearLogsModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#7C3AED' }]}
                onPress={executeClearOldLogs}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Hapus Log Lama</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Custom Modal 2: Reset Penjualan ===== */}
      <Modal visible={resetSalesModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AlertTriangle size={28} color="#DC2626" />
            </View>

            <Text style={styles.modalDialogTitle}>Konfirmasi Reset Penjualan</Text>

            <Text style={styles.modalDialogDesc}>
              Tindakan ini akan menghapus seluruh data transaksi kasir secara permanen.
            </Text>

            <View style={styles.breakdownBox}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ Riwayat Transaksi & Struk Kasir</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ Rekap Sesi Shift & Cash Drawer</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ Catatan Pengeluaran Kas Laci</Text>
              </View>
            </View>

            {isConnected && (
              <View style={styles.syncChoiceBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Monitor size={15} color="#4F46E5" />
                  <Text style={styles.syncChoiceTitle}>PC Desktop Terhubung Terdeteksi</Text>
                </View>
                <Text style={styles.syncChoiceDesc}>Apakah di device yang terhubung juga di-reset?</Text>
                <View style={styles.syncChoiceRow}>
                  <TouchableOpacity
                    style={[styles.syncChoiceBtn, syncTarget === 'all' && styles.syncChoiceBtnActive]}
                    onPress={() => setSyncTarget('all')}
                  >
                    <Text style={[styles.syncChoiceText, syncTarget === 'all' && styles.syncChoiceTextActive]}>
                      Ya, Semua Perangkat
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.syncChoiceBtn, syncTarget === 'local_only' && styles.syncChoiceBtnActive]}
                    onPress={() => setSyncTarget('local_only')}
                  >
                    <Text style={[styles.syncChoiceText, syncTarget === 'local_only' && styles.syncChoiceTextActive]}>
                      Hanya HP Ini
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setResetSalesModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#DC2626' }]}
                onPress={executeResetSales}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Ya, Reset Sekarang</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Custom Modal 3: Kosongkan Menu & Resep ===== */}
      <Modal visible={clearMenuModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#FFF7ED' }]}>
              <Utensils size={28} color="#EA580C" />
            </View>

            <Text style={styles.modalDialogTitle}>Kosongkan Menu & Resep?</Text>

            <Text style={styles.modalDialogDesc}>
              Menghapus semua menu, varian, dan resep di aplikasi secara permanen.
            </Text>

            <View style={[styles.modalNoticeBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <Info size={14} color="#D97706" />
              <Text style={[styles.modalNoticeText, { color: '#92400E' }]}>
                Anda dapat menambahkan menu baru sendiri atau melakukan sinkronisasi dengan Desktop kapan saja.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setClearMenuModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#EA580C' }]}
                onPress={executeClearMenu}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Kosongkan Menu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Custom Modal 4: Kosongkan Stok Bahan Baku ===== */}
      <Modal visible={clearStockModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#FFF7ED' }]}>
              <Package size={28} color="#C2410C" />
            </View>

            <Text style={styles.modalDialogTitle}>Kosongkan Stok Bahan?</Text>

            <Text style={styles.modalDialogDesc}>
              Menghapus seluruh daftar bahan baku dan riwayat mutasi stok. Stok bahan baku di Android akan menjadi 0.
            </Text>

            <View style={[styles.modalNoticeBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <Info size={14} color="#D97706" />
              <Text style={[styles.modalNoticeText, { color: '#92400E' }]}>
                Anda dapat menambahkan bahan baru atau melakukan sinkronisasi stok dari PC Desktop kapan saja.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setClearStockModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#C2410C' }]}
                onPress={executeClearStock}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Ya, Kosongkan Stok</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Custom Modal 5: Reset Total Database ke 0 ===== */}
      <Modal visible={resetAllModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AlertTriangle size={28} color="#DC2626" />
            </View>

            <Text style={styles.modalDialogTitle}>Reset ke Default (Admin & Stok)?</Text>

            <Text style={styles.modalDialogDesc}>
              Tindakan ini akan mengosongkan riwayat penjualan, shift kasir, dan kasir lain. Sistem kembali ke default: hanya Akun Admin dan 52 Master Stok Bahan Baku.
            </Text>

            <View style={styles.breakdownBox}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ 0 Transaksi, Struk & Item Penjualan</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ 0 Daftar Menu & Varian (Siap Input / Sync)</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ 0 Akun Kasir Lain (Hanya Akun Admin)</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownBad}>✕ 0 Rekap Shift & Pengeluaran Kas</Text>
              </View>
              <View style={[styles.breakdownRow, { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
                <Text style={styles.breakdownGood}>✓ Akun Utama Admin/Owner (PIN 123456) Tersedia</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownGood}>✓ 52 Master Stok Bahan Baku (Stok 0) Tersedia</Text>
              </View>
            </View>

            {isConnected && (
              <View style={styles.syncChoiceBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Monitor size={15} color="#4F46E5" />
                  <Text style={styles.syncChoiceTitle}>PC Desktop Terhubung Terdeteksi</Text>
                </View>
                <Text style={styles.syncChoiceDesc}>Apakah di device yang terhubung juga di-reset?</Text>
                <View style={styles.syncChoiceRow}>
                  <TouchableOpacity
                    style={[styles.syncChoiceBtn, syncTarget === 'all' && styles.syncChoiceBtnActive]}
                    onPress={() => setSyncTarget('all')}
                  >
                    <Text style={[styles.syncChoiceText, syncTarget === 'all' && styles.syncChoiceTextActive]}>
                      Ya, Semua Perangkat
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.syncChoiceBtn, syncTarget === 'local_only' && styles.syncChoiceBtnActive]}
                    onPress={() => setSyncTarget('local_only')}
                  >
                    <Text style={[styles.syncChoiceText, syncTarget === 'local_only' && styles.syncChoiceTextActive]}>
                      Hanya HP Ini
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setResetAllModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#DC2626' }]}
                onPress={executeResetAll}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Ya, Reset ke Default</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Pulihkan Database */}
      <Modal visible={importModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#F0FDF4' }]}>
              <Upload size={26} color="#16A34A" />
            </View>

            <Text style={styles.modalDialogTitle}>Pulihkan Database dari File Backup</Text>
            <Text style={[styles.modalDialogDesc, { marginBottom: 12 }]}>
              Tempel seluruh teks dari file backup (.json) yang ingin Anda pulihkan. Seluruh menu, resep, transaksi, dan stok akan diperbarui sesuai backup.
            </Text>

            <TextInput
              style={{
                width: '100%',
                height: 120,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                borderRadius: 10,
                padding: 10,
                backgroundColor: '#F8FAFC',
                textAlignVertical: 'top',
                fontSize: 12,
                color: '#0F172A',
                marginBottom: 16,
              }}
              multiline
              value={importJsonText}
              onChangeText={setImportJsonText}
              placeholder="Tempel teks JSON backup di sini..."
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setImportModalVisible(false)}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#16A34A' }]}
                onPress={executeImportBackup}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalActionBtnText}>Pulihkan Sekarang</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  engineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    gap: 12,
  },
  engineIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  engineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  engineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  engineSubtitle: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 12,
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  actionDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  dangerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 12,
  },
  dangerNotice: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    alignItems: 'flex-start',
  },
  dangerNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 16,
  },
  dangerInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  safeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  safeItemText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '600',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ===== Custom Modal Styles =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalDialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalDialogTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDialogDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  modalNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 18,
    width: '100%',
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  breakdownBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 18,
    gap: 5,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownBad: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  breakdownGood: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalActionBtn: {
    flex: 1.3,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  syncChoiceBox: {
    width: '100%',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  syncChoiceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  syncChoiceDesc: {
    fontSize: 11,
    color: '#4338CA',
    marginBottom: 8,
  },
  syncChoiceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  syncChoiceBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncChoiceBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  syncChoiceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  syncChoiceTextActive: {
    color: '#FFFFFF',
  },
});
