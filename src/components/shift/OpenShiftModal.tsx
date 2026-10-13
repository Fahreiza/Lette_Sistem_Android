import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { shiftService } from '../../services/shiftService';
import { CashierShift } from '../../types';
import { formatIDR, formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import { useAuthStore } from '../../stores/authStore';
import { reportService } from '../../services/reportService';
import { Wallet, X, AlertTriangle, CheckCircle2, ArrowRight, LogOut, History } from 'lucide-react-native';

interface OpenShiftModalProps {
  visible: boolean;
  kasirId: number;
  kasirNama: string;
  onClose: () => void;
  onShiftOpened: (shift: CashierShift) => void;
  onCancelOrLogout?: () => void;
}

const QUICK_AMOUNTS = [50000, 100000, 150000, 200000, 300000, 500000];

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  visible,
  kasirId,
  kasirNama,
  onClose,
  onShiftOpened,
  onCancelOrLogout,
}) => {
  const [modalAwalInput, setModalAwalInput] = useState('100.000');
  const [catatan, setCatatan] = useState('');
  const [lastShift, setLastShift] = useState<CashierShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadLastShift();
    }
  }, [visible]);

  const loadLastShift = async () => {
    setLoading(true);
    try {
      const shift = await shiftService.getLastClosedShift();
      setLastShift(shift);
      if (shift && shift.uang_fisik_aktual !== undefined) {
        setModalAwalInput(formatCurrencyInput(shift.uang_fisik_aktual));
      } else {
        // Shift Perdana Toko: otomatis mengambil saldo kas laci terkini (persis seperti Desktop)
        try {
          const balances = await reportService.getCurrentBalances();
          const drawerCash = balances.saldoLaciKasir || 0;
          if (drawerCash > 0) {
            setModalAwalInput(formatCurrencyInput(drawerCash));
          } else {
            setModalAwalInput('100.000');
          }
        } catch {
          setModalAwalInput('100.000');
        }
      }
    } catch (e) {
      console.warn('Could not load last shift:', e);
    } finally {
      setLoading(false);
    }
  };

  const modalAwalNum = parseCurrencyInput(modalAwalInput);
  const saldoLalu = lastShift?.uang_fisik_aktual ?? lastShift?.total_sistem_tunai ?? null;
  const hasDiscrepancy = saldoLalu !== null && modalAwalNum !== saldoLalu;
  const selisih = saldoLalu !== null ? modalAwalNum - saldoLalu : 0;

  const handleOpen = async () => {
    if (modalAwalNum < 0) {
      showToast({ type: 'warning', title: 'Peringatan', message: 'Modal awal tidak valid.' });
      return;
    }
    if (hasDiscrepancy && !catatan.trim()) {
      showToast({
        type: 'warning',
        title: 'Alasan Diperlukan',
        message: 'Terdapat selisih antara saldo tutup shift sebelumnya dengan modal awal saat ini. Harap isi catatan serah terima.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const newShift = await shiftService.openShift(
        kasirId,
        kasirNama,
        modalAwalNum,
        catatan.trim()
      );
      showToast({
        type: 'success',
        title: 'Shift Berhasil Dibuka!',
        message: `Kasir: ${kasirNama} • Modal Awal: ${formatIDR(modalAwalNum)}`,
      });
      onShiftOpened(newShift);
      onClose();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Buka Shift', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrLogout = () => {
    if (onCancelOrLogout) {
      onCancelOrLogout();
    } else {
      useAuthStore.getState().logout();
      showToast({
        type: 'info',
        title: 'Buka Shift Dibatalkan',
        message: 'Silakan pilih kembali akun kasir yang sesuai pada halaman login.',
      });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancelOrLogout}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Wallet size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.title}>Buka Shift Kasir Baru</Text>
                <Text style={styles.subtitle}>Kasir: {kasirNama}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleCancelOrLogout} disabled={isSubmitting}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Info shift sebelumnya vs Shift Perdana */}
            {lastShift && saldoLalu !== null ? (
              <View style={styles.handoverBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <History size={14} color="#D97706" />
                  <Text style={styles.handoverTitle}>Serah Terima dari Shift Kemarin:</Text>
                </View>
                <View style={styles.handoverRow}>
                  <Text style={styles.handoverKasir}>Oleh {lastShift.kasir_nama}</Text>
                  <Text style={styles.handoverAmount}>
                    {formatIDR(saldoLalu ?? 0)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.perdanaBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <History size={15} color="#059669" />
                  <Text style={styles.perdanaTitle}>Shift Perdana Toko</Text>
                </View>
                <Text style={styles.perdanaDesc}>
                  Belum ada riwayat shift sebelumnya. Modal awal kasir otomatis disesuaikan dengan saldo laci kasir toko.
                </Text>
              </View>
            )}

            {/* Input Modal Awal */}
            <View style={styles.inputSection}>
              <Text style={styles.label}>Hitung & Masukkan Modal Kas Laci:</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.rpPrefix}>Rp</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={modalAwalInput}
                  onChangeText={(val) => setModalAwalInput(formatCurrencyInput(val))}
                  placeholder="0"
                />
              </View>
            </View>

            {/* Quick Chips */}
            <View style={styles.chipRow}>
              {QUICK_AMOUNTS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.chip, modalAwalNum === amt && styles.chipActive]}
                  onPress={() => setModalAwalInput(formatCurrencyInput(amt))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, modalAwalNum === amt && styles.chipTextActive]}>
                    {amt.toLocaleString('id-ID')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Peringatan Selisih */}
            {hasDiscrepancy && (
              <View style={styles.alertBox}>
                <AlertTriangle size={18} color="#DC2626" />
                <View style={styles.alertTextContainer}>
                  <Text style={styles.alertTitle}>Ada Selisih Serah Terima Kas!</Text>
                  <Text style={styles.alertDesc}>
                    Uang fisik kasir ({formatIDR(modalAwalNum)}) berbeda dengan kas closing kemarin ({formatIDR(saldoLalu ?? 0)}).
                    Selisih: {selisih > 0 ? `+${formatIDR(selisih)} (Lebih)` : `${formatIDR(selisih)} (Kurang)`}.
                  </Text>
                </View>
              </View>
            )}

            {/* Catatan */}
            <View style={styles.noteSection}>
              <Text style={styles.label}>
                Catatan Serah Terima {hasDiscrepancy ? '(Wajib Diisi)' : '(Opsional)'}:
              </Text>
              <TextInput
                style={styles.textArea}
                value={catatan}
                onChangeText={setCatatan}
                placeholder={hasDiscrepancy ? 'Tuliskan alasan mengapa uang kas berbeda...' : 'Catatan pembukaan shift...'}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Tombol Konfirmasi Buka Shift */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleOpen}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>Konfirmasi Buka Shift</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Tombol Batal / Ganti Kasir jika salah login */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelOrLogout}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <LogOut size={16} color="#64748B" />
              <Text style={styles.cancelBtnText}>Batal / Ganti Kasir (Kembali ke Login)</Text>
            </TouchableOpacity>
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
    maxHeight: '90%',
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
  handoverBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  handoverTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  handoverRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  handoverKasir: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  handoverAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
    fontFamily: 'monospace',
  },
  perdanaBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  perdanaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  perdanaDesc: {
    fontSize: 11,
    color: '#047857',
    marginTop: 4,
    lineHeight: 16,
  },
  inputSection: {
    marginBottom: 12,
  },
  label: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  alertBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  alertTextContainer: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },
  alertDesc: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 16,
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
  submitBtn: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    marginTop: 10,
    marginBottom: 4,
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
});
