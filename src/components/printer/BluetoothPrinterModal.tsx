import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { usePrinterStore, BluetoothDevice } from '../../stores/printerStore';
import { bluetoothPrinterService } from '../../services/bluetoothPrinterService';
import { showToast } from '../../stores/toastStore';
import * as Print from 'expo-print';
import {
  Printer,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Bluetooth,
  FileText,
  Settings2,
  Trash2,
} from 'lucide-react-native';

interface BluetoothPrinterModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BluetoothPrinterModal: React.FC<BluetoothPrinterModalProps> = ({
  visible,
  onClose,
}) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    connectedPrinter,
    isScanning,
    isConnecting,
    availableDevices,
    paperWidth,
    autoPrintOnSuccess,
    setPaperWidth,
    setAutoPrintOnSuccess,
  } = usePrinterStore();

  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (visible && availableDevices.length === 0) {
      handleScan();
    }
  }, [visible]);

  const handleScan = async () => {
    try {
      await bluetoothPrinterService.scanDevices();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Memindai', message: e?.message || 'Pastikan Bluetooth HP sudah diaktifkan.' });
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    try {
      const res = await bluetoothPrinterService.connect(device);
      if (res.success) {
        showToast({ type: 'success', title: 'Berhasil Terhubung!', message: `Printer ${device.name} siap digunakan untuk mencetak struk.` });
      } else {
        showToast({ type: 'error', title: 'Gagal Terhubung', message: res.error || 'Gagal menyambungkan ke printer.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal menyambungkan ke printer.' });
    }
  };

  const handleDisconnect = async () => {
    await bluetoothPrinterService.disconnect();
    showToast({ type: 'info', title: 'Printer Terputus', message: 'Koneksi ke printer telah dinonaktifkan.' });
  };

  const handleTestPrint = async () => {
    if (!connectedPrinter) {
      showToast({
        type: 'warning',
        title: 'Belum Terhubung',
        message: 'Silakan sambungkan ke salah satu printer Bluetooth terlebih dahulu.',
      });
      return;
    }

    try {
      setIsTesting(true);
      await bluetoothPrinterService.testPrint(connectedPrinter, paperWidth);
      showToast({
        type: 'success',
        title: 'Berhasil',
        message: 'Perintah test print berhasil dikirim langsung ke printer thermal.',
      });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error Cetak', message: e?.message || 'Gagal mengirim perintah cetak ke printer.' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, isLandscape && styles.overlayLandscape]}>
        <View style={[styles.content, isLandscape && styles.contentLandscape]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Printer size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.title}>Printer Struk Bluetooth</Text>
                <Text style={styles.subtitle}>Cetak thermal langsung tanpa preview PDF</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Connection Status Card */}
            {connectedPrinter ? (
              <View style={styles.statusCardOnline}>
                <View style={styles.statusLeft}>
                  <View style={styles.statusDotOnline} />
                  <View>
                    <Text style={styles.statusTitleOnline}>Printer Terhubung</Text>
                    <Text style={styles.statusDeviceName}>{connectedPrinter.name}</Text>
                    <Text style={styles.statusMac}>{connectedPrinter.address}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={handleDisconnect}
                  activeOpacity={0.8}
                >
                  <Trash2 size={13} color="#DC2626" />
                  <Text style={styles.disconnectText}>Putuskan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.statusCardOffline}>
                <View style={styles.statusLeft}>
                  <AlertCircle size={22} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statusTitleOffline}>Belum Ada Printer Terhubung</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Quick Preferences Box */}
            <View style={styles.sectionBox}>
              {/* Paper Width Selector */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Lebar Kertas</Text>
                <View style={styles.paperWidthPills}>
                  <TouchableOpacity
                    style={[
                      styles.paperPill,
                      paperWidth === '58mm' && styles.paperPillActive,
                    ]}
                    onPress={() => setPaperWidth('58mm')}
                  >
                    <Text
                      style={[
                        styles.paperPillText,
                        paperWidth === '58mm' && styles.paperPillTextActive,
                      ]}
                    >
                      58mm
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paperPill,
                      paperWidth === '80mm' && styles.paperPillActive,
                    ]}
                    onPress={() => setPaperWidth('80mm')}
                  >
                    <Text
                      style={[
                        styles.paperPillText,
                        paperWidth === '80mm' && styles.paperPillTextActive,
                      ]}
                    >
                      80mm
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Auto-Print Toggle */}
              <View style={[styles.settingRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.settingLabel}>Cetak Otomatis Setelah Bayar</Text>
                <Switch
                  value={autoPrintOnSuccess}
                  onValueChange={setAutoPrintOnSuccess}
                  thumbColor={autoPrintOnSuccess ? '#D97706' : '#94A3B8'}
                  trackColor={{ false: '#CBD5E1', true: '#FEF3C7' }}
                />
              </View>
            </View>

            {/* Helper Info: Bluetooth Tip */}
            <View style={styles.permissionInfoBanner}>
              <AlertCircle size={15} color="#2563EB" />
              <Text style={styles.permissionInfoText}>
                Pastikan printer sudah dipasangkan (paired) di pengaturan Bluetooth HP.
              </Text>
            </View>

            {/* Device Scanner Section */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderRow}>
                  <Bluetooth size={16} color="#3B82F6" />
                  <Text style={styles.sectionTitle}>Perangkat Bluetooth Ditemukan</Text>
                </View>
                <TouchableOpacity
                  style={styles.scanBtn}
                  onPress={handleScan}
                  disabled={isScanning}
                  activeOpacity={0.7}
                >
                  {isScanning ? (
                    <ActivityIndicator size="small" color="#D97706" />
                  ) : (
                    <>
                      <RefreshCw size={13} color="#D97706" />
                      <Text style={styles.scanBtnText}>Scan Ulang</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {availableDevices.length === 0 ? (
                <View style={styles.emptyDeviceBox}>
                  <Bluetooth size={32} color="#CBD5E1" />
                  <Text style={styles.emptyDeviceText}>
                    {isScanning ? 'Mencari perangkat Bluetooth...' : 'Tidak ada printer terdeteksi. Tekan Scan Ulang.'}
                  </Text>
                </View>
              ) : (
                availableDevices.map((dev) => {
                  const isCurrent = connectedPrinter?.address === dev.address;
                  return (
                    <View key={`dev-${dev.address}`} style={styles.deviceRow}>
                      <View style={styles.deviceInfo}>
                        <Printer size={18} color={isCurrent ? '#16A34A' : '#64748B'} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {dev.name}
                          </Text>
                          <Text style={styles.deviceMac}>{dev.address}</Text>
                        </View>
                      </View>

                      {isCurrent ? (
                        <View style={styles.connectedBadge}>
                          <CheckCircle2 size={13} color="#16A34A" />
                          <Text style={styles.connectedBadgeText}>Aktif</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.connectBtn}
                          onPress={() => handleConnect(dev)}
                          disabled={isConnecting}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.connectBtnText}>Hubungkan</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Footer Action: Test Print */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.testPrintBtn,
                !connectedPrinter && styles.testPrintBtnDisabled,
              ]}
              onPress={handleTestPrint}
              disabled={!connectedPrinter || isTesting}
              activeOpacity={0.8}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FileText size={17} color="#FFFFFF" />
                  <Text style={styles.testPrintBtnText}>
                    {connectedPrinter
                      ? `Uji Cetak (Test Print ke ${connectedPrinter.name})`
                      : 'Sambungkan Printer Terlebih Dahulu'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  overlayLandscape: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 16,
  },
  contentLandscape: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 20,
    maxHeight: '95%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  body: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  statusCardOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusDotOnline: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16A34A',
  },
  statusTitleOnline: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusDeviceName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  statusMac: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  disconnectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  statusCardOffline: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  statusTitleOffline: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  statusDescOffline: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2,
  },
  sectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  scanBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  settingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  settingDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  paperWidthPills: {
    flexDirection: 'row',
    gap: 6,
  },
  paperPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  paperPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  paperPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  paperPillTextActive: {
    color: '#D97706',
    fontWeight: '800',
  },
  emptyDeviceBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyDeviceText: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  deviceMac: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  connectBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  connectedBadgeText: {
    color: '#16A34A',
    fontWeight: '800',
    fontSize: 11,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  testPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  testPrintBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  testPrintBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  permissionInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginHorizontal: 18,
    marginBottom: 14,
    gap: 10,
  },
  permissionInfoIconBox: {
    marginTop: 2,
  },
  permissionInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 2,
  },
  permissionInfoText: {
    fontSize: 11,
    color: '#3B82F6',
    lineHeight: 16,
  },
});
