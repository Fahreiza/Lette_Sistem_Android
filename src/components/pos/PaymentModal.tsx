import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentMethod, OrderChannel, CartItem } from '../../types';
import { formatIDR, getChannelLabel } from '../../utils/formatters';
import { Keypad } from '../common/Keypad';
import { QrisDisplay } from './QrisDisplay';
import {
  X,
  Banknote,
  QrCode,
  CheckCircle2,
  ArrowLeft,
  ShoppingCart,
} from 'lucide-react-native';

interface PaymentModalProps {
  visible: boolean;
  total: number;
  channel: OrderChannel;
  onClose: () => void;
  onConfirmPayment: (
    metode: PaymentMethod,
    cashPaid: number,
    kembalian: number,
    onlineOrderCode?: string,
    onlineVoucherDiscount?: number
  ) => void;
  isProcessing?: boolean;
  /** If true, renders as full inline view (no Modal wrapper) — used in landscape */
  inline?: boolean;
  /** Cart items for inline order summary panel */
  cartItems?: CartItem[];
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  total,
  channel,
  onClose,
  onConfirmPayment,
  isProcessing = false,
  inline = false,
  cartItems = [],
}) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const isOnlineOrder = channel !== 'offline';
  const [method, setMethod] = useState<PaymentMethod>(isOnlineOrder ? 'qris' : 'tunai');
  const [cashInput, setCashInput] = useState<string>('');
  const [isCleanInput, setIsCleanInput] = useState<boolean>(true);
  const [onlineOrderCode, setOnlineOrderCode] = useState<string>('');
  const [onlineVoucherDiscount, setOnlineVoucherDiscount] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      if (channel !== 'offline') {
        setMethod('qris');
      } else {
        setMethod('tunai');
      }
      setCashInput(total.toString());
      setIsCleanInput(true);
      setOnlineOrderCode('');
      setOnlineVoucherDiscount(null);
    }
  }, [visible, total, channel]);

  const cashPaid = parseInt(cashInput, 10) || 0;
  const kembalian = Math.max(0, cashPaid - total);
  const isCashSufficient = method === 'qris' || cashPaid >= total;

  const handleKeyPress = (k: string) => {
    setCashInput((prev) => {
      if (isCleanInput || prev === '0' || prev === '') {
        setIsCleanInput(false);
        if (k === '0' || k === '00' || k === '000') return '0';
        return k;
      }
      const next = prev + k;
      if (next.length > 9) return prev;
      return next;
    });
  };

  const handleBackspace = () => {
    setIsCleanInput(false);
    setCashInput((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleClear = () => {
    setIsCleanInput(false);
    setCashInput('0');
  };

  const setExact = () => {
    setCashInput(total.toString());
    setIsCleanInput(true);
  };

  const addCash = (amount: number) => {
    setCashInput(amount.toString());
    setIsCleanInput(true);
  };

  const handleConfirm = () => {
    if (isOnlineOrder) {
      if (!onlineOrderCode.trim()) {
        Alert.alert(
          'Wajib Diisi',
          `Nomor / Kode Pesanan Online wajib diisi untuk transaksi ${getChannelLabel(channel)}.`
        );
        return;
      }
      if (onlineVoucherDiscount === null || isNaN(onlineVoucherDiscount) || onlineVoucherDiscount < 0) {
        Alert.alert(
          'Diskon Voucher Belum Diisi',
          'Kasir wajib memeriksa & mengisi diskon voucher resto (ketik 0 atau tekan tombol Rp 0 jika tanpa diskon).'
        );
        return;
      }
    }
    if (!isCashSufficient) return;
    const finalCash = method === 'tunai' ? cashPaid : total;
    const finalChange = method === 'tunai' ? kembalian : 0;
    onConfirmPayment(
      method,
      finalCash,
      finalChange,
      isOnlineOrder ? onlineOrderCode.trim() : undefined,
      isOnlineOrder ? (onlineVoucherDiscount || 0) : 0
    );
  };

  // Smart dynamic quick cash presets that scale seamlessly for any order size
  const quickCashPresets = useMemo(() => {
    if (total <= 0) return [20000, 50000, 100000];
    const presets = new Set<number>();

    // 1. Next 10.000 increment
    const next10k = Math.ceil(total / 10000) * 10000;
    if (next10k > total) presets.add(next10k);

    // 2. Next 20.000 increment
    const next20k = Math.ceil(total / 20000) * 20000;
    if (next20k > total) presets.add(next20k);

    // 3. Next 50.000 increment
    const next50k = Math.ceil(total / 50000) * 50000;
    if (next50k > total) presets.add(next50k);

    // 4. Next 100.000 increment
    const next100k = Math.ceil(total / 100000) * 100000;
    if (next100k > total) presets.add(next100k);

    // 5. Common big bills
    const commonBills = [50000, 100000, 200000, 500000];
    for (const b of commonBills) {
      if (b > total) presets.add(b);
    }

    return Array.from(presets)
      .sort((a, b) => a - b)
      .slice(0, 3);
  }, [total]);

  // ==================== INLINE LANDSCAPE MODE ====================
  if (inline) {
    if (!visible) return null;

    const safeLeft = Math.max(insets.left, 8);
    const safeRight = Math.max(insets.right, 8);

    return (
      <View style={[inlineStyles.container, { paddingLeft: safeLeft, paddingRight: safeRight, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 4) }]}>
        {/* ===== LEFT PANEL: Order Summary ===== */}
        <View style={inlineStyles.leftPanel}>
          {/* Back Button */}
          <TouchableOpacity
            style={inlineStyles.backBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <ArrowLeft size={15} color="#0284C7" />
            <Text style={inlineStyles.backBtnText}>Kembali</Text>
          </TouchableOpacity>

          {/* Order Summary Header */}
          <Text style={inlineStyles.orderTitle}>Ringkasan Pesanan</Text>

          {/* Items Table Header */}
          <View style={inlineStyles.tableHeader}>
            <Text style={[inlineStyles.tableHeaderText, { flex: 1 }]}>Produk</Text>
            <Text style={[inlineStyles.tableHeaderText, { width: 40, textAlign: 'center' }]}>Qty</Text>
            <Text style={[inlineStyles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Subtotal</Text>
          </View>

          {/* Items ScrollView */}
          <ScrollView
            style={inlineStyles.orderItemsScroll}
            showsVerticalScrollIndicator={false}
          >
            {cartItems.map((item) => (
              <View key={`pay-item-${item.uid}`} style={inlineStyles.orderItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={inlineStyles.orderItemName} numberOfLines={2}>
                    {item.menuItem.nama}
                  </Text>
                  {item.selectedVariants.length > 0 && (
                    <Text style={inlineStyles.orderItemVariant} numberOfLines={1}>
                      + {item.selectedVariants.map((v) => v.nama_varian).join(', ')}
                    </Text>
                  )}
                </View>
                <Text style={inlineStyles.orderItemQty}>{item.qty}x</Text>
                <Text style={inlineStyles.orderItemSubtotal}>{formatIDR(item.subtotal)}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Grand Total */}
          <View style={inlineStyles.grandTotalBar}>
            <Text style={inlineStyles.grandTotalLabel}>Grand Total</Text>
            <Text style={inlineStyles.grandTotalValue}>{formatIDR(total)}</Text>
          </View>
        </View>

        {/* ===== CENTER PANEL: Payment Form ===== */}
        <View style={inlineStyles.centerPanel}>
          <Text style={inlineStyles.paymentTitle}>Pembayaran</Text>

          {/* Method Selector */}
          {isOnlineOrder && (
            <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, padding: 6, marginBottom: 8 }}>
              <Text style={{ fontSize: 10, color: '#1E40AF', lineHeight: 14 }}>
                Pesanan <Text style={{ fontWeight: 'bold' }}>{getChannelLabel(channel)}</Text> hanya menerima non-tunai (QRIS). Dana otomatis masuk ke <Text style={{ fontWeight: 'bold' }}>Rekening Owner</Text>.
              </Text>
            </View>
          )}
          <View style={inlineStyles.methodRow}>
            <TouchableOpacity
              style={[
                inlineStyles.methodBtn,
                method === 'tunai' && inlineStyles.methodBtnActive,
                isOnlineOrder && { opacity: 0.35 },
              ]}
              onPress={() => !isOnlineOrder && setMethod('tunai')}
              disabled={isOnlineOrder}
              activeOpacity={0.7}
            >
              <Banknote size={14} color={method === 'tunai' ? '#FFFFFF' : '#64748B'} />
              <Text style={[inlineStyles.methodBtnText, method === 'tunai' && inlineStyles.methodBtnTextActive]}>
                Tunai
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[inlineStyles.methodBtn, method === 'qris' && inlineStyles.methodBtnActive, isOnlineOrder && { flex: 2 }]}
              onPress={() => setMethod('qris')}
              activeOpacity={0.7}
            >
              <QrCode size={14} color={method === 'qris' ? '#FFFFFF' : '#64748B'} />
              <Text style={[inlineStyles.methodBtnText, method === 'qris' && inlineStyles.methodBtnTextActive]}>
                QRIS (Rek. Owner)
              </Text>
            </TouchableOpacity>
          </View>

          {method === 'tunai' ? (
            <View style={inlineStyles.cashSection}>
              {/* Cash Input Display */}
              <View style={inlineStyles.cashInputCard}>
                <Text style={inlineStyles.cashInputLabel}>Jumlah Bayar</Text>
                <Text style={inlineStyles.cashInputValue}>{formatIDR(cashPaid)}</Text>
              </View>

              {/* Change Display */}
              <View style={[
                inlineStyles.changeCard,
                cashPaid < total ? inlineStyles.changeCardInsufficient : inlineStyles.changeCardSufficient,
              ]}>
                <Text style={inlineStyles.changeLabel}>
                  {cashPaid < total ? 'Kurang' : 'Kembalian'}
                </Text>
                <Text style={[
                  inlineStyles.changeValue,
                  cashPaid < total ? inlineStyles.changeValueInsufficient : inlineStyles.changeValueSufficient,
                ]}>
                  {cashPaid < total ? formatIDR(total - cashPaid) : formatIDR(kembalian)}
                </Text>
              </View>

              {/* Confirm Button */}
              <TouchableOpacity
                style={[inlineStyles.confirmBtn, !isCashSufficient && inlineStyles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={!isCashSufficient || isProcessing}
                activeOpacity={0.8}
              >
                <CheckCircle2 size={16} color="#FFFFFF" />
                <Text style={inlineStyles.confirmBtnText}>
                  {isProcessing ? 'Menyimpan...' : 'Konfirmasi & Bayar'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {isOnlineOrder && (
                <View style={inlineStyles.onlineCodeBox}>
                  <Text style={inlineStyles.onlineCodeLabel}>No. Pesanan Online / Kode Order:</Text>
                  <TextInput
                    style={inlineStyles.onlineCodeInput}
                    value={onlineOrderCode}
                    onChangeText={setOnlineOrderCode}
                    placeholder="Contoh: GF-1029, SP-4412, GRAB-880"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                  />
                </View>
              )}
              {isOnlineOrder && (
                <View style={[inlineStyles.onlineCodeBox, { marginTop: 6, borderColor: onlineVoucherDiscount === null ? '#F59E0B' : '#E2E8F0' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={inlineStyles.onlineCodeLabel}>Diskon Voucher Resto (Rp):</Text>
                    {onlineVoucherDiscount === null ? (
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#D97706' }}>Wajib Diisi Kasir</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#16A34A' }}>Sudah Diisi</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TextInput
                      style={[inlineStyles.onlineCodeInput, { flex: 1 }]}
                      value={onlineVoucherDiscount !== null ? onlineVoucherDiscount.toString() : ''}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9]/g, '');
                        setOnlineVoucherDiscount(clean === '' ? null : parseInt(clean, 10));
                      }}
                      placeholder="Wajib diisi (0 jika tanpa diskon)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                    />
                    <TouchableOpacity
                      onPress={() => setOnlineVoucherDiscount(0)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 6,
                        backgroundColor: onlineVoucherDiscount === 0 ? '#0284C7' : '#E2E8F0',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: onlineVoucherDiscount === 0 ? '#FFFFFF' : '#475569' }}>
                        Rp 0
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <QrisDisplay total={total} isCompact={true} />
              <TouchableOpacity
                style={[inlineStyles.confirmBtn, { marginTop: 10 }]}
                onPress={handleConfirm}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                <CheckCircle2 size={16} color="#FFFFFF" />
                <Text style={inlineStyles.confirmBtnText}>
                  {isProcessing ? 'Menyimpan...' : 'Konfirmasi Pembayaran QRIS'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>

        {/* ===== RIGHT PANEL: Keypad + Quick Cash ===== */}
        {method === 'tunai' && (
          <View style={inlineStyles.rightPanel}>
            {/* Quick Cash Presets */}
            <View style={inlineStyles.quickCashGrid}>
              {quickCashPresets.map((amt) => (
                <TouchableOpacity
                  key={`qc-${amt}`}
                  style={[
                    inlineStyles.quickCashChip,
                    cashPaid === amt && inlineStyles.quickCashChipActive,
                  ]}
                  onPress={() => addCash(amt)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    inlineStyles.quickCashText,
                    cashPaid === amt && inlineStyles.quickCashTextActive,
                  ]}>
                    {amt >= 1000 ? `${Math.round(amt / 1000)}rb` : formatIDR(amt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Compact Keypad */}
            <View style={inlineStyles.keypadContainer}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['00', '0', '000'],
                ['C', 'DEL'],
              ].map((row, ri) => (
                <View key={`kr-${ri}`} style={inlineStyles.keypadRow}>
                  {row.map((k) => {
                    if (k === 'C') {
                      return (
                        <TouchableOpacity
                          key="kc"
                          style={[inlineStyles.keyBtn, inlineStyles.keyBtnSpecial]}
                          onPress={handleClear}
                          activeOpacity={0.6}
                        >
                          <Text style={inlineStyles.keyClearText}>C</Text>
                        </TouchableOpacity>
                      );
                    }
                    if (k === 'DEL') {
                      return (
                        <TouchableOpacity
                          key="kdel"
                          style={[inlineStyles.keyBtn, inlineStyles.keyBtnSpecial]}
                          onPress={handleBackspace}
                          activeOpacity={0.6}
                        >
                          <Text style={inlineStyles.keyDelText}>⌫</Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={`k-${k}`}
                        style={inlineStyles.keyBtn}
                        onPress={() => handleKeyPress(k)}
                        activeOpacity={0.6}
                      >
                        <Text style={inlineStyles.keyText}>{k}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Uang Pas Button */}
            <TouchableOpacity
              style={[
                inlineStyles.uangPasBtn,
                cashPaid === total && inlineStyles.uangPasBtnActive,
              ]}
              onPress={setExact}
              activeOpacity={0.7}
            >
              <Text style={[
                inlineStyles.uangPasText,
                cashPaid === total && inlineStyles.uangPasTextActive,
              ]}>
                Uang Pas
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ==================== REGULAR MODAL MODE (Portrait) ====================
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, isLandscape && styles.overlayLandscape]}>
        <View style={[styles.content, isLandscape && styles.contentLandscape]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Pembayaran</Text>
              <Text style={styles.subtitle}>{getChannelLabel(channel)}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isProcessing}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Total Amount Card */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total Tagihan</Text>
              <Text style={styles.totalValue}>{formatIDR(total)}</Text>
            </View>

            {isOnlineOrder && (
              <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 11, color: '#1E40AF', lineHeight: 16 }}>
                  Pesanan <Text style={{ fontWeight: 'bold' }}>{getChannelLabel(channel)}</Text> hanya menerima non-tunai (QRIS). Dana otomatis masuk ke <Text style={{ fontWeight: 'bold' }}>Rekening Owner</Text>.
                </Text>
              </View>
            )}

            {isOnlineOrder && (
              <View style={styles.onlineCodeBox}>
                <Text style={styles.onlineCodeLabel}>No. Pesanan Online:</Text>
                <TextInput
                  style={styles.onlineCodeInput}
                  value={onlineOrderCode}
                  onChangeText={setOnlineOrderCode}
                  placeholder="Contoh: GF-1029, SP-4412, GRAB-880"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
              </View>
            )}

            {isOnlineOrder && (
              <View style={[styles.onlineCodeBox, { borderColor: onlineVoucherDiscount === null ? '#F59E0B' : '#CBD5E1' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.onlineCodeLabel}>Diskon Voucher Resto (Rp):</Text>
                  {onlineVoucherDiscount === null ? (
                    <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#D97706' }}>Wajib Diisi Kasir</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#16A34A' }}>Sudah Diisi</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.onlineCodeInput, { flex: 1 }]}
                    value={onlineVoucherDiscount !== null ? onlineVoucherDiscount.toString() : ''}
                    onChangeText={(val) => {
                      const clean = val.replace(/[^0-9]/g, '');
                      setOnlineVoucherDiscount(clean === '' ? null : parseInt(clean, 10));
                    }}
                    placeholder="Wajib diisi (0 jika tanpa diskon)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    onPress={() => setOnlineVoucherDiscount(0)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: onlineVoucherDiscount === 0 ? '#D97706' : '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: onlineVoucherDiscount === 0 ? '#FFFFFF' : '#475569' }}>
                      Rp 0
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Payment Method Selector */}
            <View style={styles.methodRow}>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  method === 'tunai' && styles.methodBtnActive,
                  isOnlineOrder && { opacity: 0.35 },
                ]}
                onPress={() => !isOnlineOrder && setMethod('tunai')}
                disabled={isOnlineOrder}
                activeOpacity={0.7}
              >
                <Banknote size={18} color={method === 'tunai' ? '#D97706' : '#64748B'} />
                <Text
                  style={[
                    styles.methodBtnText,
                    method === 'tunai' && styles.methodBtnTextActive,
                  ]}
                >
                  Tunai
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodBtn, method === 'qris' && styles.methodBtnActive, isOnlineOrder && { flex: 2 }]}
                onPress={() => setMethod('qris')}
                activeOpacity={0.7}
              >
                <QrCode size={18} color={method === 'qris' ? '#D97706' : '#64748B'} />
                <Text
                  style={[
                    styles.methodBtnText,
                    method === 'qris' && styles.methodBtnTextActive,
                  ]}
                >
                  QRIS (Rek. Owner)
                </Text>
              </TouchableOpacity>
            </View>

            {method === 'tunai' ? (
              <View style={styles.cashSection}>
                {/* Quick Cash Presets */}
                <View style={styles.quickCashRow}>
                  <TouchableOpacity
                    style={[styles.quickCashBtn, cashPaid === total && styles.quickCashBtnActive]}
                    onPress={setExact}
                  >
                    <Text style={styles.quickCashText}>Uang Pas</Text>
                  </TouchableOpacity>
                  {quickCashPresets.map((amt) => (
                      <TouchableOpacity
                        key={`cash-${amt}`}
                        style={[
                          styles.quickCashBtn,
                          cashPaid === amt && styles.quickCashBtnActive,
                        ]}
                        onPress={() => addCash(amt)}
                      >
                        <Text style={styles.quickCashText}>{formatIDR(amt)}</Text>
                      </TouchableOpacity>
                    ))}
                </View>

                {/* Cash Input & Change Display */}
                <View style={styles.cashDisplayContainer}>
                  <View style={styles.displayCol}>
                    <Text style={styles.displayLabel}>Diterima:</Text>
                    <Text style={styles.displayAmount}>{formatIDR(cashPaid)}</Text>
                  </View>
                  <View style={[styles.displayCol, styles.changeCol]}>
                    <Text style={styles.displayLabel}>Kembalian:</Text>
                    <Text
                      style={[
                        styles.changeAmount,
                        cashPaid < total && styles.insufficientChange,
                      ]}
                    >
                      {cashPaid < total ? 'Kurang ' + formatIDR(total - cashPaid) : formatIDR(kembalian)}
                    </Text>
                  </View>
                </View>

                {/* Numeric Keypad for custom cash amount */}
                <Keypad
                  onKeyPress={handleKeyPress}
                  onBackspace={handleBackspace}
                  onClear={handleClear}
                  showCashKeys={true}
                />
              </View>
            ) : (
              <View style={[styles.qrisSection, isLandscape && styles.qrisSectionLandscape]}>
                <QrisDisplay total={total} isCompact={isLandscape} />
              </View>
            )}
          </ScrollView>

          {/* Confirm Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                !isCashSufficient && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!isCashSufficient || isProcessing}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>
                {isProcessing
                  ? 'Menyimpan...'
                  : `Bayar ${formatIDR(total)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ==================== INLINE LANDSCAPE STYLES ====================
const inlineStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
  },

  // --- Left Panel: Order Summary ---
  leftPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
  },
  orderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderItemsScroll: {
    flex: 1,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  orderItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 16,
  },
  orderItemVariant: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '500',
    marginTop: 1,
  },
  orderItemQty: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  orderItemSubtotal: {
    width: 80,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  grandTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
  },

  // --- Center Panel: Payment Form ---
  centerPanel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  methodBtnActive: {
    borderColor: '#0284C7',
    backgroundColor: '#0284C7',
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  methodBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cashSection: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cashInputCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 8,
  },
  cashInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cashInputValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  changeCard: {
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
  },
  changeCardSufficient: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  changeCardInsufficient: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  changeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  changeValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  changeValueSufficient: {
    color: '#16A34A',
  },
  changeValueInsufficient: {
    color: '#DC2626',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // --- Right Panel: Keypad ---
  rightPanel: {
    width: 200,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    justifyContent: 'space-between',
  },
  quickCashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  quickCashChip: {
    flex: 1,
    minWidth: 55,
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickCashChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#0284C7',
  },
  quickCashText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  quickCashTextActive: {
    color: '#0284C7',
  },
  keypadContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 5,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 5,
  },
  keyBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  keyBtnSpecial: {
    backgroundColor: '#F1F5F9',
  },
  keyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  onlineCodeBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  onlineCodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  onlineCodeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  keyClearText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#DC2626',
  },
  keyDelText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
  },
  uangPasBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    marginTop: 5,
  },
  uangPasBtnActive: {
    backgroundColor: '#0284C7',
  },
  uangPasText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  uangPasTextActive: {
    color: '#FFFFFF',
  },
});

// ==================== REGULAR MODAL STYLES ====================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  overlayLandscape: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
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
    maxWidth: 500,
    borderRadius: 20,
    maxHeight: '96%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  totalCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 4,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  methodBtnActive: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  methodBtnTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  cashSection: {},
  quickCashRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickCashBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickCashBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  quickCashText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  cashDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  displayCol: {
    flex: 1,
  },
  changeCol: {
    alignItems: 'flex-end',
  },
  displayLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  displayAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  changeAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 2,
  },
  insufficientChange: {
    color: '#DC2626',
    fontSize: 13,
  },
  qrisSection: {
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
  },
  qrisSectionLandscape: {
    paddingVertical: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A', // Emerald green for payment confirmation
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  confirmBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  onlineCodeBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  onlineCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  onlineCodeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
});
