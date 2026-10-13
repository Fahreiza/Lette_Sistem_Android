import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { MenuItem, MenuVariant, OrderChannel, getVariantPriceForChannel } from '../../types';
import { formatIDR } from '../../utils/formatters';
import { getMenuItemPriceForChannel } from '../../stores/cartStore';
import { X, Check } from 'lucide-react-native';

interface VariantSelectionModalProps {
  visible: boolean;
  item: MenuItem | null;
  channel: OrderChannel;
  onClose: () => void;
  onConfirm: (item: MenuItem, selectedVariants: MenuVariant[], notes: string) => void;
  initialVariants?: MenuVariant[];
  initialNotes?: string;
  isEditing?: boolean;
}

export const VariantSelectionModal: React.FC<VariantSelectionModalProps> = ({
  visible,
  item,
  channel,
  onClose,
  onConfirm,
  initialVariants,
  initialNotes,
  isEditing = false,
}) => {
  const [selectedVariants, setSelectedVariants] = useState<MenuVariant[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedVariants(initialVariants || []);
      setNotes(initialNotes || '');
    }
  }, [visible, item, initialVariants, initialNotes]);

  if (!item) return null;

  const basePrice = getMenuItemPriceForChannel(item, channel);
  const extraPrice = selectedVariants.reduce((sum, v) => sum + getVariantPriceForChannel(v, channel), 0);
  const totalPrice = basePrice + extraPrice;

  const toggleVariant = (v: MenuVariant) => {
    const exists = selectedVariants.some((sv) => sv.nama_varian === v.nama_varian);
    if (exists) {
      setSelectedVariants(selectedVariants.filter((sv) => sv.nama_varian !== v.nama_varian));
    } else {
      setSelectedVariants([...selectedVariants, v]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{isEditing ? `Edit: ${item.nama}` : item.nama}</Text>
              <Text style={styles.subtitle}>
                {isEditing ? 'Ubah varian topping atau catatan' : `Harga Dasar: ${formatIDR(basePrice)}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Variants / Topping section */}
            {item.variants && item.variants.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pilih Topping / Varian Tambahan</Text>
                <Text style={styles.sectionSubtitle}>Bisa pilih lebih dari satu</Text>

                <View style={styles.variantList}>
                  {item.variants.map((v, idx) => {
                    const isSelected = selectedVariants.some(
                      (sv) => sv.nama_varian === v.nama_varian
                    );
                    const vPrice = getVariantPriceForChannel(v, channel);
                    return (
                      <TouchableOpacity
                        key={`v-${idx}`}
                        style={[styles.variantCard, isSelected && styles.variantCardSelected]}
                        onPress={() => toggleVariant(v)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.variantInfo}>
                          <View
                            style={[
                              styles.checkbox,
                              isSelected && styles.checkboxSelected,
                            ]}
                          >
                            {isSelected && <Check size={14} color="#FFFFFF" />}
                          </View>
                          <Text style={[styles.variantName, isSelected && styles.variantNameSelected]}>
                            {v.nama_varian}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.variantPrice,
                            isSelected && styles.variantPriceSelected,
                          ]}
                        >
                          +{formatIDR(vPrice)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Notes Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Catatan Khusus (Opsional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Contoh: jangan terlalu manis, keju dipisah, dll."
                placeholderTextColor="#94A3B8"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>
          </ScrollView>

          {/* Footer with total & add button */}
          <View style={styles.footer}>
            <View style={styles.totalInfo}>
              <Text style={styles.totalLabel}>Total Item</Text>
              <Text style={styles.totalAmount}>{formatIDR(totalPrice)}</Text>
            </View>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => onConfirm(item, selectedVariants, notes)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>
                {isEditing ? 'Simpan Perubahan' : '+ Tambah ke Pesanan'}
              </Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    marginBottom: 10,
  },
  variantList: {
    gap: 8,
  },
  variantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  variantCardSelected: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  variantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  variantName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  variantNameSelected: {
    fontWeight: '700',
    color: '#B45309',
  },
  variantPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  variantPriceSelected: {
    color: '#D97706',
    fontWeight: '700',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginTop: 8,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  totalInfo: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
  },
  confirmBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
