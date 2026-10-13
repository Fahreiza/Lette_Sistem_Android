import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Transaction } from '../../types';
import { formatIDR, formatDateIndo, formatTransactionNo, getChannelLabel } from '../../utils/formatters';
import { exportService } from '../../services/exportService';
import { usePrinterStore } from '../../stores/printerStore';
import { bluetoothPrinterService } from '../../services/bluetoothPrinterService';
import { BluetoothPrinterModal } from '../printer/BluetoothPrinterModal';
import { showToast } from '../../stores/toastStore';
import { CheckCircle2, Share2, FileText, PlusCircle, Printer, Bluetooth } from 'lucide-react-native';

interface ReceiptSuccessModalProps {
  visible: boolean;
  transaction: Transaction | null;
  onNewOrder: () => void;
}

export const ReceiptSuccessModal: React.FC<ReceiptSuccessModalProps> = ({
  visible,
  transaction,
  onNewOrder,
}) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [isPrinting, setIsPrinting] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const { connectedPrinter, paperWidth } = usePrinterStore();

  const onlineOrderCode = useMemo(() => {
    const match = transaction?.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
    return match ? match[1].trim() : null;
  }, [transaction?.catatan]);

  if (!transaction) return null;

  const handlePrintThermal = async () => {
    if (!transaction) return;

    try {
      setIsPrinting(true);
      // Mengirimkan perintah cetak fisik nyata langsung ke Printer Thermal / Bluetooth
      await exportService.printThermalReceipt(transaction);
    } catch (e: any) {
      console.warn('Print thermal error:', e);
      showToast({ type: 'error', title: 'Gagal Mencetak', message: e?.message || 'Printer tidak merespons. Pastikan printer menyala dan terhubung.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleShareText = async () => {
    try {
      const text = exportService.generateReceiptText(transaction);
      await Share.share({
        message: text,
        title: `Struk Transaksi ${formatTransactionNo(transaction.id, transaction.tanggal)} - Lette Roti Bakar`,
      });
    } catch (e) {
      console.warn('Error sharing text receipt:', e);
    }
  };

  const handleSharePdf = async () => {
    try {
      await exportService.shareReceiptPdf(transaction);
    } catch (e) {
      console.warn('Error sharing pdf receipt:', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNewOrder}>
      <View style={styles.overlay}>
        <View style={[styles.card, isLandscape && styles.cardLandscape]}>
          {isLandscape ? (
            /* === LANDSCAPE COMPACT 2-COLUMN LAYOUT === */
            <View style={styles.landscapeRow}>
              {/* Left Column: Summary & New Order */}
              <View style={styles.landscapeLeftCol}>
                <View style={styles.landscapeHeaderRow}>
                  <View style={styles.iconCircleSmall}>
                    <CheckCircle2 size={16} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.titleSmall}>Transaksi Berhasil!</Text>
                    <Text style={styles.orderNumberSmall}>No: {formatTransactionNo(transaction.id, transaction.tanggal)} • {getChannelLabel(transaction.channel)}</Text>
                    {onlineOrderCode && (
                      <View style={styles.onlineOrderBadgeLandscape}>
                        <Text style={styles.onlineOrderBadgeTextLandscape}>No. Pesanan: {onlineOrderCode}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Total & Change Highlight Box */}
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Total Pembayaran</Text>
                  <Text style={styles.summaryTotal}>{formatIDR(transaction.total)}</Text>

                  {transaction.metode_bayar === 'tunai' && transaction.uang_diterima !== undefined && (
                    <View style={styles.cashDetailRow}>
                      <Text style={styles.cashDetailText}>
                        Tunai: {formatIDR(transaction.uang_diterima)}
                      </Text>
                      <Text style={[styles.cashDetailText, { color: '#15803D', fontWeight: '800' }]}>
                        Kembali: {formatIDR(transaction.kembalian ?? 0)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* New Order Button */}
                <TouchableOpacity
                  style={[styles.newOrderBtn, styles.newOrderBtnLandscape]}
                  onPress={onNewOrder}
                  activeOpacity={0.8}
                >
                  <PlusCircle size={14} color="#FFFFFF" />
                  <Text style={styles.newOrderBtnTextLandscape}>Pesanan Baru</Text>
                </TouchableOpacity>
              </View>

              {/* Right Column: Receipt Snippet & Actions */}
              <View style={styles.landscapeRightCol}>
                <ScrollView style={styles.snippetLandscape} showsVerticalScrollIndicator={false}>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{formatDateIndo(transaction.tanggal)}</Text>
                    <Text style={[styles.metaText, { fontWeight: '700' }]}>{transaction.metode_bayar.toUpperCase()}</Text>
                  </View>
                  {transaction.kasir_name && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>Kasir:</Text>
                      <Text style={[styles.metaText, { fontWeight: '600' }]}>{transaction.kasir_name}</Text>
                    </View>
                  )}
                  {onlineOrderCode && (
                    <View style={[styles.metaRow, { marginTop: 1 }]}>
                      <Text style={[styles.metaText, { color: '#B45309', fontWeight: '700' }]}>No. Pesanan:</Text>
                      <Text style={[styles.metaText, { color: '#B45309', fontWeight: '800' }]}>{onlineOrderCode}</Text>
                    </View>
                  )}
                  <View style={styles.divider} />

                  {transaction.items?.map((item, idx) => (
                    <View key={`item-${idx}`} style={{ marginBottom: 3 }}>
                      <View style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {item.qty}x {item.menu_name}
                        </Text>
                        <Text style={styles.itemPrice}>{formatIDR(item.subtotal)}</Text>
                      </View>
                      {item.variant_names ? (
                        <Text style={{ fontSize: 9, color: '#64748B', paddingLeft: 10 }}>
                          + {item.variant_names}
                        </Text>
                      ) : null}
                      {item.custom_notes ? (
                        <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#94A3B8', paddingLeft: 10 }}>
                          * {item.custom_notes}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>

                {/* Action Buttons: Print, WA, PDF */}
                <View style={styles.actionRowLandscape}>
                  <TouchableOpacity
                    style={styles.printBtnPrimary}
                    onPress={handlePrintThermal}
                    disabled={isPrinting}
                    activeOpacity={0.8}
                  >
                    {isPrinting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Printer size={13} color="#FFFFFF" />
                        <Text style={styles.printBtnPrimaryText}>Cetak</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionPillBtn}
                    onPress={handleShareText}
                    activeOpacity={0.7}
                  >
                    <Share2 size={13} color="#25D366" />
                    <Text style={styles.actionPillText}>WA</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionPillBtn}
                    onPress={handleSharePdf}
                    activeOpacity={0.7}
                  >
                    <FileText size={13} color="#D97706" />
                    <Text style={styles.actionPillText}>PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* === PORTRAIT DEFAULT LAYOUT === */
            <>
              {/* Success Icon */}
              <View style={styles.iconCircle}>
                <CheckCircle2 size={36} color="#16A34A" />
              </View>

              <Text style={styles.title}>Transaksi Berhasil!</Text>
              <Text style={styles.orderNumber}>No: {formatTransactionNo(transaction.id, transaction.tanggal)}</Text>

              {/* Receipt Info Snippet */}
              <ScrollView style={styles.snippet} showsVerticalScrollIndicator={false}>
                <View style={styles.row}>
                  <Text style={styles.label}>Waktu:</Text>
                  <Text style={styles.val}>{formatDateIndo(transaction.tanggal)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Channel:</Text>
                  <Text style={styles.val}>{getChannelLabel(transaction.channel)}</Text>
                </View>
                {transaction.kasir_name && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Kasir:</Text>
                    <Text style={styles.val}>{transaction.kasir_name}</Text>
                  </View>
                )}
                {onlineOrderCode && (
                  <View style={[styles.row, { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginVertical: 2 }]}>
                    <Text style={[styles.label, { color: '#B45309', fontWeight: '700' }]}>No. Pesanan:</Text>
                    <Text style={[styles.val, { color: '#92400E', fontWeight: '800' }]}>{onlineOrderCode}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.label}>Metode Bayar:</Text>
                  <Text style={styles.val}>{transaction.metode_bayar.toUpperCase()}</Text>
                </View>
                <View style={styles.divider} />

                {transaction.items?.map((item, idx) => (
                  <View key={`item-${idx}`} style={{ marginBottom: 4 }}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.qty}x {item.menu_name}
                      </Text>
                      <Text style={styles.itemPrice}>{formatIDR(item.subtotal)}</Text>
                    </View>
                    {item.variant_names ? (
                      <Text style={{ fontSize: 9.5, color: '#64748B', paddingLeft: 12 }}>
                        + {item.variant_names}
                      </Text>
                    ) : null}
                    {item.custom_notes ? (
                      <Text style={{ fontSize: 9.5, fontStyle: 'italic', color: '#94A3B8', paddingLeft: 12 }}>
                        * {item.custom_notes}
                      </Text>
                    ) : null}
                  </View>
                ))}

                {transaction.online_voucher_discount !== undefined && transaction.online_voucher_discount > 0 && (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: '#DC2626' }]}>Diskon Voucher:</Text>
                    <Text style={[styles.val, { color: '#DC2626', fontWeight: '700' }]}>
                      -{formatIDR(transaction.online_voucher_discount)}
                    </Text>
                  </View>
                )}
                {(() => {
                  const cleanNotes = (transaction.catatan || '')
                    .replace(/\[No\.\s*Pesanan:\s*[^\]]+\]/i, '')
                    .trim();
                  if (!cleanNotes) return null;
                  return (
                    <View style={[styles.row, { marginTop: 2 }]}>
                      <Text style={[styles.label, { fontStyle: 'italic' }]}>Catatan:</Text>
                      <Text style={[styles.val, { fontSize: 10, color: '#475569' }]}>{cleanNotes}</Text>
                    </View>
                  );
                })()}
                <View style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TOTAL</Text>
                  <Text style={styles.totalVal}>{formatIDR(transaction.total)}</Text>
                </View>

                {transaction.metode_bayar === 'tunai' && transaction.uang_diterima !== undefined && (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.label}>Bayar Tunai:</Text>
                      <Text style={styles.val}>{formatIDR(transaction.uang_diterima)}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>Kembalian:</Text>
                      <Text style={[styles.val, { color: '#059669', fontWeight: '800' }]}>
                        {formatIDR(transaction.kembalian ?? 0)}
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>

              {/* Primary Print Button */}
              <TouchableOpacity
                style={styles.printBtnPrimaryFull}
                onPress={handlePrintThermal}
                disabled={isPrinting}
                activeOpacity={0.8}
              >
                {isPrinting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Printer size={18} color="#FFFFFF" />
                    <Text style={styles.printBtnPrimaryText}>
                      {connectedPrinter
                        ? `Cetak Struk (${connectedPrinter.name})`
                        : 'Cetak Struk (Printer Termal)'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={handleShareText}
                  activeOpacity={0.7}
                >
                  <Share2 size={16} color="#25D366" />
                  <Text style={styles.shareBtnText}>Kirim WA</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={handleSharePdf}
                  activeOpacity={0.7}
                >
                  <FileText size={16} color="#D97706" />
                  <Text style={styles.shareBtnText}>Bagikan PDF</Text>
                </TouchableOpacity>
              </View>

              {/* New Order Button */}
              <TouchableOpacity
                style={styles.newOrderBtn}
                onPress={onNewOrder}
                activeOpacity={0.8}
              >
                <PlusCircle size={18} color="#FFFFFF" />
                <Text style={styles.newOrderBtnText}>Pesanan Baru</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Bluetooth Printer Modal */}
      <BluetoothPrinterModal
        visible={printerModalVisible}
        onClose={() => setPrinterModalVisible(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  cardLandscape: {
    maxWidth: 480,
    maxHeight: 275,
    padding: 10,
    borderRadius: 14,
  },
  landscapeRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'stretch',
    gap: 10,
  },
  landscapeLeftCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  landscapeRightCol: {
    flex: 1.15,
    justifyContent: 'space-between',
  },
  landscapeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  iconCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSmall: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  orderNumberSmall: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
  },
  onlineOrderBadgeLandscape: {
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  onlineOrderBadgeTextLandscape: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  summaryBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6,
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '700',
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  cashDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
    paddingTop: 4,
  },
  cashDetailText: {
    fontSize: 9.5,
    color: '#475569',
  },
  snippetLandscape: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  metaText: {
    fontSize: 9.5,
    color: '#64748B',
  },
  actionRowLandscape: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  printBtnPrimary: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    borderRadius: 6,
  },
  printBtnPrimaryFull: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  printBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  actionPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  orderNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
    marginBottom: 10,
  },
  snippet: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  label: {
    fontSize: 11,
    color: '#64748B',
  },
  val: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginRight: 6,
  },
  itemPrice: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  newOrderBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    borderRadius: 10,
  },
  newOrderBtnLandscape: {
    paddingVertical: 6,
    borderRadius: 7,
    gap: 4,
  },
  newOrderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newOrderBtnTextLandscape: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
