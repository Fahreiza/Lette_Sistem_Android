import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSyncStore } from '../../stores/syncStore';
import { desktopSyncService } from '../../services/desktopSyncService';
import { showToast } from '../../stores/toastStore';
import {
  X,
  QrCode,
  Wifi,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ArrowDownCircle,
  Camera,
} from 'lucide-react-native';

interface DesktopPairingModalProps {
  visible: boolean;
  onClose: () => void;
  onMenuSynced?: () => void;
}

export const DesktopPairingModal: React.FC<DesktopPairingModalProps> = ({
  visible,
  onClose,
  onMenuSynced,
}) => {
  const {
    serverUrl,
    isConnected,
    isConnecting,
    storeName,
    lastSyncTime,
  } = useSyncStore();

  const [isSyncingMenu, setIsSyncingMenu] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(true);

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (visible) {
      setIsScanningActive(true);
      // Auto test current connection when opening modal
      desktopSyncService.testConnection();
    }
  }, [visible]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!isScanningActive) return;
    setIsScanningActive(false);

    const res = await desktopSyncService.connectFromQr(data);
    if (res.success && res.url) {
      showToast({
        type: 'success',
        title: 'Berhasil Terhubung!',
        message: 'HP Kasir berhasil tersambung dengan komputer kasir utama.',
      });
      if (onMenuSynced) onMenuSynced();
    } else {
      showToast({
        type: 'error',
        title: 'Gagal Terhubung ke Kasir Utama',
        message:
          res.error ||
          'Mohon pastikan HP dan komputer kasir utama sudah terhubung ke jaringan Wi-Fi yang sama, lalu coba pindai ulang.',
      });
    }

    // Cooldown before scanning again
    setTimeout(() => {
      setIsScanningActive(true);
    }, 2500);
  };

  const handleSyncMenu = async () => {
    try {
      setIsSyncingMenu(true);
      const res = await desktopSyncService.syncMenuFromDesktop();
      if (res.success) {
        showToast({ type: 'success', title: 'Sinkronisasi Sukses', message: `Berhasil memuat ${res.itemCount} menu terbaru dari Desktop.` });
        if (onMenuSynced) onMenuSynced();
      } else {
        showToast({ type: 'error', title: 'Gagal Sinkronisasi Menu', message: res.error || 'Terjadi kesalahan saat memuat menu.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Sinkronisasi Menu', message: e?.message || 'Terjadi kesalahan saat memuat menu.' });
    } finally {
      setIsSyncingMenu(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Wifi size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.title}>Koneksi Kasir Desktop</Text>
                <Text style={styles.subtitle}>Sinkronisasi menu & order via WiFi lokal</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Status Card */}
            <View style={[styles.statusCard, isConnected ? styles.statusCardOnline : styles.statusCardOffline]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
                <View style={styles.statusTextContainer}>
                  <Text style={styles.statusTitle}>
                    {isConnected ? 'Terhubung ke Kasir Desktop' : 'Belum Terhubung'}
                  </Text>
                  <Text style={styles.statusSub}>
                    {isConnected ? `Host: ${serverUrl}` : 'Scan QR Code di layar PC untuk pairing'}
                  </Text>
                </View>
              </View>

              {lastSyncTime && (
                <Text style={styles.lastSyncText}>Terakhir sinkronisasi: {lastSyncTime}</Text>
              )}
            </View>

            {/* Scan QR Scanner */}
            <View style={styles.scannerWrapper}>
              {!permission ? (
                <View style={styles.cameraPlaceholder}>
                  <ActivityIndicator size="small" color="#D97706" />
                  <Text style={styles.helperText}>Memeriksa izin kamera...</Text>
                </View>
              ) : !permission.granted ? (
                <View style={styles.cameraPlaceholder}>
                  <Camera size={40} color="#94A3B8" />
                  <Text style={styles.cameraPermTitle}>Izin Kamera Diperlukan</Text>
                  <Text style={styles.cameraPermDesc}>
                    Aplikasi memerlukan akses kamera untuk memindai QR Code di layar Desktop.
                  </Text>
                  <TouchableOpacity
                    style={styles.btnPerm}
                    onPress={requestPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnPermText}>Beri Izin Kamera</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cameraContainer}>
                  <CameraView
                    style={styles.cameraView}
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={isScanningActive ? handleBarcodeScanned : undefined}
                  />
                  {/* Reticle Overlay */}
                  <View style={styles.reticleOverlay}>
                    <View style={styles.scanTargetBox}>
                      <View style={[styles.corner, styles.tl]} />
                      <View style={[styles.corner, styles.tr]} />
                      <View style={[styles.corner, styles.bl]} />
                      <View style={[styles.corner, styles.br]} />
                    </View>
                    <Text style={styles.scanInstruction}>
                      Arahkan kamera ke QR Code di layar Desktop POS
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Action: Pull Menu Catalog */}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={[styles.syncButton, !isConnected && styles.syncButtonDisabled]}
                onPress={handleSyncMenu}
                disabled={!isConnected || isSyncingMenu}
                activeOpacity={0.8}
              >
                {isSyncingMenu ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ArrowDownCircle size={18} color="#FFFFFF" />
                    <Text style={styles.syncButtonText}>Tarik Menu & Varian Terbaru</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  body: {
    maxHeight: 520,
  },
  bodyContent: {
    padding: 20,
  },
  statusCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusCardOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusCardOffline: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#F59E0B',
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  lastSyncText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#D97706',
    fontWeight: '800',
  },
  scannerWrapper: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 16,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  cameraView: {
    flex: 1,
  },
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanTargetBox: {
    width: 160,
    height: 160,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#D97706',
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scanInstruction: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  cameraPermTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  cameraPermDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  btnPerm: {
    marginTop: 14,
    backgroundColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnPermText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  manualWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  ipInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ipInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  btnTest: {
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTestText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  manualHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 15,
  },
  presetsWrapper: {
    marginTop: 14,
    marginBottom: 10,
  },
  presetsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  infoAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  infoAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 3,
  },
  infoAlertDesc: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
  actionsSection: {
    marginTop: 8,
  },
  syncButton: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  syncButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
