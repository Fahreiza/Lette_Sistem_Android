import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { usePrinterStore, BluetoothDevice } from '../../stores/printerStore';
import { bluetoothPrinterService } from '../../services/bluetoothPrinterService';
import { settingsService } from '../../services/settingsService';
import { Header } from '../../components/common/Header';
import { showToast } from '../../stores/toastStore';
import {
  Printer,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Bluetooth,
  FileText,
  Trash2,
  Layers,
  Store,
  MapPin,
  Phone,
  Sparkles,
  Save,
  Eye,
} from 'lucide-react-native';

interface PrinterSettingsScreenProps {
  onBack?: () => void;
}

export const PrinterSettingsScreen: React.FC<PrinterSettingsScreenProps> = ({ onBack }) => {
  const {
    connectedPrinter,
    printerTarget,
    printerName,
    connected,
    isScanning,
    isConnecting,
    availableDevices,
    paperWidth,
    autoPrintOnSuccess,
    setPaperWidth,
    setAutoPrintOnSuccess,
  } = usePrinterStore();

  const [isTesting, setIsTesting] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState('Lette Roti Bakar');
  const [branchInput, setBranchInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [footerInput, setFooterInput] = useState('Terima kasih atas kunjungan Anda!');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    settingsService.getSettings().then((s) => {
      setStoreNameInput(s.nama_toko || 'Lette Roti Bakar');
      setBranchInput(s.nama_cabang || '');
      setAddressInput(s.alamat_toko || '');
      setPhoneInput(s.telepon_toko || '');
      setFooterInput(s.footer_struk || 'Terima kasih atas kunjungan Anda!');
    }).catch(() => {});
  }, []);

  const handleSaveTemplate = async () => {
    try {
      setIsSavingTemplate(true);
      await settingsService.updateSettings({
        nama_toko: storeNameInput.trim() || 'Lette Roti Bakar',
        nama_cabang: branchInput.trim(),
        alamat_toko: addressInput.trim(),
        telepon_toko: phoneInput.trim(),
        footer_struk: footerInput.trim() || 'Terima kasih atas kunjungan Anda!',
      });
      showToast({ type: 'success', title: 'Berhasil Disimpan', message: 'Template struk kasir berhasil diperbarui.' });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Menyimpan', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleScan = async () => {
    try {
      await bluetoothPrinterService.scanDevices();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Scan', message: e?.message || 'Tidak dapat memindai perangkat Bluetooth.' });
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    try {
      const res = await bluetoothPrinterService.connect(device.address, device.name);
      if (res.success) {
        showToast({ type: 'success', title: 'Berhasil', message: `Terhubung ke ${device.name || 'Printer'}` });
      } else {
        showToast({ type: 'error', title: 'Gagal', message: res.error || 'Tidak dapat terhubung ke printer.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Tidak dapat terhubung ke printer.' });
    }
  };

  const handleDisconnect = async () => {
    try {
      await bluetoothPrinterService.disconnect();
      showToast({ type: 'info', title: 'Terputus', message: 'Printer berhasil diputuskan.' });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal memutuskan printer.' });
    }
  };

  const handleTestPrint = async () => {
    if (!connectedPrinter && !printerTarget) {
      showToast({
        type: 'warning',
        title: 'Printer Belum Terhubung',
        message: 'Silakan hubungkan printer thermal terlebih dahulu.',
      });
      return;
    }

    try {
      setIsTesting(true);
      await bluetoothPrinterService.testPrint(connectedPrinter, paperWidth);
      showToast({ type: 'success', title: 'Sukses', message: 'Test print berhasil dikirim ke printer.' });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Cetak gagal. Periksa koneksi printer.' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Printer Kasir" onBack={onBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Connection Status Card */}
        <View style={[styles.statusCard, connectedPrinter ? styles.statusCardOnline : styles.statusCardOffline]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconBox, connectedPrinter ? styles.iconBoxOnline : styles.iconBoxOffline]}>
              <Printer size={22} color={connectedPrinter ? '#16A34A' : '#D97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {connectedPrinter ? 'Printer Terhubung' : 'Printer Belum Terhubung'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {connectedPrinter
                  ? `${connectedPrinter.name || 'Printer Kasir'} (${connectedPrinter.address})`
                  : 'Sambungkan ke printer thermal struk melalui Bluetooth'}
              </Text>
            </View>
          </View>

          {connectedPrinter && (
            <View style={styles.statusActions}>
              <TouchableOpacity
                style={styles.testBtn}
                onPress={handleTestPrint}
                disabled={isTesting}
                activeOpacity={0.8}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color="#D97706" />
                ) : (
                  <>
                    <FileText size={14} color="#D97706" />
                    <Text style={styles.testBtnText}>Tes Cetak</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} activeOpacity={0.8}>
                <Trash2 size={14} color="#DC2626" />
                <Text style={styles.disconnectBtnText}>Putuskan</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Printer Configuration Card */}
        <View style={styles.configCard}>
          <Text style={styles.sectionHeading}>PENGATURAN STRUK</Text>

          {/* Paper Width Selection */}
          <View style={styles.configRow}>
            <View>
              <Text style={styles.configLabel}>Lebar Kertas Struk</Text>
              <Text style={styles.configSub}>Ukuran standar printer thermal</Text>
            </View>

            <View style={styles.paperWidthGroup}>
              <TouchableOpacity
                style={[styles.paperWidthBtn, paperWidth === '58mm' && styles.paperWidthBtnActive]}
                onPress={() => setPaperWidth('58mm')}
              >
                <Text style={[styles.paperWidthText, paperWidth === '58mm' && styles.paperWidthTextActive]}>
                  58 mm
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paperWidthBtn, paperWidth === '80mm' && styles.paperWidthBtnActive]}
                onPress={() => setPaperWidth('80mm')}
              >
                <Text style={[styles.paperWidthText, paperWidth === '80mm' && styles.paperWidthTextActive]}>
                  80 mm
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Auto-print Toggle */}
          <View style={[styles.configRow, { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.configLabel}>Cetak Otomatis</Text>
              <Text style={styles.configSub}>Cetak struk seketika setelah kasir menyelesaikan transaksi</Text>
            </View>

            <Switch
              value={autoPrintOnSuccess}
              onValueChange={setAutoPrintOnSuccess}
              thumbColor={autoPrintOnSuccess ? '#D97706' : '#CBD5E1'}
              trackColor={{ true: '#FDE68A', false: '#E2E8F0' }}
            />
          </View>
        </View>

        {/* Receipt Template Configuration Card */}
        <View style={styles.configCard}>
          <View style={styles.cardHeaderWithAction}>
            <View>
              <Text style={styles.sectionHeading}>TEMPLATE & HEADER STRUK</Text>
              <Text style={styles.configSub}>Informasi toko yang tercetak pada struk thermal fisik</Text>
            </View>
            <TouchableOpacity
              style={styles.saveTemplateBtn}
              onPress={handleSaveTemplate}
              disabled={isSavingTemplate}
              activeOpacity={0.8}
            >
              {isSavingTemplate ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={13} color="#FFFFFF" />
                  <Text style={styles.saveTemplateBtnText}>Simpan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nama Usaha / Toko di Struk</Text>
            <View style={styles.inputBox}>
              <Store size={14} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={storeNameInput}
                onChangeText={setStoreNameInput}
                placeholder="Nama Toko"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nama Cabang / Outlet (Opsional)</Text>
            <View style={styles.inputBox}>
              <Store size={14} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={branchInput}
                onChangeText={setBranchInput}
                placeholder="Cabang 1 / Outlet Utama"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Alamat Outlet di Struk</Text>
            <View style={styles.inputBox}>
              <MapPin size={14} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={addressInput}
                onChangeText={setAddressInput}
                placeholder="Jl. Merdeka No. 10"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>No. WhatsApp / Telepon</Text>
            <View style={styles.inputBox}>
              <Phone size={14} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="0812-3456-7890"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Pesan Penutup Struk (Footer)</Text>
            <View style={[styles.inputBox, { alignItems: 'flex-start', paddingTop: 8 }]}>
              <Sparkles size={14} color="#94A3B8" style={{ marginTop: 2 }} />
              <TextInput
                style={[styles.textInput, { height: 46 }]}
                value={footerInput}
                onChangeText={setFooterInput}
                placeholder="Terima kasih atas kunjungan Anda!"
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>
          </View>

          {/* Live Receipt Preview */}
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Eye size={13} color="#D97706" />
              <Text style={styles.previewTitle}>PRATINJAU STRUK ({paperWidth})</Text>
            </View>

            <View style={[styles.receiptPaper, paperWidth === '80mm' ? styles.receiptPaper80mm : styles.receiptPaper58mm]}>
              {/* Header Toko */}
              <View style={styles.receiptSectionHeader}>
                <Text style={styles.receiptStoreTitle}>{(storeNameInput || 'LETTE ROTI BAKAR').toUpperCase()}</Text>
                {(branchInput || phoneInput) ? (
                  <Text style={styles.receiptStoreSub}>
                    {[branchInput, phoneInput ? `Telp: ${phoneInput}` : null].filter(Boolean).join(' | ')}
                  </Text>
                ) : null}
                {addressInput ? <Text style={styles.receiptStoreAddress}>{addressInput}</Text> : null}
              </View>

              <View style={styles.receiptDividerLine} />

              {/* Metadata Transaksi */}
              <View style={styles.receiptMetaBlock}>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptMetaLabel}>No. Struk</Text>
                  <Text style={styles.receiptMetaVal}>LTR-2026-001</Text>
                </View>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptMetaLabel}>Waktu</Text>
                  <Text style={styles.receiptMetaVal}>23 Sep 2026 14:30</Text>
                </View>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptMetaLabel}>Kasir</Text>
                  <Text style={styles.receiptMetaVal}>Kasir 1</Text>
                </View>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptMetaLabel}>Pesanan</Text>
                  <Text style={[styles.receiptMetaVal, { textTransform: 'uppercase' }]}>Offline</Text>
                </View>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptMetaLabel}>Metode Bayar</Text>
                  <Text style={styles.receiptMetaVal}>TUNAI</Text>
                </View>
              </View>

              <View style={styles.receiptDividerLine} />

              {/* Daftar Menu / Items */}
              <View style={styles.receiptItemsBlock}>
                {/* Item 1 */}
                <View style={styles.receiptItem}>
                  <View style={styles.receiptFlexRow}>
                    <Text style={styles.receiptItemName} numberOfLines={2}>
                      1x Roti Bakar Coklat Keju
                    </Text>
                    <Text style={styles.receiptItemPrice}>Rp 20.000</Text>
                  </View>
                  <View style={[styles.receiptFlexRow, { paddingLeft: 10, marginTop: 1 }]}>
                    <Text style={styles.receiptVariantText}>+ Ekstra Keju</Text>
                    <Text style={styles.receiptVariantText}>Rp 3.000</Text>
                  </View>
                  <Text style={styles.receiptNoteText}>* Sedikit manis</Text>
                </View>

                {/* Item 2 */}
                <View style={[styles.receiptItem, { marginTop: 4 }]}>
                  <View style={styles.receiptFlexRow}>
                    <Text style={styles.receiptItemName} numberOfLines={2}>
                      2x Es Teh Manis
                    </Text>
                    <Text style={styles.receiptItemPrice}>Rp 10.000</Text>
                  </View>
                  <Text style={styles.receiptSubPriceText}>(@ Rp 5.000)</Text>
                </View>
              </View>

              <View style={styles.receiptDividerLine} />

              {/* Total & Pembayaran */}
              <View style={styles.receiptTotalBlock}>
                <View style={styles.receiptFlexRow}>
                  <Text style={styles.receiptSubtotalLabel}>Subtotal</Text>
                  <Text style={styles.receiptSubtotalVal}>Rp 33.000</Text>
                </View>
                <View style={[styles.receiptFlexRow, styles.receiptTotalRow]}>
                  <Text style={styles.receiptTotalLabel}>TOTAL</Text>
                  <Text style={styles.receiptTotalVal}>Rp 33.000</Text>
                </View>
                <View style={[styles.receiptFlexRow, { marginTop: 2 }]}>
                  <Text style={styles.receiptPayLabel}>Bayar Tunai</Text>
                  <Text style={styles.receiptPayVal}>Rp 50.000</Text>
                </View>
                <View style={[styles.receiptFlexRow, { marginTop: 2 }]}>
                  <Text style={styles.receiptChangeLabel}>Kembalian</Text>
                  <Text style={styles.receiptChangeVal}>Rp 17.000</Text>
                </View>
              </View>

              <View style={styles.receiptDividerLine} />

              {/* Footer Ucapan */}
              <View style={styles.receiptFooterBlock}>
                {(footerInput || 'Terima kasih atas kunjungan Anda!')
                  .split('\n')
                  .filter((l) => l.trim().length > 0)
                  .map((line, idx) => (
                    <Text key={idx} style={styles.receiptFooterText}>
                      {line}
                    </Text>
                  ))}
              </View>
            </View>
          </View>
        </View>

        {/* Bluetooth Device List */}
        <View style={styles.deviceSection}>
          <View style={styles.deviceSectionHeader}>
            <Text style={styles.sectionHeading}>PERANGKAT BLUETOOTH</Text>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={handleScan}
              disabled={isScanning}
              activeOpacity={0.8}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color="#D97706" />
              ) : (
                <>
                  <RefreshCw size={13} color="#D97706" />
                  <Text style={styles.scanBtnText}>Pindai Ulang</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {availableDevices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Bluetooth size={32} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Tidak ada perangkat ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                Pastikan Bluetooth aktif dan printer berada dalam jangkauan
              </Text>
            </View>
          ) : (
            <View style={styles.deviceList}>
              {availableDevices.map((dev, idx) => {
                const isCurrent = connected && (connectedPrinter?.address === dev.address || printerTarget === dev.address);
                return (
                  <View key={`dev-${dev.address || idx}`} style={[styles.deviceCard, isCurrent && styles.deviceCardActive]}>
                    <View style={styles.deviceLeft}>
                      <View style={[styles.deviceIconBox, isCurrent && styles.deviceIconBoxActive]}>
                        <Bluetooth size={18} color={isCurrent ? '#16A34A' : '#64748B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.deviceName}>{dev.name || 'Perangkat Tanpa Nama'}</Text>
                          {dev.bonded && (
                            <View style={styles.bondedBadge}>
                              <Text style={styles.bondedText}>Tersimpan</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.deviceAddress}>{dev.address}</Text>
                      </View>
                    </View>

                    {isCurrent ? (
                      <View style={styles.connectedPill}>
                        <CheckCircle2 size={13} color="#16A34A" />
                        <Text style={styles.connectedText}>Aktif</Text>
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
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 14,
    paddingBottom: 40,
  },
  statusCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  statusCardOnline: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statusCardOffline: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxOnline: {
    backgroundColor: '#DCFCE7',
  },
  iconBoxOffline: {
    backgroundColor: '#FEF3C7',
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
    paddingTop: 10,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 8,
    borderRadius: 10,
  },
  testBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  disconnectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  configCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  configSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  paperWidthGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  paperWidthBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paperWidthBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  paperWidthText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  paperWidthTextActive: {
    color: '#D97706',
    fontWeight: '800',
  },
  deviceSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  deviceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  scanBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 220,
  },
  deviceList: {
    gap: 8,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  deviceCardActive: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  deviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  deviceIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIconBoxActive: {
    backgroundColor: '#DCFCE7',
  },
  deviceName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  bondedBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bondedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  deviceAddress: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  connectedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  connectBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
  },
  connectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  saveTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveTemplateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  inputGroup: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  previewContainer: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  receiptPaper: {
    alignSelf: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  receiptPaper58mm: {
    maxWidth: 270,
  },
  receiptPaper80mm: {
    maxWidth: 340,
  },
  receiptSectionHeader: {
    alignItems: 'center',
    paddingBottom: 2,
  },
  receiptStoreTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  receiptStoreSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
  },
  receiptStoreAddress: {
    fontSize: 9,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
    lineHeight: 12,
  },
  receiptDividerLine: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#94A3B8',
    borderStyle: 'dashed',
    marginVertical: 6,
  },
  receiptMetaBlock: {
    gap: 2,
  },
  receiptFlexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptMetaLabel: {
    fontSize: 9.5,
    color: '#475569',
  },
  receiptMetaVal: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptItemsBlock: {
    gap: 4,
  },
  receiptItem: {
    gap: 1,
  },
  receiptItemName: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 6,
  },
  receiptItemPrice: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptVariantText: {
    fontSize: 9,
    color: '#64748B',
  },
  receiptNoteText: {
    fontSize: 8.5,
    fontStyle: 'italic',
    color: '#94A3B8',
    paddingLeft: 10,
    marginTop: 1,
  },
  receiptSubPriceText: {
    fontSize: 9,
    color: '#64748B',
    paddingLeft: 10,
  },
  receiptTotalBlock: {
    gap: 2,
  },
  receiptSubtotalLabel: {
    fontSize: 9.5,
    color: '#64748B',
  },
  receiptSubtotalVal: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#334155',
  },
  receiptTotalRow: {
    paddingTop: 4,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginVertical: 2,
    alignItems: 'baseline',
  },
  receiptTotalLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  receiptTotalVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  receiptPayLabel: {
    fontSize: 9.5,
    color: '#475569',
  },
  receiptPayVal: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  receiptChangeLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptChangeVal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  receiptFooterBlock: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 2,
  },
  receiptFooterText: {
    fontSize: 9,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 13,
  },
});
