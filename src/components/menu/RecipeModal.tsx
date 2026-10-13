import React, { useState, useEffect } from 'react';
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
import { MenuItem, Ingredient, Recipe } from '../../types';
import { stockService } from '../../services/stockService';
import { desktopSyncService } from '../../services/desktopSyncService';
import { showToast } from '../../stores/toastStore';
import {
  UtensilsCrossed,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  Package,
  Layers,
} from 'lucide-react-native';

interface RecipeModalProps {
  visible: boolean;
  menuItem: MenuItem | null;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

interface RecipeRow {
  ingredient_id: number;
  ingredient_name: string;
  ingredient_unit: string;
  jumlah_terpakai: number;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  visible,
  menuItem,
  onClose,
  onSaveSuccess,
}) => {
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Selector state for adding new ingredient
  const [selectedIngId, setSelectedIngId] = useState<number | null>(null);
  const [inputUsage, setInputUsage] = useState<string>('');

  const loadRecipeData = async () => {
    if (!menuItem) return;
    try {
      setLoading(true);
      const [ings, existingRecipes] = await Promise.all([
        stockService.getAllIngredients(),
        stockService.getRecipesForMenuItem(menuItem.id),
      ]);

      setAllIngredients(ings);

      const mapped: RecipeRow[] = existingRecipes.map((r) => {
        const matchingIng = ings.find((i) => i.id === r.ingredient_id);
        return {
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient_name || matchingIng?.nama || 'Bahan',
          ingredient_unit: r.ingredient_unit || matchingIng?.satuan || 'gr',
          jumlah_terpakai: r.jumlah_terpakai,
        };
      });
      setRecipeRows(mapped);

      // Default selected ingredient for new addition
      const unusedIngs = ings.filter((i) => !mapped.some((m) => m.ingredient_id === i.id));
      if (unusedIngs.length > 0) {
        setSelectedIngId(unusedIngs[0].id);
      } else if (ings.length > 0) {
        setSelectedIngId(ings[0].id);
      }
      setInputUsage('');
    } catch (e) {
      console.error('Failed to load recipes:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat resep bahan baku.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && menuItem) {
      loadRecipeData();
    }
  }, [visible, menuItem]);

  const handleAddIngredient = () => {
    if (!selectedIngId) {
      showToast({ type: 'warning', title: 'Pilih Bahan', message: 'Silakan pilih bahan baku terlebih dahulu.' });
      return;
    }
    const usage = parseFloat(inputUsage.replace(',', '.'));
    if (isNaN(usage) || usage <= 0) {
      showToast({ type: 'warning', title: 'Jumlah Tidak Valid', message: 'Masukkan takaran bahan baku lebih dari 0.' });
      return;
    }

    const ing = allIngredients.find((i) => i.id === selectedIngId);
    if (!ing) return;

    // Check if already in recipe
    const existingIndex = recipeRows.findIndex((r) => r.ingredient_id === selectedIngId);
    if (existingIndex !== -1) {
      const updated = [...recipeRows];
      updated[existingIndex].jumlah_terpakai += usage;
      setRecipeRows(updated);
    } else {
      setRecipeRows([
        ...recipeRows,
        {
          ingredient_id: ing.id,
          ingredient_name: ing.nama,
          ingredient_unit: ing.satuan,
          jumlah_terpakai: usage,
        },
      ]);
    }

    setInputUsage('');
  };

  const handleRemoveRow = (index: number) => {
    setRecipeRows(recipeRows.filter((_, idx) => idx !== index));
  };

  const handleUpdateUsage = (index: number, val: string) => {
    const num = parseFloat(val.replace(',', '.')) || 0;
    const updated = [...recipeRows];
    updated[index].jumlah_terpakai = num;
    setRecipeRows(updated);
  };

  const handleSaveRecipe = async () => {
    if (!menuItem) return;
    try {
      setIsSaving(true);
      const payload = recipeRows
        .filter((r) => r.jumlah_terpakai > 0)
        .map((r) => ({
          ingredient_id: r.ingredient_id,
          jumlah_terpakai: r.jumlah_terpakai,
        }));

      await stockService.saveRecipesForMenuItem(menuItem.id, payload);
      desktopSyncService.pushRecipesToDesktop(menuItem.id, payload).catch((err) =>
        console.warn('[Recipe] Push to desktop failed:', err)
      );
      showToast({
        type: 'success',
        title: 'Sukses',
        message: `Resep ${menuItem.nama} berhasil disimpan (${payload.length} bahan dipetakan).`,
      });
      onSaveSuccess?.();
      onClose();
    } catch (e: any) {
      console.error('Save recipe error:', e);
      showToast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: e?.message || 'Terjadi kesalahan saat menyimpan resep.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!menuItem) return null;

  const currentSelectedIng = allIngredients.find((i) => i.id === selectedIngId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <UtensilsCrossed size={16} color="#D97706" />
                <Text style={styles.title}>Resep Bahan Baku</Text>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                Menu: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{menuItem.nama}</Text>
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isSaving}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#D97706" />
              <Text style={styles.loadingText}>Memuat resep bahan...</Text>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Info banner */}
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  Stok bahan di bawah akan otomatis terpotong setiap kali menu ini dipesan di kasir.
                </Text>
              </View>

              {/* Existing Recipes List */}
              <Text style={styles.sectionHeader}>Daftar Takaran Resep ({recipeRows.length})</Text>

              {recipeRows.length === 0 ? (
                <View style={styles.emptyRecipeBox}>
                  <Package size={32} color="#CBD5E1" />
                  <Text style={styles.emptyRecipeText}>Belum ada bahan baku yang dihubungkan ke menu ini.</Text>
                </View>
              ) : (
                <View style={styles.recipeList}>
                  {recipeRows.map((r, idx) => (
                    <View key={`r-${r.ingredient_id}`} style={styles.recipeCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recipeIngName}>{r.ingredient_name}</Text>
                        <Text style={styles.recipeUnitLabel}>Satuan: {r.ingredient_unit}</Text>
                      </View>

                      {/* Usage Input */}
                      <View style={styles.usageRow}>
                        <TextInput
                          style={styles.usageInput}
                          value={r.jumlah_terpakai > 0 ? r.jumlah_terpakai.toString() : ''}
                          onChangeText={(val) => handleUpdateUsage(idx, val)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                        />
                        <Text style={styles.usageUnit}>{r.ingredient_unit}</Text>

                        <TouchableOpacity
                          style={styles.deleteRowBtn}
                          onPress={() => handleRemoveRow(idx)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Add Ingredient Section */}
              <View style={styles.addSection}>
                <Text style={styles.sectionHeader}>Tambah Bahan ke Resep</Text>

                {/* Horizontal Ingredient Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ingChipsScroll}>
                  {allIngredients.map((ing) => {
                    const isSelected = selectedIngId === ing.id;
                    const isAlreadyIn = recipeRows.some((r) => r.ingredient_id === ing.id);
                    return (
                      <TouchableOpacity
                        key={`chip-${ing.id}`}
                        style={[
                          styles.ingChip,
                          isSelected && styles.ingChipSelected,
                          isAlreadyIn && styles.ingChipAlreadyIn,
                        ]}
                        onPress={() => setSelectedIngId(ing.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.ingChipText,
                            isSelected && styles.ingChipTextSelected,
                          ]}
                        >
                          {ing.nama} ({ing.satuan})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Usage amount & Add button */}
                <View style={styles.addInputRow}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>
                      Takaran Terpakai ({currentSelectedIng?.satuan || 'gr'}):
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder={`Contoh: 15 (dalam ${currentSelectedIng?.satuan || 'gr'})`}
                      placeholderTextColor="#94A3B8"
                      value={inputUsage}
                      onChangeText={setInputUsage}
                      keyboardType="numeric"
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={handleAddIngredient}
                    activeOpacity={0.8}
                  >
                    <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.addBtnText}>Tambah</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* Footer Save Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveRecipe}
              disabled={isSaving || loading}
              activeOpacity={0.88}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Simpan Resep Menu</Text>
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
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
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
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  infoBanner: {
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  emptyRecipeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  emptyRecipeText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  recipeList: {
    gap: 8,
    marginBottom: 14,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recipeIngName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  recipeUnitLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usageInput: {
    width: 60,
    height: 34,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 0,
  },
  usageUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    minWidth: 24,
  },
  deleteRowBtn: {
    padding: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    marginLeft: 2,
  },
  addSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ingChipsScroll: {
    gap: 6,
    paddingBottom: 10,
  },
  ingChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ingChipSelected: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  ingChipAlreadyIn: {
    opacity: 0.65,
  },
  ingChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  ingChipTextSelected: {
    color: '#B45309',
    fontWeight: '800',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  textInput: {
    height: 38,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
