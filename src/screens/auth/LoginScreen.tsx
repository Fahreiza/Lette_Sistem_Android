import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { User } from '../../types';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';
import { useSyncStore } from '../../stores/syncStore';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { Keypad } from '../../components/common/Keypad';
import { DesktopPairingModal } from '../../components/sync/DesktopPairingModal';
import { showToast } from '../../stores/toastStore';
import { UserCheck, Shield, Lock, X, QrCode, Wifi } from 'lucide-react-native';

export const LoginScreen: React.FC = () => {
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync state
  const { isConnected } = useSyncStore();
  const [pairingModalVisible, setPairingModalVisible] = useState(false);

  // Modal State for Cashier / Admin Login
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);

  const loadCashiers = async (syncFirst = false) => {
    try {
      if (syncFirst) {
        await desktopSyncService.syncUsersFromDesktop().catch(() => {});
      }
      const list = await authService.getActiveCashiers();
      setCashiers(list);
    } catch (e) {
      console.error('Failed to load cashiers:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat data kasir.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashiers(true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'users') {
        console.log('[LoginScreen] Live users sync event received, refreshing cashier list...');
        loadCashiers(false);
      }
    });
    return unsub;
  }, []);

  const openCashierPin = (user: User) => {
    setSelectedUser(user);
    setIsAdminMode(false);
    setPinInput('');
    setErrorMsg('');
    setModalVisible(true);
  };

  const openAdminPin = () => {
    setSelectedUser(null);
    setIsAdminMode(true);
    setPinInput('');
    setErrorMsg('');
    setModalVisible(true);
  };

  const handleKeyPress = (k: string) => {
    setErrorMsg('');
    setPinInput((prev) => {
      if (prev.length >= 6) return prev;
      return prev + k;
    });
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMsg('');
    setPinInput('');
  };

  const handleVerify = async () => {
    if (pinInput.length < 4) {
      setErrorMsg('PIN minimal 4 digit.');
      return;
    }

    try {
      setIsVerifying(true);
      if (isAdminMode) {
        const adminUser = await authService.loginAdmin(pinInput);
        if (adminUser) {
          setModalVisible(false);
          setCurrentUser(adminUser);
        } else {
          setErrorMsg('PIN Admin salah. Silakan coba lagi.');
        }
      } else if (selectedUser) {
        const user = await authService.loginCashier(selectedUser.id, pinInput);
        if (user) {
          setModalVisible(false);
          setCurrentUser(user);
        } else {
          setErrorMsg('PIN Kasir salah. Silakan coba lagi.');
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Gagal memverifikasi PIN.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Brand Header */}
      <View style={styles.header}>
        {/* Tombol Cepat Scan QR / Status Koneksi Desktop */}
        <TouchableOpacity
          style={[
            styles.qrHeaderBtn,
            isConnected ? styles.qrHeaderBtnConnected : styles.qrHeaderBtnDisconnected,
          ]}
          onPress={() => setPairingModalVisible(true)}
          activeOpacity={0.7}
        >
          <QrCode size={16} color={isConnected ? '#059669' : '#D97706'} />
          <Text
            style={[
              styles.qrHeaderBtnText,
              { color: isConnected ? '#059669' : '#D97706' },
            ]}
          >
            {isConnected ? 'Terhubung PC' : 'Scan QR'}
          </Text>
        </TouchableOpacity>

        <Image
          source={require('../../../assets/logo.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <Text style={styles.brandTitle}>Lette Roti Bakar</Text>
        <Text style={styles.brandSubtitle}>Sistem Kasir Mobile</Text>
      </View>

      {/* Main Content: Cashier Grid */}
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Pilih Kasir Bertugas</Text>
        <Text style={styles.sectionDesc}>
          Tap nama Anda di bawah ini untuk memulai shift kasir:
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 40 }} />
        ) : cashiers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Belum ada kasir aktif.</Text>
            <Text style={styles.emptySubtext}>
              Silahkan login sebagai Admin/Owner atau hubungkan HP ke Desktop untuk sinkronisasi akun.
            </Text>
            <TouchableOpacity
              style={styles.emptySyncBtn}
              onPress={() => setPairingModalVisible(true)}
              activeOpacity={0.7}
            >
              <QrCode size={16} color="#FFFFFF" />
              <Text style={styles.emptySyncBtnText}>Hubungkan ke Desktop (Scan QR)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.cashierGrid}
            showsVerticalScrollIndicator={false}
          >
            {cashiers.map((cashier) => (
              <TouchableOpacity
                key={`cashier-${cashier.id}`}
                style={styles.cashierCard}
                onPress={() => openCashierPin(cashier)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarCircle}>
                  <UserCheck size={28} color="#D97706" />
                </View>
                <Text style={styles.cashierName} numberOfLines={2}>
                  {cashier.nama}
                </Text>
                <View style={styles.tapToLoginBadge}>
                  <Lock size={12} color="#64748B" />
                  <Text style={styles.tapToLoginText}>Input PIN</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Admin subtle button at bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={openAdminPin}
          activeOpacity={0.6}
        >
          <Shield size={16} color="#64748B" />
          <Text style={styles.adminBtnText}>Masuk sebagai Admin / Owner</Text>
        </TouchableOpacity>
      </View>

      {/* PIN Keypad Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinModal}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setModalVisible(false)}
            >
              <X size={20} color="#64748B" />
            </TouchableOpacity>

            <ScrollView
              style={styles.pinModalScrollView}
              contentContainerStyle={styles.pinModalScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.pinHeader}>
                {isAdminMode ? (
                  <View style={[styles.modalIconBox, styles.adminIconBox]}>
                    <Shield size={28} color="#DC2626" />
                  </View>
                ) : (
                  <View style={styles.modalIconBox}>
                    <Lock size={28} color="#D97706" />
                  </View>
                )}
                <Text style={styles.modalTitle}>
                  {isAdminMode ? 'Login Admin / Owner' : `Login ${selectedUser?.nama}`}
                </Text>
                <Text style={styles.modalSubtitle}>Masukkan PIN Keamanan</Text>
              </View>

              {/* PIN Dots Display */}
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const filled = idx < pinInput.length;
                  return (
                    <View
                      key={`dot-${idx}`}
                      style={[
                        styles.pinDot,
                        filled && styles.pinDotFilled,
                        isAdminMode && filled && styles.adminPinDotFilled,
                      ]}
                    />
                  );
                })}
              </View>

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              {/* Numeric Keypad */}
              <View style={styles.keypadWrapper}>
                <Keypad
                  onKeyPress={handleKeyPress}
                  onBackspace={handleBackspace}
                  onClear={handleClear}
                  showCashKeys={false}
                />
              </View>

              {/* Login Action Button */}
              <TouchableOpacity
                style={[
                  styles.submitPinBtn,
                  isAdminMode && styles.submitAdminBtn,
                  pinInput.length < 4 && styles.submitPinBtnDisabled,
                ]}
                onPress={handleVerify}
                disabled={pinInput.length < 4 || isVerifying}
                activeOpacity={0.8}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitPinBtnText}>Masuk Aplikasi</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Desktop Pairing Modal */}
      <DesktopPairingModal
        visible={pairingModalVisible}
        onClose={() => {
          setPairingModalVisible(false);
          loadCashiers(false);
        }}
        onMenuSynced={() => {
          loadCashiers(true);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    position: 'relative',
  },
  qrHeaderBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  qrHeaderBtnConnected: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  qrHeaderBtnDisconnected: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  qrHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  brandLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  cashierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingBottom: 20,
  },
  cashierCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cashierName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  tapToLoginBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tapToLoginText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  emptySyncBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  emptySyncBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminBtnText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pinModal: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '94%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  pinModalScrollView: {
    width: '100%',
  },
  pinModalScroll: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 4,
  },
  keypadWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    zIndex: 10,
  },
  pinHeader: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  adminIconBox: {
    backgroundColor: '#FEE2E2',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 14,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  pinDotFilled: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  adminPinDotFilled: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  submitPinBtn: {
    width: '100%',
    backgroundColor: '#D97706',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitAdminBtn: {
    backgroundColor: '#DC2626',
  },
  submitPinBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitPinBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
