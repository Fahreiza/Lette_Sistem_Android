import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { WalletType } from '../../types';
import { walletService } from '../../services/walletService';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';
import { formatIDR, parseCurrencyInput, formatCurrencyInput } from '../../utils/formatters';
import {
  ArrowRightLeft,
  X,
  Banknote,
  Wallet,
  CreditCard,
  Check,
  AlertCircle,
  ArrowRight,
} from 'lucide-react-native';

import { reportService } from '../../services/reportService';

interface TransferWalletModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentBalances?: {
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  };
}

const WALLET_OPTIONS: { id: WalletType; label: string; sub: string; icon: any; color: string; bg: string }[] = [
  {
    id: 'laci_kasir',
    label: 'Laci Kasir',
    sub: 'Uang Fisik Kasir',
    icon: Banknote,
    color: '#D97706',
    bg: '#FEF3C7',
  },
  {
    id: 'saldo_manager',
    label: 'Saldo Manager',
    sub: 'Petty Cash / Operasional',
    icon: Wallet,
    color: '#16A34A',
    bg: '#DCFCE7',
  },
  {
    id: 'rekening_owner',
    label: 'Rekening Owner',
    sub: 'QRIS & Bank',
    icon: CreditCard,
    color: '#2563EB',
    bg: '#DBEAFE',
  },
];

