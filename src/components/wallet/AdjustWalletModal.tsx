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
  SlidersHorizontal,
  X,
  Banknote,
  Wallet,
  CreditCard,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';

import { reportService } from '../../services/reportService';

interface AdjustWalletModalProps {
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

export const AdjustWalletModal: React.FC<AdjustWalletModalProps> = ({
  visible,
  onClose,
  onSuccess,
  currentBalances,
}) => {
  const { currentUser, isAdmin } = useAuthStore();
  const [selectedWallet, setSelectedWallet] = useState<WalletType>('laci_kasir');
  const [newBalanceStr, setNewBalanceStr] = useState('');
  const [alasan, setAlasan] = useState('');
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

  const effectiveBalances = currentBalances || fetchedBalances;

  const getCurrentBalance = (w: WalletType): number => {
    if (w === 'laci_kasir') return effectiveBalances.saldoLaciKasir || 0;
    if (w === 'saldo_manager') return effectiveBalances.saldoManager || 0;
    return effectiveBalances.saldoRekeningOwner || 0;
  };

  const recordedBalance = getCurrentBalance(selectedWallet);
  const newBalance = parseCurrencyInput(newBalanceStr);
  const selisih = newBalanceStr ? newBalance - recordedBalance : 0;

  const prevVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      // Hanya reset ketika modal baru saja dibuka
      setSelectedWallet('laci_kasir');
      setAlasan('');
      const cur = (currentBalances || fetchedBalances).saldoLaciKasir || 0;
      setNewBalanceStr(cur > 0 ? formatCurrencyInput(cur) : '');
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

  const handleSelectWallet = (w: WalletType) => {
    setSelectedWallet(w);
    const cur = getCurrentBalance(w);
    setNewBalanceStr(cur > 0 ? formatCurrencyInput(cur) : '');
  };

  const handleSaveAdjustment = async () => {
    if (!currentUser) return;
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Akses Ditolak', message: 'Hanya Owner / Admin yang dapat mengelola atau mengoreksi saldo.' });
      onClose();
      return;
    }
    if (newBalanceStr.trim() === '') {
      showToast({ type: 'warning', title: 'Saldo Belum Diisi', message: 'Masukkan nominal saldo fisik riil saat ini.' });
      return;
    }
    if (!alasan.trim()) {
      showToast({ type: 'warning', title: 'Alasan Wajib Diisi', message: 'Tuliskan alasan koreksi/penyesuaian saldo.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await walletService.adjustWalletBalance({
        dompet: selectedWallet,
        saldo_baru: newBalance,
        alasan: alasan.trim(),
        actor_id: currentUser.id,
        actor_nama: currentUser.nama,
      });

      if (res.success) {
        showToast({
          type: 'success',
          title: 'Koreksi Saldo Berhasil',
          message: `Saldo ${WALLET_OPTIONS.find((w) => w.id === selectedWallet)?.label} diperbarui menjadi ${formatIDR(newBalance)}.`,
        });
        onSuccess?.();
        onClose();
      } else {
        showToast({ type: 'error', title: 'Gagal Koreksi', message: res.error || 'Terjadi kesalahan.' });
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
                <SlidersHorizontal size={18} color="#9333EA" />
              </View>
              <View>
                <Text style={styles.title}>Koreksi / Kelola Saldo</Text>
                <Text style={styles.subtitle}>Sesuaikan saldo kas tercatat dengan fisik uang riil</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Step 1: Pilih Dompet */}
            <Text style={styles.fieldLabel}>PILIH DOMPET YANG AKAN DISESUAIKAN:</Text>
            <View style={styles.walletRow}>
              {WALLET_OPTIONS.map((opt) => {
                const isSelected = selectedWallet === opt.id;
                const Icon = opt.icon;
                const bal = getCurrentBalance(opt.id);
                return (
                  <TouchableOpacity
                    key={`adj-${opt.id}`}
                    style={[
                      styles.walletBox,
                      isSelected && { borderColor: '#9333EA', backgroundColor: '#FAF5FF' },
                    ]}
                    onPress={() => handleSelectWallet(opt.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.miniIconBox, { backgroundColor: opt.bg }]}>
                      <Icon size={14} color={opt.color} />
                    </View>
                    <Text style={[styles.walletBoxLabel, isSelected && { color: '#9333EA', fontWeight: '800' }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.walletBoxBalance}>{formatIDR(bal)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Current Recorded Balance Box */}
            <View style={styles.recordedBox}>
              <Text style={styles.recordedLabel}>Saldo Tercatat di Sistem Saat Ini:</Text>
              <Text style={styles.recordedVal}>{formatIDR(recordedBalance)}</Text>
            </View>

            {/* Step 2: Input Saldo Fisik Riil Baru */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>SALDO AKTUAL / FISIK HASIL HITUNG (RP):</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputPrefix}>Rp</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                value={newBalanceStr}
                onChangeText={(text) => setNewBalanceStr(formatCurrencyInput(text))}
              />
            </View>

            {/* Selisih Badge */}
            {newBalanceStr.trim() !== '' && (
              <View
                style={[
                  styles.selisihCard,
                  selisih > 0
                    ? styles.selisihSurplus
                    : selisih < 0
                    ? styles.selisihDefisit
                    : styles.selisihSesuai,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {selisih > 0 ? (
                    <TrendingUp size={16} color="#16A34A" />
                  ) : selisih < 0 ? (
                    <TrendingDown size={16} color="#DC2626" />
                  ) : (
                    <Check size={16} color="#475569" />
                  )}
                  <Text
                    style={[
                      styles.selisihTitle,
                      { color: selisih > 0 ? '#15803D' : selisih < 0 ? '#B91C1C' : '#334155' },
                    ]}
                  >
                    {selisih > 0
                      ? 'Surplus (Saldo Fisik Lebih Besar):'
                      : selisih < 0
                      ? 'Defisit (Saldo Fisik Kurang):'
                      : 'Sesuai (Tidak Ada Selisih):'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.selisihAmount,
                    { color: selisih > 0 ? '#15803D' : selisih < 0 ? '#B91C1C' : '#334155' },
                  ]}
                >
                  {selisih > 0 ? `+${formatIDR(selisih)}` : selisih < 0 ? `-${formatIDR(Math.abs(selisih))}` : 'Rp 0'}
                </Text>
              </View>
            )}

            {/* Step 3: Alasan Koreksi */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>ALASAN / CATATAN KOREKSI (WAJIB):</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Contoh: Selisih uang koin kasir, pembulatan modal awal, penyesuaian fisik..."
              placeholderTextColor="#94A3B8"
              value={alasan}
              onChangeText={setAlasan}
              multiline
              numberOfLines={2}
            />

            {/* Warning Note */}
            <View style={styles.auditNotice}>
              <AlertTriangle size={13} color="#6B21A8" />
              <Text style={styles.auditNoticeText}>
                Koreksi saldo akan dicatat di log audit dan langsung disinkronkan ke komputer desktop.
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!newBalanceStr.trim() || !alasan.trim() || isSubmitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSaveAdjustment}
              disabled={!newBalanceStr.trim() || !alasan.trim() || isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>Simpan Koreksi</Text>
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
    backgroundColor: '#FAF5FF',
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
  recordedBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordedLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  recordedVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: 'monospace',
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
  selisihCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selisihSurplus: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  selisihDefisit: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  selisihSesuai: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  selisihTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  selisihAmount: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
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
    minHeight: 50,
    textAlignVertical: 'top',
  },
  auditNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    borderRadius: 10,
    padding: 8,
    marginTop: 12,
  },
  auditNoticeText: {
    fontSize: 10.5,
    color: '#6B21A8',
    fontWeight: '600',
    flex: 1,
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
    backgroundColor: '#9333EA',
    shadowColor: '#9333EA',
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
