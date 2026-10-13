import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useSyncStore } from '../../stores/syncStore';
import { desktopSyncService } from '../../services/desktopSyncService';
import { shiftService } from '../../services/shiftService';
import { DesktopPairingModal } from '../../components/sync/DesktopPairingModal';
import { Header } from '../../components/common/Header';
import { showToast } from '../../stores/toastStore';

// Subscreens
import { ReportScreen } from '../reports/ReportScreen';
import { PrinterSettingsScreen } from '../printer/PrinterSettingsScreen';
import { EmployeeManagementScreen } from '../employees/EmployeeManagementScreen';
import { DataManagementScreen } from './DataManagementScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { ExpenseScreen } from '../expenses/ExpenseScreen';
import { BestSellerScreen } from '../reports/BestSellerScreen';

// Icons
import {
  TrendingUp,
  Printer,
  Users,
  HardDrive,
  Settings,
  Wifi,
  RefreshCw,
  QrCode,
  LogOut,
  ChevronRight,
  ShieldCheck,
  User as UserIcon,
  Wallet,
  Trophy,
  AlertTriangle,
} from 'lucide-react-native';

type SubScreenType = 'reports' | 'expenses' | 'printer' | 'employees' | 'data' | 'settings' | 'bestseller' | null;

export const AdminHubScreen: React.FC<{ navigation?: any }> = ({ navigation: propNavigation }) => {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>() || propNavigation;
  const { currentUser, isAdmin, logout } = useAuthStore();
  const { isConnected, isConnecting, serverUrl, storeName, lastSyncTime } = useSyncStore();

  const [activeSubScreen, setActiveSubScreen] = useState<SubScreenType>(null);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [syncingMenu, setSyncingMenu] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [shiftWarnVisible, setShiftWarnVisible] = useState(false);
  const [shiftOwner, setShiftOwner] = useState('');

  // Automatically reset to main hub whenever "Kelola" tab is tapped
  useEffect(() => {
    if (!nav) return;
    const unsubscribe = nav.addListener('tabPress', () => {
      setActiveSubScreen(null);
    });
    return unsubscribe;
  }, [nav]);

  // Handle Android hardware back press when subscreen is active
  useEffect(() => {
    const onBackPress = () => {
      if (activeSubScreen !== null) {
        setActiveSubScreen(null);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [activeSubScreen]);

  const handleQuickSyncMenu = async () => {
    if (!isConnected) {
      setPairingModalVisible(true);
      return;
    }
    try {
      setSyncingMenu(true);
      const res = await desktopSyncService.syncMenuFromDesktop();
      if (res.success) {
        showToast({ type: 'success', title: 'Sinkronisasi Sukses', message: `Berhasil memuat ${res.itemCount} menu terbaru dari PC Desktop.` });
      } else {
        showToast({ type: 'error', title: 'Gagal Sinkronisasi', message: res.error || 'Pastikan PC Desktop aktif.' });
      }
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err?.message || 'Terjadi kesalahan sinkronisasi.' });
    } finally {
      setSyncingMenu(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser?.role === 'kasir') {
      try {
        const activeShift = await shiftService.getActiveShift(currentUser.id);
        if (activeShift) {
          setShiftOwner(activeShift.kasir_nama || '');
          setShiftWarnVisible(true);
          return;
        }
      } catch (e) {
        console.warn('Shift check error:', e);
      }
    }
    setLogoutModalVisible(true);
  };

  // If a subscreen is active, render it directly with onBack callback
  if (activeSubScreen) {
    return (
      <View style={styles.container}>
        {activeSubScreen === 'reports' && <ReportScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'expenses' && <ExpenseScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'printer' && <PrinterSettingsScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'employees' && <EmployeeManagementScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'data' && <DataManagementScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'settings' && <SettingsScreen onBack={() => setActiveSubScreen(null)} />}
        {activeSubScreen === 'bestseller' && <BestSellerScreen onBack={() => setActiveSubScreen(null)} />}
      </View>
    );
  }

  // Admin Hub Main Screen
  return (
    <View style={styles.container}>
      <Header title="Pusat Kelola & Pengaturan" subtitle="Manajemen Toko & Sistem" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User & Store Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileInfo}>
            <View style={styles.avatar}>
              <UserIcon size={24} color="#D97706" />
            </View>
            <View style={styles.profileTexts}>
              <Text style={styles.userName}>{currentUser?.nama || 'Pengguna'}</Text>
              <View style={styles.roleBadge}>
                <ShieldCheck size={12} color={isAdmin ? '#D97706' : '#16A34A'} />
                <Text style={[styles.roleBadgeText, { color: isAdmin ? '#D97706' : '#16A34A' }]}>
                  {isAdmin ? 'Owner / Admin' : 'Kasir Aktif'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Desktop WiFi Bridge Card */}
        <View style={styles.bridgeCard}>
          <View style={styles.bridgeHeader}>
            <View style={styles.bridgeStatus}>
              {isConnected ? (
                <View style={[styles.statusDot, { backgroundColor: '#16A34A' }]} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: '#DC2626' }]} />
              )}
              <Text style={styles.bridgeTitle}>
                {isConnected ? 'Desktop POS Terhubung' : 'Desktop POS Belum Terhubung'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.qrScanBtn}
              onPress={() => setPairingModalVisible(true)}
              activeOpacity={0.8}
            >
              <QrCode size={16} color="#D97706" />
              <Text style={styles.qrScanBtnText}>Scan QR</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.bridgeSubtitle}>
            {isConnected
              ? `Server: ${serverUrl}`
              : 'Hubungkan via WiFi lokal untuk sinkronisasi menu dan pesanan otomatis.'}
          </Text>

          {isConnected && (
            <TouchableOpacity
              style={styles.quickSyncBtn}
              onPress={handleQuickSyncMenu}
              disabled={syncingMenu}
              activeOpacity={0.8}
            >
              {syncingMenu ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <RefreshCw size={14} color="#FFFFFF" />
              )}
              <Text style={styles.quickSyncBtnText}>
                {syncingMenu ? 'Menyinkronkan...' : 'Sinkronkan Menu dari Desktop'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Admin Management Navigation Cards */}
        {isAdmin && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>MANAJEMEN BISNIS</Text>

            {/* 1. Menu Terlaris (Best Seller) */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('bestseller')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#FEF3C7' }]}>
                <Trophy size={22} color="#D97706" />
              </View>
              <View style={styles.menuCardContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.menuCardTitle}>Menu Terlaris (Best Seller)</Text>
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#FDE68A' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}>BARU</Text>
                  </View>
                </View>
                <Text style={styles.menuCardDesc}>
                  Peringkat penjualan offline & online (GoFood, Shopee, Grab)
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Laporan */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('reports')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#EFF6FF' }]}>
                <TrendingUp size={22} color="#2563EB" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Laporan</Text>
                <Text style={styles.menuCardDesc}>
                  Riwayat transaksi, export Excel & CSV, rekap shift kasir
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Pengeluaran Toko */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('expenses')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#FDF2F8' }]}>
                <Wallet size={22} color="#DB2777" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Pengeluaran Toko</Text>
                <Text style={styles.menuCardDesc}>
                  Catat belanja bahan baku, kasbon karyawan, lembur, dan biaya operasional
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Printer */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('printer')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#FEF3C7' }]}>
                <Printer size={22} color="#D97706" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Printer</Text>
                <Text style={styles.menuCardDesc}>
                  Pengaturan printer kasir Bluetooth thermal 58mm & 80mm
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 3. Kelola Karyawan */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('employees')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#F5F3FF' }]}>
                <Users size={22} color="#7C3AED" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Kelola Karyawan</Text>
                <Text style={styles.menuCardDesc}>
                  Manajemen akun kasir, PIN keamanan & log aktivitas
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 4. Manajemen Data */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('data')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#ECFDF5' }]}>
                <HardDrive size={22} color="#059669" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Manajemen Data</Text>
                <Text style={styles.menuCardDesc}>
                  Statistik sistem, pembersihan log lama & reset penjualan
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* 5. Pengaturan Toko */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => setActiveSubScreen('settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#F1F5F9' }]}>
                <Settings size={22} color="#475569" />
              </View>
              <View style={styles.menuCardContent}>
                <Text style={styles.menuCardTitle}>Pengaturan Toko</Text>
                <Text style={styles.menuCardDesc}>
                  Profil usaha, nama cabang, pajak PB1/PPN & QRIS
                </Text>
              </View>
              <ChevronRight size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Cashier Informational Card */}
        {!isAdmin && (
          <View style={styles.cashierInfoBox}>
            <Text style={styles.cashierInfoTitle}>Mode Kasir</Text>
            <Text style={styles.cashierInfoDesc}>
              Sebagai kasir, Anda dapat melakukan transaksi pemesanan, mencatat kas keluar (pengeluaran),
              dan memantau sisa stok bahan baku toko. Untuk sinkronisasi menu terbaru dari PC kasir, gunakan tombol scan QR di atas.
            </Text>
          </View>
        )}

        {/* Logout Section */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <LogOut size={18} color="#DC2626" />
            <Text style={styles.logoutBtnText}>Keluar / Ganti Akun</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.appFooter}>
          <Text style={styles.footerVersion}>Lette Kasir v1.0.0 (Expo Android)</Text>
          <Text style={styles.footerBranch}>Roti Bakar Lette • Solusi POS Cerdas</Text>
        </View>
      </ScrollView>

      {/* Desktop Pairing Modal */}
      <DesktopPairingModal
        visible={pairingModalVisible}
        onClose={() => setPairingModalVisible(false)}
        onMenuSynced={() => {
          showToast({ type: 'success', title: 'Katalog Terupdate', message: 'Menu terbaru dari PC Desktop telah berhasil disinkronkan.' });
        }}
      />

      {/* Logout Confirm Modal */}
      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.logoutIconWrap}>
              <LogOut size={28} color="#7C3AED" />
            </View>
            <Text style={styles.confirmTitle}>Keluar Akun?</Text>
            <Text style={styles.confirmMsg}>
              Apakah Anda yakin ingin keluar{'\n'}dari akun ini?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setLogoutModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmLogoutBtn}
                onPress={() => { setLogoutModalVisible(false); logout(); }}
                activeOpacity={0.85}
              >
                <LogOut size={14} color="#fff" />
                <Text style={styles.confirmLogoutText}>Keluar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Shift Warning Modal */}
      <Modal visible={shiftWarnVisible} transparent animationType="fade" onRequestClose={() => setShiftWarnVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.warnIconWrap}>
              <AlertTriangle size={28} color="#D97706" />
            </View>
            <Text style={styles.confirmTitle}>Shift Masih Aktif</Text>
            <Text style={styles.confirmMsg}>
              Shift kasir <Text style={{ fontWeight: '800', color: '#1E293B' }}>({shiftOwner})</Text> masih aktif!{'\n'}
              Wajib tutup shift sebelum logout.
            </Text>
            <TouchableOpacity
              style={[styles.confirmLogoutBtn, { backgroundColor: '#D97706', shadowColor: '#D97706' }]}
              onPress={() => setShiftWarnVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmLogoutText}>Mengerti</Text>
            </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTexts: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bridgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  bridgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bridgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bridgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  bridgeSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
  },
  qrScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  qrScanBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  quickSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    borderRadius: 10,
  },
  quickSyncBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuCardContent: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  menuCardDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  cashierInfoBox: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cashierInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  cashierInfoDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
  },
  logoutContainer: {
    marginTop: 10,
    marginBottom: 24,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    borderRadius: 12,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  appFooter: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerVersion: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  footerBranch: {
    fontSize: 10,
    color: '#CBD5E1',
    marginTop: 2,
  },
  // Confirm modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  logoutIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    borderWidth: 2,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  warnIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmMsg: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  confirmLogoutBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmLogoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