export const TransferWalletModal: React.FC<TransferWalletModalProps> = ({
  visible,
  onClose,
  onSuccess,
  currentBalances,
}) => {
  const { currentUser, isAdmin } = useAuthStore();
  const [fromWallet, setFromWallet] = useState<WalletType>('laci_kasir');
  const [toWallet, setToWallet] = useState<WalletType>('saldo_manager');
  const [amountStr, setAmountStr] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchedBalances, setFetchedBalances] = useState<{
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  }>({
    saldoLaciKasir: 0,
    saldoManager: 0,
    saldoRekeningOwner: 0,
  });

  const prevVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      // Hanya reset input dan pilihan dompet saat modal baru saja dibuka
      setAmountStr('');
      setKeterangan('');
      setFromWallet('laci_kasir');
      setToWallet('saldo_manager');
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (visible && !currentBalances) {
      reportService.getCurrentBalances().then((b) => {
        setFetchedBalances({
          saldoLaciKasir: b.saldoLaciKasir,
          saldoManager: b.saldoManager,
          saldoRekeningOwner: b.saldoRekeningOwner,
        });
      }).catch(() => {});
    }
  }, [visible, currentBalances]);

  const effectiveBalances = currentBalances || fetchedBalances;

  // Ensure from and to are never the same
  const handleSelectFrom = (w: WalletType) => {
    setFromWallet(w);
    if (w === toWallet) {
      const fallback = WALLET_OPTIONS.find((opt) => opt.id !== w)?.id || 'saldo_manager';
      setToWallet(fallback);
    }
  };

  const handleSelectTo = (w: WalletType) => {
    if (w === fromWallet) return;
    setToWallet(w);
  };

  const getWalletBalance = (w: WalletType): number => {
    if (w === 'laci_kasir') return effectiveBalances.saldoLaciKasir || 0;
    if (w === 'saldo_manager') return effectiveBalances.saldoManager || 0;
    return effectiveBalances.saldoRekeningOwner || 0;
  };

  const fromBalance = getWalletBalance(fromWallet);
  const amount = parseCurrencyInput(amountStr);

  const setPresetAmount = (val: number) => {
    setAmountStr(formatCurrencyInput(val));
  };

  const handleTransfer = async () => {
    if (!currentUser) return;
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Akses Ditolak', message: 'Hanya Owner / Admin yang dapat melakukan transfer saldo.' });
      onClose();
      return;
    }
    if (amount <= 0) {
      showToast({ type: 'warning', title: 'Jumlah Belum Diisi', message: 'Masukkan nominal transfer yang valid.' });
      return;
    }
    if (fromWallet === toWallet) {
      showToast({ type: 'warning', title: 'Dompet Sama', message: 'Dompet asal dan tujuan tidak boleh sama.' });
      return;
    }
    if (fromBalance <= 0) {
      showToast({
        type: 'warning',
        title: 'Saldo Kosong',
        message: `Saldo ${WALLET_OPTIONS.find((w) => w.id === fromWallet)?.label} saat ini Rp 0. Tidak dapat melakukan transfer.`,
      });
      return;
    }
    if (amount > fromBalance) {
      showToast({
        type: 'warning',
        title: 'Saldo Tidak Mencukupi',
        message: `Nominal transfer (${formatIDR(amount)}) melebihi saldo tersedia (${formatIDR(fromBalance)}).`,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await walletService.transferWallet({
        from_wallet: fromWallet,
        to_wallet: toWallet,
        jumlah: amount,
        keterangan: keterangan.trim() || undefined,
        actor_id: currentUser.id,
        actor_nama: currentUser.nama,
      });

      if (res.success) {
        showToast({
          type: 'success',
          title: 'Transfer Berhasil',
          message: `Berhasil transfer ${formatIDR(amount)} ke ${WALLET_OPTIONS.find((w) => w.id === toWallet)?.label}.`,
        });
        onSuccess?.();
        onClose();
      } else {
        showToast({ type: 'error', title: 'Gagal Transfer', message: res.error || 'Terjadi kesalahan.' });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.headerIconBox}>
                <ArrowRightLeft size={18} color="#2563EB" />
              </View>
              <View>
                <Text style={styles.title}>Transfer Saldo</Text>
                <Text style={styles.subtitle}>Pindahkan saldo antar sumber dana kas toko</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Step 1: Dompet Asal (From) */}
            <Text style={styles.fieldLabel}>DARI SUMBER DANA (ASAL):</Text>
            <View style={styles.walletRow}>
              {WALLET_OPTIONS.map((opt) => {
                const isSelected = fromWallet === opt.id;
                const Icon = opt.icon;
                const bal = getWalletBalance(opt.id);
                return (
                  <TouchableOpacity
                    key={`from-${opt.id}`}
                    style={[
                      styles.walletBox,
                      isSelected && { borderColor: opt.color, backgroundColor: opt.bg + '40' },
                    ]}
                    onPress={() => handleSelectFrom(opt.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.miniIconBox, { backgroundColor: opt.bg }]}>
                      <Icon size={14} color={opt.color} />
                    </View>
                    <Text style={[styles.walletBoxLabel, isSelected && { color: opt.color, fontWeight: '800' }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.walletBoxBalance}>{formatIDR(bal)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Direction Indicator */}
            <View style={styles.arrowDivider}>
              <View style={styles.dividerLine} />
              <View style={styles.arrowCircle}>
                <ArrowRight size={14} color="#64748B" />
              </View>
              <View style={styles.dividerLine} />
            </View>

            {/* Step 2: Dompet Tujuan (To) */}
            <Text style={styles.fieldLabel}>KE SUMBER DANA (TUJUAN):</Text>
            <View style={styles.walletRow}>
              {WALLET_OPTIONS.map((opt) => {
                const isSelected = toWallet === opt.id;
                const isDisabled = fromWallet === opt.id;
                const Icon = opt.icon;
                const bal = getWalletBalance(opt.id);
                return (
                  <TouchableOpacity
                    key={`to-${opt.id}`}
                    disabled={isDisabled}
                    style={[
                      styles.walletBox,
                      isSelected && { borderColor: opt.color, backgroundColor: opt.bg + '40' },
                      isDisabled && { opacity: 0.35, backgroundColor: '#F1F5F9' },
                    ]}
                    onPress={() => handleSelectTo(opt.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.miniIconBox, { backgroundColor: opt.bg }]}>
                      <Icon size={14} color={opt.color} />
                    </View>
                    <Text style={[styles.walletBoxLabel, isSelected && { color: opt.color, fontWeight: '800' }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.walletBoxBalance}>{formatIDR(bal)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Step 3: Nominal Transfer */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>NOMINAL TRANSFER (RP):</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputPrefix}>Rp</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                value={amountStr}
                onChangeText={(text) => setAmountStr(formatCurrencyInput(text))}
              />
            </View>

            {/* Quick Amount Chips */}
            <View style={styles.chipsRow}>
              {[50000, 100000, 200000, 500000].map((v) => (
                <TouchableOpacity
                  key={`chip-${v}`}
                  style={styles.quickChip}
                  onPress={() => setPresetAmount(v)}
                >
                  <Text style={styles.quickChipText}>+{formatIDR(v).replace('Rp ', '')}</Text>
                </TouchableOpacity>
              ))}
              {fromBalance > 0 && (
                <TouchableOpacity
                  style={[styles.quickChip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  onPress={() => setPresetAmount(fromBalance)}
                >
                  <Text style={[styles.quickChipText, { color: '#2563EB', fontWeight: '800' }]}>Semua Saldo</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Zero or Exceed warning */}
            {fromBalance <= 0 ? (
              <View style={[styles.warnBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <AlertCircle size={14} color="#DC2626" />
                <Text style={[styles.warnText, { color: '#B91C1C' }]}>
                  Saldo dompet asal Rp 0. Tidak ada dana yang dapat ditransfer.
                </Text>
              </View>
            ) : amount > fromBalance ? (
              <View style={styles.warnBox}>
                <AlertCircle size={14} color="#D97706" />
                <Text style={styles.warnText}>
                  Nominal melebihi saldo tercatat ({formatIDR(fromBalance)}).
                </Text>
              </View>
            ) : null}

            {/* Step 4: Keterangan (Opsional) */}
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>KETERANGAN / ALASAN (OPSIONAL):</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Contoh: Setor kas harian, isi saldo operasional manager..."
              placeholderTextColor="#94A3B8"
              value={keterangan}
              onChangeText={setKeterangan}
            />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (amount <= 0 || isSubmitting || fromBalance <= 0 || amount > fromBalance) && styles.submitBtnDisabled,
              ]}
              onPress={handleTransfer}
              disabled={amount <= 0 || isSubmitting || fromBalance <= 0 || amount > fromBalance}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>Kirim Transfer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  walletRow: {
    flexDirection: 'row',
    gap: 8,
  },
  walletBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  miniIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  walletBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  walletBoxBalance: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: 'monospace',
    marginTop: 2,
    textAlign: 'center',
  },
  arrowDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  arrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: 'monospace',
    paddingVertical: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  quickChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  warnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
    flex: 1,
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
