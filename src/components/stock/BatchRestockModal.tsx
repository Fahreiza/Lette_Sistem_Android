import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ingredient } from '../../types';
import { stockService } from '../../services/stockService';
import { desktopSyncService } from '../../services/desktopSyncService';
import { useSyncStore } from '../../stores/syncStore';
import { useAuthStore } from '../../stores/authStore';
import { formatIDR, formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import {
  ShoppingCart,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Building,
  Plus,
} from 'lucide-react-native';

interface BatchRestockModalProps {
  visible: boolean;
  ingredients: Ingredient[];
  onClose: () => void;
  onSaveSuccess?: () => void;
}

interface ItemEntry {
  qty: string;
  cost: string;
}

export const BatchRestockModal: React.FC<BatchRestockModalProps> = ({
  visible,
  ingredients,
  onClose,
  onSaveSuccess,
}) => {
  const { currentUser } = useAuthStore();
  const [entries, setEntries] = useState<Record<number, ItemEntry>>({});
  const [sumberDana, setSumberDana] = useState<'laci_kasir' | 'rekening_owner'>('laci_kasir');
  const [catatan, setCatatan] = useState('Belanja Pasar / Toko Harian');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setEntries({});
      setCatatan('Belanja Pasar / Toko Harian');
      setSearchQuery('');
      setSumberDana('laci_kasir');
    }
  }, [visible]);

  const updateEntry = (ingId: number, field: 'qty' | 'cost', value: string) => {
    setEntries((prev) => ({
      ...prev,
      [ingId]: {
        qty: field === 'qty' ? value : prev[ingId]?.qty || '',
        cost: field === 'cost' ? value : prev[ingId]?.cost || '',
      },
    }));
  };

  const filteredIngredients = useMemo(() => {
    if (!searchQuery.trim()) return ingredients;
    const q = searchQuery.toLowerCase().trim();
    return ingredients.filter((i) => i.nama.toLowerCase().includes(q));
  }, [ingredients, searchQuery]);

  // Grand total & valid items calculation
  const { grandTotal, activeItemCount } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const idStr of Object.keys(entries)) {
      const id = parseInt(idStr, 10);
      const entry = entries[id];
      const q = parseFloat(entry.qty.replace(',', '.')) || 0;
      const c = parseCurrencyInput(entry.cost);
      if (q > 0) {
        count++;
        total += c;
      }
    }
    return { grandTotal: total, activeItemCount: count };
  }, [entries]);

  const handleSubmit = async () => {
    if (activeItemCount === 0) {
      showToast({ type: 'warning', title: 'Belum Ada Bahan', message: 'Silakan isi jumlah belanja pada setidaknya 1 bahan.' });
      return;
    }

    const payload: { ingredient_id: number; jumlah_masuk: number; harga_total: number }[] = [];
    for (const idStr of Object.keys(entries)) {
      const id = parseInt(idStr, 10);
      const entry = entries[id];
      const q = parseFloat(entry.qty.replace(',', '.')) || 0;
      const c = parseCurrencyInput(entry.cost);
      if (q > 0) {
        payload.push({
          ingredient_id: id,
          jumlah_masuk: q,
          harga_total: c,
        });
      }
    }

    try {
      setIsSubmitting(true);
      const batchRes = await stockService.batchPurchaseStock(
        payload,
        sumberDana,
        catatan,
        currentUser?.id || 1
      );

      // Push each restocked item to Desktop POS if connected
      if (useSyncStore.getState().isConnected) {
        for (const item of payload) {
          const matchedIng = ingredients.find((i) => i.id === item.ingredient_id);
          desktopSyncService
            .pushStockPurchaseToDesktop({
              ingredient_id: item.ingredient_id,
              nama: matchedIng ? matchedIng.nama : '',
              jumlah_masuk: item.jumlah_masuk,
              total_biaya: item.harga_total,
              harga_beli_satuan: item.jumlah_masuk > 0 ? Math.round((item.harga_total / item.jumlah_masuk) * 100) / 100 : undefined,
              keterangan: catatan || `Restock belanja massal ${matchedIng ? matchedIng.nama : ''}`,
              actor_id: currentUser?.id || 1,
              actor_name: currentUser?.nama || 'Kasir',
            })
            .catch((e) => console.warn('[BatchRestock] Push item to desktop error:', e));
        }

        // Immediately push batch restock expense to Desktop POS
        if (batchRes?.expenseId && batchRes.grandTotalCost > 0) {
          desktopSyncService
            .pushExpenseToDesktop({
              id: batchRes.expenseId,
              tanggal: batchRes.timestamp,
              kategori: 'Belanja Bahan Baku',
              jumlah: batchRes.grandTotalCost,
              keterangan: batchRes.expDesc,
              input_by: currentUser?.id || 1,
              input_by_name: currentUser?.nama || 'Kasir',
              sumber_dana: batchRes.sumberDana,
            })
            .then(async (res) => {
              if (res?.success) {
                const { getDatabase } = await import('../../database/db');
                const db = await getDatabase();
                await db.runAsync('UPDATE expenses SET is_synced = 1 WHERE id = ?;', [batchRes.expenseId]).catch(() => {});
              }
            })
            .catch((e) => console.warn('[BatchRestock] Push expense to desktop error:', e));
        }
      }

      showToast({
        type: 'success',
        title: 'Belanja Disimpan',
        message: `Berhasil restock ${payload.length} bahan baku dengan total ${formatIDR(grandTotal)}.`,
      });
      onSaveSuccess?.();
      onClose();
    } catch (e: any) {
      console.error('Batch purchase error:', e);
      showToast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: e?.message || 'Terjadi kesalahan saat memproses belanja massal.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ShoppingCart size={18} color="#D97706" />
                <Text style={styles.title}>Belanja Restock Massal</Text>
              </View>
              <Text style={styles.subtitle}>Input banyak bahan sekaligus dari pasar / grosir</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isSubmitting}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama bahan baku..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <X size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Funding Source Selector */}
          <View style={styles.fundingSection}>
            <Text style={styles.sectionLabel}>Sumber Dana Pembayaran:</Text>
            <View style={styles.fundingRow}>
              <TouchableOpacity
                style={[styles.fundingBtn, sumberDana === 'laci_kasir' && styles.fundingBtnActive]}
                onPress={() => setSumberDana('laci_kasir')}
                activeOpacity={0.7}
              >
                <Wallet size={14} color={sumberDana === 'laci_kasir' ? '#D97706' : '#64748B'} />
                <Text style={[styles.fundingText, sumberDana === 'laci_kasir' && styles.fundingTextActive]}>
                  Laci Kasir (Kasbon)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fundingBtn, sumberDana === 'rekening_owner' && styles.fundingBtnActive]}
                onPress={() => setSumberDana('rekening_owner')}
                activeOpacity={0.7}
              >
                <Building size={14} color={sumberDana === 'rekening_owner' ? '#D97706' : '#64748B'} />
                <Text style={[styles.fundingText, sumberDana === 'rekening_owner' && styles.fundingTextActive]}>
                  Rekening Owner
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ingredients List Input */}
          <ScrollView style={styles.bodyList} showsVerticalScrollIndicator={false}>
            {filteredIngredients.map((ing) => {
              const entry = entries[ing.id] || { qty: '', cost: '' };
              const isLow = ing.stok_saat_ini <= ing.stok_minimum;
              const hasQty = parseFloat(entry.qty) > 0;

              return (
                <View
                  key={`batch-ing-${ing.id}`}
                  style={[styles.itemCard, hasQty && styles.itemCardActive]}
                >
                  <View style={styles.itemMeta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.itemName}>{ing.nama}</Text>
                      {isLow && (
                        <View style={styles.lowBadge}>
                          <AlertTriangle size={10} color="#DC2626" />
                          <Text style={styles.lowBadgeText}>Menipis</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemStock}>
                      Sisa saat ini: {ing.stok_saat_ini} {ing.satuan}
                    </Text>
                  </View>

                  {/* Input row: Jumlah & Total Biaya */}
                  <View style={styles.itemInputsRow}>
                    <View style={styles.inputColQty}>
                      <Text style={styles.inputColLabel}>+ Jumlah ({ing.satuan})</Text>
                      <TextInput
                        style={[styles.numInput, hasQty && styles.numInputActive]}
                        placeholder="0"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        value={entry.qty}
                        onChangeText={(val) => updateEntry(ing.id, 'qty', val)}
                      />
                    </View>

                    <View style={styles.inputColCost}>
                      <Text style={styles.inputColLabel}>Total Biaya (Rp)</Text>
                      <TextInput
                        style={[styles.numInput, hasQty && styles.numInputActive]}
                        placeholder="0"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        value={entry.cost}
                        onChangeText={(val) => updateEntry(ing.id, 'cost', formatCurrencyInput(val))}
                      />
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer Total Summary & Submit */}
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalCountText}>{activeItemCount} Bahan Dipilih</Text>
                <Text style={styles.totalAmountText}>{formatIDR(grandTotal)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, activeItemCount === 0 && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={activeItemCount === 0 || isSubmitting}
                activeOpacity={0.88}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>
                      {activeItemCount > 0 ? `Simpan Belanja (${activeItemCount} Bahan)` : 'Simpan Belanja'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    paddingVertical: 0,
  },
  fundingSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  fundingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fundingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fundingBtnActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  fundingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  fundingTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  bodyList: {
    paddingHorizontal: 16,
    maxHeight: 380,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemCardActive: {
    borderColor: '#D97706',
    backgroundColor: '#FFFEFA',
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  lowBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  itemStock: {
    fontSize: 10,
    color: '#64748B',
  },
  itemInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputColQty: {
    flex: 1,
  },
  inputColCost: {
    flex: 1.2,
  },
  inputColLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  numInput: {
    height: 36,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  numInputActive: {
    borderColor: '#D97706',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  totalAmountText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#D97706',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
