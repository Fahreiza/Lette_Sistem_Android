import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { shiftService } from '../../services/shiftService';
import { CashierShift } from '../../types';
import { formatIDR, formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import {
  DoorClosed,
  X,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  QrCode,
  DollarSign,
  Scale,
  FileSpreadsheet,
  ShoppingBag,
} from 'lucide-react-native';

interface CloseShiftModalProps {
  visible: boolean;
  shift: CashierShift | null;
  onClose: () => void;
  onShiftClosed: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  visible,
  shift,
  onClose,
  onShiftClosed,
}) => {
  const [summary, setSummary] = useState<{
    totalTunai: number;
    countTunai: number;
    totalQris: number;
    countQris: number;
    totalOnline: number;
    countOnline: number;
    breakdownOnline: {
      gofood: { total: number; count: number };
      shopeefood: { total: number; count: number };
      grabfood: { total: number; count: number };
    };
    totalOmset: number;
    totalTransaksi: number;
    totalPengeluaran: number;
    totalExpectedCash: number;
  } | null>(null);

  const [uangFisikInput, setUangFisikInput] = useState('');
  const [catatan, setCatatan] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && shift) {
      loadSummary();
      setUangFisikInput('');
      setCatatan('');
    }
  }, [visible, shift]);

  const loadSummary = async () => {
    if (!shift) return;
    setLoading(true);
    try {
      const sum = await shiftService.getShiftSummary(shift.id);
      setSummary(sum);
      // Default input to expected cash
      setUangFisikInput(formatCurrencyInput(sum.totalExpectedCash));
    } catch (e) {
      console.warn('Failed to load shift summary:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!shift) return null;

  const uangFisikNum = parseCurrencyInput(uangFisikInput);
  const expectedCash = summary?.totalExpectedCash ?? 0;
  const selisih = uangFisikNum - expectedCash;
  const hasDiscrepancy = selisih !== 0;
  const isReasonRequired = hasDiscrepancy && catatan.trim().length < 3;

  const handleCloseShift = async () => {
    if (isReasonRequired) {
      showToast({
        type: 'error',
        title: 'Alasan Selisih Kas Wajib Diisi',
        message: `Terdapat selisih uang kas fisik sebesar ${selisih > 0 ? '+' : ''}${formatIDR(selisih)}. Anda wajib menuliskan alasan selisih sebelum shift dapat ditutup.`,
      });
      return;
    }

    Alert.alert(
      'Konfirmasi Tutup Shift',
      `Yakin ingin menutup shift kasir ini?\n\nModal Awal: ${formatIDR(shift.modal_awal)}\nUang Fisik: ${formatIDR(uangFisikNum)}\nSelisih: ${selisih === 0 ? 'Pas' : formatIDR(selisih)}`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Tutup Shift',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await shiftService.closeShift(
                shift.id,
                uangFisikNum,
                catatan.trim(),
                shift.kasir_id
              );
              showToast({
                type: 'success',
                title: 'Shift Ditutup',
                message: 'Rekonsiliasi kas shift selesai (Z-Report tersimpan).',
              });
              onShiftClosed();
              onClose();
            } catch (e: any) {
              showToast({
                type: 'error',
                title: 'Gagal Tutup Shift',
                message: e?.message || 'Terjadi kesalahan.',
              });
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <DoorClosed size={20} color="#DC2626" />
              </View>
              <View>
                <Text style={styles.title}>Tutup Shift Kasir (Z-Report)</Text>
                <Text style={styles.subtitle}>
                  Kasir: {shift.kasir_nama} • ID: {shift.id}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isSubmitting}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#D97706" />
                <Text style={styles.loadingText}>Menghitung rekonsiliasi kas...</Text>
              </View>
            ) : (
              <>
                {/* 1. Ringkasan Penjualan Shift (Tunai, QRIS, Online) */}
                <View style={styles.salesSummaryCard}>
                  <View style={styles.salesHeaderRow}>
                    <Text style={styles.salesCardTitle}>RINGKASAN PENJUALAN SHIFT</Text>
                    <Text style={styles.salesBadge}>{summary?.totalTransaksi || 0} Trx Selesai</Text>
                  </View>

                  {/* Banner Total Omset */}
                  <View style={styles.omsetBanner}>
                    <Text style={styles.omsetLabel}>Total Omset Penjualan Shift:</Text>
                    <Text style={styles.omsetVal}>{formatIDR(summary?.totalOmset || 0)}</Text>
                  </View>

                  {/* 3 Pilar: Tunai, QRIS, Online */}
                  <View style={styles.pillarItem}>
                    <View style={styles.pillarLeft}>
                      <Banknote size={15} color="#059669" />
                      <Text style={styles.pillarLabel}>1. Tunai (Laci Kasir):</Text>
                    </View>
                    <View style={styles.pillarRight}>
                      <Text style={styles.pillarVal}>{formatIDR(summary?.totalTunai || 0)}</Text>
                      <Text style={styles.pillarCount}>({summary?.countTunai || 0} Trx)</Text>
                    </View>
                  </View>

                  <View style={styles.pillarItem}>
                    <View style={styles.pillarLeft}>
                      <QrCode size={15} color="#4F46E5" />
                      <Text style={styles.pillarLabel}>2. QRIS (Non-Tunai):</Text>
                    </View>
                    <View style={styles.pillarRight}>
                      <Text style={styles.pillarVal}>{formatIDR(summary?.totalQris || 0)}</Text>
                      <Text style={styles.pillarCount}>({summary?.countQris || 0} Trx)</Text>
                    </View>
                  </View>

                  <View style={styles.pillarItem}>
                    <View style={styles.pillarLeft}>
                      <ShoppingBag size={15} color="#D97706" />
                      <Text style={styles.pillarLabel}>3. Order Online (Ojol):</Text>
                    </View>
                    <View style={styles.pillarRight}>
                      <Text style={styles.pillarVal}>{formatIDR(summary?.totalOnline || 0)}</Text>
                      <Text style={styles.pillarCount}>({summary?.countOnline || 0} Trx)</Text>
                    </View>
                  </View>

                  {/* Breakdown Online jika ada */}
                  {(summary?.countOnline || 0) > 0 && (
                    <View style={styles.onlineBreakdownBox}>
                      {(summary?.breakdownOnline.gofood.count || 0) > 0 && (
                        <View style={styles.onlineSubRow}>
                          <Text style={styles.onlineSubLabel}>• GoFood ({summary?.breakdownOnline.gofood.count}x):</Text>
                          <Text style={styles.onlineSubVal}>{formatIDR(summary?.breakdownOnline.gofood.total || 0)}</Text>
                        </View>
                      )}
                      {(summary?.breakdownOnline.shopeefood.count || 0) > 0 && (
                        <View style={styles.onlineSubRow}>
                          <Text style={styles.onlineSubLabel}>• ShopeeFood ({summary?.breakdownOnline.shopeefood.count}x):</Text>
                          <Text style={styles.onlineSubVal}>{formatIDR(summary?.breakdownOnline.shopeefood.total || 0)}</Text>
                        </View>
                      )}
                      {(summary?.breakdownOnline.grabfood.count || 0) > 0 && (
                        <View style={styles.onlineSubRow}>
                          <Text style={styles.onlineSubLabel}>• GrabFood ({summary?.breakdownOnline.grabfood.count}x):</Text>
                          <Text style={styles.onlineSubVal}>{formatIDR(summary?.breakdownOnline.grabfood.total || 0)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. Rekonsiliasi Kas Laci Sistem */}
                <View style={styles.summaryCard}>
                  <Text style={styles.cardTitle}>REKONSILIASI ARUS KAS LACI</Text>
                  
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Modal Awal Kasir:</Text>
                    <Text style={styles.summaryVal}>{formatIDR(shift.modal_awal)}</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Penjualan Tunai Laci (+):</Text>
                    <Text style={[styles.summaryVal, styles.valPositive]}>
                      +{formatIDR(summary?.totalTunai || 0)}
                    </Text>
                  </View>

                  {(summary?.totalPengeluaran || 0) > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Pengeluaran Laci Kas (-):</Text>
                      <Text style={[styles.summaryVal, styles.valNegative]}>
                        -{formatIDR(summary?.totalPengeluaran || 0)}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.summaryRow, styles.expectedRow]}>
                    <Text style={styles.expectedLabel}>Uang Sistem yang Harus Ada:</Text>
                    <Text style={styles.expectedVal}>{formatIDR(expectedCash)}</Text>
                  </View>
                </View>

                {/* Input Uang Fisik Aktual */}
                <View style={styles.actualSection}>
                  <Text style={styles.inputLabel}>
                    Hitung & Masukkan Uang Fisik Aktual di Laci:
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.rpPrefix}>Rp</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={uangFisikInput}
                      onChangeText={(val) => setUangFisikInput(formatCurrencyInput(val))}
                      placeholder="0"
                    />
                  </View>
                </View>

                {/* Status Selisih */}
                <View
                  style={[
                    styles.diffBadge,
                    selisih === 0
                      ? styles.diffBalanced
                      : selisih > 0
                      ? styles.diffOver
                      : styles.diffShort,
                  ]}
                >
                  <Scale size={18} color={selisih === 0 ? '#059669' : selisih > 0 ? '#2563EB' : '#DC2626'} />
                  <View style={styles.diffTextContainer}>
                    <Text style={styles.diffTitle}>
                      {selisih === 0
                        ? 'Kas Seimbang (Sesuai / Pas)'
                        : selisih > 0
                        ? `Kas Lebih: +${formatIDR(selisih)}`
                        : `Kas Kurang: -${formatIDR(Math.abs(selisih))}`}
                    </Text>
                    <Text style={styles.diffSub}>
                      Fisik: {formatIDR(uangFisikNum)} | Sistem: {formatIDR(expectedCash)}
                    </Text>
                  </View>
                </View>

                {/* Catatan Closing */}
                <View style={styles.noteSection}>
                  <Text style={styles.inputLabel}>
                    Catatan Closing {selisih !== 0 ? '(Wajib Diisi Karena Selisih)' : '(Opsional)'}:
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    value={catatan}
                    onChangeText={setCatatan}
                    placeholder={selisih !== 0 ? 'Jelaskan alasan selisih uang kas...' : 'Catatan penutupan shift...'}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Tombol Tutup Shift */}
                <TouchableOpacity
                  style={[
                    styles.closeBtnAction,
                    (isSubmitting || isReasonRequired) && styles.closeBtnDisabled,
                    isReasonRequired && { backgroundColor: '#94A3B8' }
                  ]}
                  onPress={handleCloseShift}
                  disabled={isSubmitting || isReasonRequired}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <DoorClosed size={18} color="#FFFFFF" />
                      <Text style={styles.closeBtnText}>
                        {isReasonRequired ? 'Wajib Isi Alasan Selisih Kas' : 'Tutup Shift Sekarang'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
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
    maxHeight: 560,
  },
  bodyContent: {
    padding: 20,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#475569',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  valPositive: {
    color: '#059669',
  },
  valNegative: {
    color: '#DC2626',
  },
  expectedRow: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    marginTop: 6,
    paddingTop: 10,
  },
  expectedLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  expectedVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#D97706',
    fontFamily: 'monospace',
  },
  salesSummaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  salesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  salesCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  salesBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  omsetBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  omsetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  omsetVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#059669',
    fontFamily: 'monospace',
  },
  pillarItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pillarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillarLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  pillarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillarVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  pillarCount: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  onlineBreakdownBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  onlineSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
  },
  onlineSubLabel: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  onlineSubVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78350F',
    fontFamily: 'monospace',
  },
  actualSection: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rpPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: 'monospace',
    padding: 0,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  diffBalanced: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  diffOver: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  diffShort: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  diffTextContainer: {
    flex: 1,
  },
  diffTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  diffSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  noteSection: {
    marginBottom: 20,
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 70,
  },
  closeBtnAction: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  closeBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
