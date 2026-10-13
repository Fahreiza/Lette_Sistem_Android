import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { settingsService } from '../../services/settingsService';
import { Header } from '../../components/common/Header';
import { showToast } from '../../stores/toastStore';
import {
  Store,
  Percent,
  QrCode,
  Save,
  Phone,
  MapPin,
  Building,
  Sparkles,
  Camera,
  ImageIcon,
  Trash2,
  CreditCard,
} from 'lucide-react-native';

type SettingTab = 'profil' | 'pembayaran';

export const SettingsScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SettingTab>('profil');
  const [qrisImageUri, setQrisImageUri] = useState<string | null>(null);
  const [qrisPickerVisible, setQrisPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [namaToko, setNamaToko] = useState('Lette Roti Bakar');
  const [namaCabang, setNamaCabang] = useState('Cabang 1');
  const [alamatToko, setAlamatToko] = useState('');
  const [teleponToko, setTeleponToko] = useState('');
  const [footerStruk, setFooterStruk] = useState('');

  const [enableTax, setEnableTax] = useState(false);
  const [taxPercentage, setTaxPercentage] = useState('10');
  const [serviceCharge, setServiceCharge] = useState('0');

  const [qrisMerchant, setQrisMerchant] = useState('');
  const [qrisNmid, setQrisNmid] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      const s = await settingsService.getSettings();
      setNamaToko(s.nama_toko);
      setNamaCabang(s.nama_cabang);
      setAlamatToko(s.alamat_toko);
      setTeleponToko(s.telepon_toko);
      setFooterStruk(s.footer_struk);
      setEnableTax(s.enable_tax);
      setTaxPercentage(s.tax_percentage.toString());
      setServiceCharge(s.service_charge.toString());
      setQrisMerchant(s.qris_merchant_name || '');
      setQrisNmid(s.qris_nmid || '');
      setQrisImageUri(s.qris_image_url || null);
    } catch (e) {
      console.error('Failed to load settings:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat pengaturan.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const taxNum = parseFloat(taxPercentage) || 0;
      const svcNum = parseFloat(serviceCharge) || 0;

      await settingsService.updateSettings({
        nama_toko: namaToko,
        nama_cabang: namaCabang,
        alamat_toko: alamatToko,
        telepon_toko: teleponToko,
        footer_struk: footerStruk,
        enable_tax: enableTax,
        tax_percentage: taxNum,
        service_charge: svcNum,
        qris_merchant_name: qrisMerchant,
        qris_nmid: qrisNmid,
        qris_image_url: qrisImageUri || '',
      });

      showToast({ type: 'success', title: 'Sukses', message: 'Pengaturan berhasil disimpan.' });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Menyimpan', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color="#D97706" />
      </View>
    );
  }

  const pickQrisImage = async (fromCamera: boolean) => {
    const { status } = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      showToast({
        type: 'warning',
        title: 'Izin Diperlukan',
        message: fromCamera
          ? 'Izinkan akses kamera di pengaturan HP.'
          : 'Izinkan akses galeri di pengaturan HP.',
      });
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });

    if (!result.canceled && result.assets[0]) {
      const sourceUri = result.assets[0].uri;
      // Copy to permanent document directory so it survives cache clears
      const destFile = new File(Paths.document, 'qris_code.jpg');
      const sourceFile = new File(sourceUri);
      sourceFile.copy(destFile);
      setQrisImageUri(destFile.uri);
      setQrisPickerVisible(false);
    } else {
      setQrisPickerVisible(false);
    }
  };

  const handleDeleteQrisImage = async () => {
    Alert.alert('Hapus Foto QRIS', 'Yakin ingin menghapus gambar QR QRIS?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          if (qrisImageUri) {
            try {
              const f = new File(qrisImageUri);
              await f.delete();
            } catch (_) {}
          }
          setQrisImageUri(null);
          await settingsService.updateSettings({ qris_image_url: '' });
          showToast({ type: 'info', title: 'Dihapus', message: 'Gambar QRIS berhasil dihapus.' });
        },
      },
    ]);
  };

  const tabs: { key: SettingTab; label: string; icon: any }[] = [
    { key: 'profil', label: 'Profil Toko', icon: Store },
    { key: 'pembayaran', label: 'Pajak & QRIS', icon: CreditCard },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Pengaturan Toko" onBack={onBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={`tab-${tab.key}`}
                  style={[styles.tabChip, isActive && styles.tabChipActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Icon size={14} color={isActive ? '#FFFFFF' : '#64748B'} />
                  <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab 1: Profil Toko */}
        {activeTab === 'profil' && (
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nama Usaha</Text>
              <View style={styles.inputBox}>
                <Building size={15} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={namaToko}
                  onChangeText={setNamaToko}
                  placeholder="Lette Roti Bakar"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nama Cabang</Text>
              <View style={styles.inputBox}>
                <Store size={15} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={namaCabang}
                  onChangeText={setNamaCabang}
                  placeholder="Cabang 1"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>No. WhatsApp</Text>
              <View style={styles.inputBox}>
                <Phone size={15} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={teleponToko}
                  onChangeText={setTeleponToko}
                  placeholder="0812-xxxx-xxxx"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Alamat</Text>
              <View style={[styles.inputBox, styles.textAreaBox]}>
                <MapPin size={15} color="#94A3B8" style={[styles.inputIcon, { marginTop: 10 }]} />
                <TextInput
                  style={[styles.textInput, styles.textAreaInput]}
                  value={alamatToko}
                  onChangeText={setAlamatToko}
                  placeholder="Alamat outlet"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Pesan Struk (Footer)</Text>
              <View style={styles.inputBox}>
                <Sparkles size={15} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={footerStruk}
                  onChangeText={setFooterStruk}
                  placeholder="Terima kasih atas kunjungan Anda"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          </View>
        )}

        {/* Tab 2: Pajak & QRIS (Gabungan) */}
        {activeTab === 'pembayaran' && (
          <View style={{ gap: 12 }}>
            {/* Sub-section: Pajak */}
            <View style={styles.formCard}>
              <View style={styles.sectionDividerRow}>
                <Percent size={14} color="#D97706" />
                <Text style={styles.sectionDividerLabel}>PPN / Pajak</Text>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.switchTitle}>Aktifkan PPN</Text>
                  <Text style={styles.switchSub}>Tambah pajak otomatis ke tagihan</Text>
                </View>
                <Switch
                  value={enableTax}
                  onValueChange={setEnableTax}
                  trackColor={{ false: '#CBD5E1', true: '#FDE68A' }}
                  thumbColor={enableTax ? '#D97706' : '#F1F5F9'}
                />
              </View>

              {enableTax && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tarif Pajak (%)</Text>
                  <View style={styles.inputBox}>
                    <Percent size={15} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={taxPercentage}
                      onChangeText={setTaxPercentage}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Sub-section: QRIS */}
            <View style={styles.formCard}>
              <View style={styles.sectionDividerRow}>
                <QrCode size={14} color="#D97706" />
                <Text style={styles.sectionDividerLabel}>Informasi QRIS</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Merchant QRIS</Text>
                <View style={styles.inputBox}>
                  <Building size={15} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={qrisMerchant}
                    onChangeText={setQrisMerchant}
                    placeholder="LETTE ROTI BAKAR"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>NMID QRIS</Text>
                <View style={styles.inputBox}>
                  <QrCode size={15} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={qrisNmid}
                    onChangeText={setQrisNmid}
                    placeholder="ID102003004005"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* QRIS Photo Upload */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Foto QR Code QRIS</Text>

                {/* Preview */}
                {qrisImageUri ? (
                  <View style={styles.qrisPreviewWrapper}>
                    <Image
                      source={{ uri: qrisImageUri }}
                      style={styles.qrisPreviewImage}
                      resizeMode="contain"
                    />
                    <View style={styles.qrisPreviewBadge}>
                      <QrCode size={12} color="#FFFFFF" />
                      <Text style={styles.qrisPreviewBadgeText}>QR Tersimpan</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.qrisEmptyPreview}>
                    <QrCode size={36} color="#CBD5E1" />
                    <Text style={styles.qrisEmptyText}>Belum ada foto QR</Text>
                  </View>
                )}

                {/* Single Upload Button */}
                <TouchableOpacity
                  style={styles.qrisUploadBtn}
                  onPress={() => setQrisPickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <ImageIcon size={15} color="#92400E" />
                  <Text style={styles.qrisUploadBtnText}>
                    {qrisImageUri ? 'Ganti Foto QR' : 'Upload Foto QR'}
                  </Text>
                </TouchableOpacity>

                {/* Delete button */}
                {qrisImageUri && (
                  <TouchableOpacity
                    style={styles.qrisDeleteFullBtn}
                    onPress={handleDeleteQrisImage}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={13} color="#DC2626" />
                    <Text style={styles.qrisDeleteFullBtnText}>Hapus Foto QR</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Custom Image Picker Bottom Sheet */}
      <Modal
        visible={qrisPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQrisPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setQrisPickerVisible(false)}
        >
          <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            {/* Handle bar */}
            <View style={styles.pickerHandle} />

            <Text style={styles.pickerTitle}>Pilih Sumber Foto</Text>
            <Text style={styles.pickerSubtitle}>Ambil foto QR QRIS dari kamera atau pilih dari galeri HP</Text>

            {/* Options */}
            <View style={styles.pickerOptions}>
              <TouchableOpacity
                style={styles.pickerOption}
                activeOpacity={0.85}
                onPress={() => pickQrisImage(true)}
              >
                <View style={[styles.pickerOptionIcon, { backgroundColor: '#FFF7ED' }]}>
                  <Camera size={26} color="#EA580C" />
                </View>
                <View style={styles.pickerOptionText}>
                  <Text style={styles.pickerOptionTitle}>Kamera</Text>
                  <Text style={styles.pickerOptionSub}>Foto langsung dari kamera HP</Text>
                </View>
                <View style={styles.pickerChevron}>
                  <Text style={{ color: '#CBD5E1', fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.pickerSeparator} />

              <TouchableOpacity
                style={styles.pickerOption}
                activeOpacity={0.85}
                onPress={() => pickQrisImage(false)}
              >
                <View style={[styles.pickerOptionIcon, { backgroundColor: '#EFF6FF' }]}>
                  <ImageIcon size={26} color="#2563EB" />
                </View>
                <View style={styles.pickerOptionText}>
                  <Text style={styles.pickerOptionTitle}>Galeri Foto</Text>
                  <Text style={styles.pickerOptionSub}>Pilih dari galeri atau file di HP</Text>
                </View>
                <View style={styles.pickerChevron}>
                  <Text style={{ color: '#CBD5E1', fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => setQrisPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.pickerCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Floating Save Button */}
      <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Save size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.saveBtnText}>Simpan Pengaturan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },

  // Quick Device Cards
  quickHubRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  statusBadgeOnline: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeOffline: {
    backgroundColor: '#F1F5F9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotGreen: {
    backgroundColor: '#16A34A',
  },
  dotGray: {
    backgroundColor: '#94A3B8',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextOnline: {
    color: '#15803D',
  },
  statusTextOffline: {
    color: '#64748B',
  },
  quickCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  quickCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    marginBottom: 6,
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },

  // Category Tabs
  tabsContainer: {
    marginVertical: 2,
  },
  tabsScroll: {
    gap: 6,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Form Cards
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  dangerBorder: {
    borderColor: '#FECDD3',
  },

  // Input styling
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
  },
  textAreaBox: {
    alignItems: 'flex-start',
  },
  inputIcon: {
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  textAreaInput: {
    height: 52,
    textAlignVertical: 'top',
    paddingTop: 8,
  },

  // Switches
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Section divider inside card
  sectionDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 2,
  },
  sectionDividerLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // QRIS Photo Upload — premium redesign
  qrisPreviewWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
  },
  qrisPreviewImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#FFFFFF',
  },
  qrisPreviewBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  qrisPreviewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qrisEmptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 110,
    gap: 8,
  },
  qrisEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  qrisActionRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  qrisActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  qrisActionIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  qrisActionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  qrisActionSub: {
    fontSize: 10.5,
    color: '#B45309',
    fontWeight: '500',
  },
  qrisActionDivider: {
    width: 1,
    backgroundColor: '#FDE68A',
    marginVertical: 10,
  },
  qrisDeleteFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: '#FFF5F5',
  },
  qrisDeleteFullBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Single upload button
  qrisUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 11,
  },
  qrisUploadBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },

  // Bottom Sheet Picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  pickerOptions: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  pickerOptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerOptionText: {
    flex: 1,
    gap: 2,
  },
  pickerOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  pickerOptionSub: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  pickerChevron: {
    width: 24,
    alignItems: 'center',
  },
  pickerSeparator: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 14,
  },
  pickerCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 4,
    marginBottom: 4,
  },
  pickerCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },

  // Bottom Sticky Action Bar
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 12,
  },
  saveBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  saveBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
