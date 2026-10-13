import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { MenuItem } from '../../types';
import { menuService } from '../../services/menuService';
import { desktopSyncService } from '../../services/desktopSyncService';
import { formatCurrencyInput, parseCurrencyInput, formatIDR } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import { X, Save, Edit3, CheckCircle2, AlertCircle } from 'lucide-react-native';

interface QuickEditMenuModalProps {
  visible: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export const QuickEditMenuModal: React.FC<QuickEditMenuModalProps> = ({
  visible,
  item,
  onClose,
  onSaveSuccess,
}) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [nama, setNama] = useState('');
  const [statusTersedia, setStatusTersedia] = useState(true);
  const [priceOffline, setPriceOffline] = useState('');
  const [priceGoFood, setPriceGoFood] = useState('');
  const [priceShopeeFood, setPriceShopeeFood] = useState('');
  const [priceGrabFood, setPriceGrabFood] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setNama(item.nama);
      setStatusTersedia(item.status_tersedia === 1);
      setPriceOffline(formatCurrencyInput(item.harga_offline));
      setPriceGoFood(formatCurrencyInput(item.harga_gofood || item.harga_offline));
      setPriceShopeeFood(formatCurrencyInput(item.harga_shopeefood || item.harga_offline));
      setPriceGrabFood(formatCurrencyInput(item.harga_grabfood || item.harga_offline));
    }
  }, [visible, item]);

  if (!item) return null;

  const handleSave = async () => {
    if (!nama.trim()) {
      showToast({ type: 'warning', title: 'Nama Wajib', message: 'Nama menu tidak boleh kosong.' });
      return;
    }

    const offlineVal = parseCurrencyInput(priceOffline);
    if (offlineVal <= 0) {
      showToast({ type: 'warning', title: 'Harga Wajib', message: 'Harga kasir offline harus lebih dari 0.' });
      return;
    }

    const gofoodVal = parseCurrencyInput(priceGoFood) || offlineVal;
    const shopeeVal = parseCurrencyInput(priceShopeeFood) || offlineVal;
    const grabVal = parseCurrencyInput(priceGrabFood) || offlineVal;

    try {
      setIsSaving(true);
      let existingVariants = item.variants;
      if (!existingVariants || existingVariants.length === 0) {
        const fullItem = await menuService.getMenuItemById(item.id);
        if (fullItem?.variants && fullItem.variants.length > 0) {
          existingVariants = fullItem.variants;
        }
      }
      const safeVariants = existingVariants
        ? existingVariants.map((v) => ({ nama_varian: v.nama_varian, harga_tambahan: v.harga_tambahan }))
        : [];

      await menuService.updateMenuItem(
        item.id,
        {
          category_id: item.category_id,
          nama: nama.trim(),
          harga_offline: offlineVal,
          harga_gofood: gofoodVal,
          harga_shopeefood: shopeeVal,
          harga_grabfood: grabVal,
          status_tersedia: statusTersedia ? 1 : 0,
        },
        safeVariants
      );

      // Async sync to Desktop PC if available
      desktopSyncService
        .pushMenuItemToDesktop({
          id: item.id,
          category_id: item.category_id,
          nama: nama.trim(),
          harga_offline: offlineVal,
          harga_gofood: gofoodVal,
          harga_shopeefood: shopeeVal,
          harga_grabfood: grabVal,
          status_tersedia: statusTersedia ? 1 : 0,
          variants: safeVariants,
        })
        .catch(() => {});

      showToast({
        type: 'success',
        title: 'Menu Diperbarui',
        message: `Perubahan data "${nama.trim()}" berhasil disimpan.`,
      });
      onSaveSuccess();
      onClose();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: e?.message || 'Terjadi kesalahan saat menyimpan menu.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isLandscape && styles.overlayLandscape]}>
        <View style={[styles.content, isLandscape && styles.contentLandscape]}>
          {/* Header */}
          <View style={[styles.header, isLandscape && styles.headerLandscape]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIconBox, isLandscape && { width: 30, height: 30 }]}>
                <Edit3 size={isLandscape ? 15 : 17} color="#D97706" />
              </View>
              <View>
                <Text style={[styles.title, isLandscape && { fontSize: 14 }]}>Edit Menu di Kasir</Text>
                <Text style={[styles.subtitle, isLandscape && { fontSize: 10 }]}>Ubah harga dan ketersediaan menu langsung</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isSaving}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.body, isLandscape && styles.bodyLandscape]} showsVerticalScrollIndicator={false}>
            {/* Nama Menu */}
            <Text style={styles.label}>Nama Menu</Text>
            <TextInput
              style={styles.textInput}
              value={nama}
              onChangeText={setNama}
              placeholder="Nama menu..."
              placeholderTextColor="#94A3B8"
            />

            {/* Status Ketersediaan Switch */}
            <View style={[styles.switchRow, isLandscape && { marginTop: 8, padding: 8 }]}>
              <View>
                <Text style={styles.switchTitle}>Status Ketersediaan</Text>
                <Text style={styles.switchDesc}>
                  {statusTersedia ? 'Tersedia untuk dipesan' : 'Stok Habis (Dinonaktifkan)'}
                </Text>
              </View>
              <Switch
                value={statusTersedia}
                onValueChange={setStatusTersedia}
                trackColor={{ false: '#E2E8F0', true: '#FDE68A' }}
                thumbColor={statusTersedia ? '#D97706' : '#94A3B8'}
              />
            </View>

            {/* Harga Jual Per Channel */}
            <Text style={[styles.label, { marginTop: isLandscape ? 8 : 14 }]}>Harga Jual (Rp) - Otomatis Titik</Text>
            <View style={styles.priceInputsGrid}>
              <View style={styles.priceCol}>
                <Text style={styles.priceLabel}>Kasir / Offline</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={priceOffline}
                  onChangeText={(val) => setPriceOffline(formatCurrencyInput(val))}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: '#059669' }]}>GoFood</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={priceGoFood}
                  onChangeText={(val) => setPriceGoFood(formatCurrencyInput(val))}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: '#EA580C' }]}>ShopeeFood</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={priceShopeeFood}
                  onChangeText={(val) => setPriceShopeeFood(formatCurrencyInput(val))}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: '#16A34A' }]}>GrabFood</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={priceGrabFood}
                  onChangeText={(val) => setPriceGrabFood(formatCurrencyInput(val))}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer Save Button */}
          <View style={[styles.footer, isLandscape && styles.footerLandscape]}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={16} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Simpan Menu</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayLandscape: {
    padding: 10,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '90%',
  },
  contentLandscape: {
    maxWidth: 540,
    maxHeight: '96%',
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLandscape: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bodyLandscape: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerLandscape: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    marginBottom: 6,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  priceInputsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  priceCol: {
    width: '48%',
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  priceInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
