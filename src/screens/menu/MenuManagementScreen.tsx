import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MenuItem, MenuCategory, MenuVariant, MasterVariant, Ingredient, VariantIngredientEntry } from '../../types';
import { menuService } from '../../services/menuService';
import { stockService } from '../../services/stockService';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { useSyncStore } from '../../stores/syncStore';
import { Header } from '../../components/common/Header';
import { RecipeModal } from '../../components/menu/RecipeModal';
import { formatIDR, formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';
import { getCategoryTheme } from '../../utils/categoryTheme';
import { showToast } from '../../stores/toastStore';
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  X,
  CheckCircle2,
  FolderPlus,
  UtensilsCrossed,
  RefreshCw,
  Search,
  ChevronDown,
  Check,
  Boxes,
} from 'lucide-react-native';

export const MenuManagementScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isConnected } = useSyncStore();

  // Form Modal State
  const [menuModalVisible, setMenuModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCatId, setFormCatId] = useState<number>(1);
  const [priceOffline, setPriceOffline] = useState('');
  const [priceGoFood, setPriceGoFood] = useState('');
  const [priceShopeeFood, setPriceShopeeFood] = useState('');
  const [priceGrabFood, setPriceGrabFood] = useState('');
  const [formStatus, setFormStatus] = useState(1);
  const [formVariants, setFormVariants] = useState<{
    id?: number;
    nama_varian: string;
    harga_tambahan: number;
    harga_offline?: number;
    harga_gofood?: number;
    harga_shopeefood?: number;
    harga_grabfood?: number;
    master_variant_id?: number | null;
    ingredient_id?: number | null;
    jumlah_terpakai?: number;
    ingredient_nama?: string;
    ingredient_satuan?: string;
  }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Master Variants State
  const [masterVariants, setMasterVariants] = useState<MasterVariant[]>([]);
  const [masterModalVisible, setMasterModalVisible] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterCategoryFilter, setMasterCategoryFilter] = useState('all');
  const [isAddingMaster, setIsAddingMaster] = useState(false);
  const [newMasterName, setNewMasterName] = useState('');
  const [newMasterPrice, setNewMasterPrice] = useState('');
  const [newMasterPriceGofood, setNewMasterPriceGofood] = useState('');
  const [newMasterPriceShopeefood, setNewMasterPriceShopeefood] = useState('');
  const [newMasterPriceGrabfood, setNewMasterPriceGrabfood] = useState('');
  const [newMasterCategory, setNewMasterCategory] = useState('');
  const [isMasterCatDropdownOpen, setIsMasterCatDropdownOpen] = useState(false);
  const [newMasterIngredientId, setNewMasterIngredientId] = useState<number | null>(null);
  const [newMasterUsage, setNewMasterUsage] = useState('');
  const [newMasterIngredientsList, setNewMasterIngredientsList] = useState<VariantIngredientEntry[]>([]);
  const [editingMaster, setEditingMaster] = useState<MasterVariant | null>(null);
  const [isSavingMaster, setIsSavingMaster] = useState(false);

  // Variant Picker Modal State
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState('all');
  const [selectedMasterIds, setSelectedMasterIds] = useState<number[]>([]);
  const [activeItemForVariants, setActiveItemForVariants] = useState<MenuItem | null>(null);
  const [isAddingInPicker, setIsAddingInPicker] = useState(false);
  const [inlinePickerName, setInlinePickerName] = useState('');
  const [inlinePickerPrice, setInlinePickerPrice] = useState('');
  const [inlinePickerPriceGofood, setInlinePickerPriceGofood] = useState('');
  const [inlinePickerPriceShopeefood, setInlinePickerPriceShopeefood] = useState('');
  const [inlinePickerPriceGrabfood, setInlinePickerPriceGrabfood] = useState('');
  const [inlinePickerCategory, setInlinePickerCategory] = useState('');
  const [isInlineCatDropdownOpen, setIsInlineCatDropdownOpen] = useState(false);
  const [inlinePickerIngredientId, setInlinePickerIngredientId] = useState<number | null>(null);
  const [inlinePickerUsage, setInlinePickerUsage] = useState('');
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Recipe Modal State
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [selectedItemForRecipe, setSelectedItemForRecipe] = useState<MenuItem | null>(null);

  // Variant Stock Cut (Ingredient Picker) State
  const [ingPickerModalVisible, setIngPickerModalVisible] = useState(false);
  const [ingPickerTarget, setIngPickerTarget] = useState<'master' | 'inline' | null>(null);
  const [ingPickerSearch, setIngPickerSearch] = useState('');

  // Category Modal State
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Custom Delete Confirm Modal State
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{ id: number; nama: string } | null>(null);

  const filteredIngPickerList = useMemo(() => {
    const q = ingPickerSearch.toLowerCase().trim();
    if (!q) return ingredients;
    return ingredients.filter(
      (ing) =>
        ing.nama.toLowerCase().includes(q) ||
        (ing.satuan && ing.satuan.toLowerCase().includes(q))
    );
  }, [ingredients, ingPickerSearch]);

  const handleOpenIngPicker = (target: 'master' | 'inline') => {
    setIngPickerTarget(target);
    setIngPickerSearch('');
    setIngPickerModalVisible(true);
  };

  const handleSelectIng = (ing: Ingredient | null) => {
    if (ingPickerTarget === 'master') {
      if (ing) {
        setNewMasterIngredientsList(prev => {
          if (prev.some(e => e.ingredient_id === ing.id)) return prev;
          return [...prev, { ingredient_id: ing.id, jumlah_terpakai: 1 }];
        });
        setNewMasterIngredientId(ing.id);
        if (!newMasterUsage) setNewMasterUsage('1');
      } else {
        setNewMasterIngredientId(null);
        setNewMasterUsage('');
      }
    } else if (ingPickerTarget === 'inline') {
      setInlinePickerIngredientId(ing ? ing.id : null);
      if (ing && !inlinePickerUsage) {
        setInlinePickerUsage('1');
      } else if (!ing) {
        setInlinePickerUsage('');
      }
    }
    setIngPickerModalVisible(false);
    setIngPickerTarget(null);
  };

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [cats, items, mVariants, ings] = await Promise.all([
        menuService.getCategories(),
        menuService.getMenuItems(),
        menuService.getMasterVariants(),
        stockService.getAllIngredients(),
      ]);
      setCategories(cats);
      setMenuItems(items);
      setMasterVariants(mVariants);
      setIngredients(ings);
      if (cats.length > 0 && !formCatId) {
        setFormCatId(cats[0].id);
      }
    } catch (e) {
      console.error('Failed to load menu management data:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat data menu.' });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleSyncWithDesktop = async () => {
    try {
      setIsSyncing(true);
      const res = await desktopSyncService.syncMenuFromDesktop();
      if (res.success) {
        await loadData(false);
        showToast({
          type: 'success',
          title: 'Sinkronisasi Berhasil',
          message: `Katalog menu berhasil diselaraskan (${res.itemCount} menu).`,
        });
      } else {
        showToast({
          type: 'warning',
          title: 'Gagal Sinkronisasi',
          message: res.error || 'Pastikan PC Desktop aktif dan terhubung.',
        });
      }
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: e?.message || 'Gagal menyinkronkan menu.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await desktopSyncService.syncMenuFromDesktop().catch(() => { });
    await loadData(false);
    setRefreshing(false);
  };

  // Auto-refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadData(false);
      desktopSyncService.syncMenuFromDesktop().then((res) => {
        if (res.success) {
          loadData(false);
        }
      }).catch(() => { });
    }, [])
  );

  // Live WebSocket auto-refresh when Desktop updates catalog
  useEffect(() => {
    loadData(true);
    desktopSyncService.syncMenuFromDesktop().then((res) => {
      if (res.success) {
        loadData(false);
      }
    }).catch(() => { });

    const unsub = subscribeToSyncEvents(async (event) => {
      if (event === 'catalog') {
        console.log('[MenuManagement] Live catalog update received, syncing and reloading menu items...');
        await desktopSyncService.syncMenuFromDesktop().catch(() => { });
        loadData(false);
      }
    });
    return unsub;
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormCatId(categories[0]?.id || 1);
    setPriceOffline('');
    setPriceGoFood('');
    setPriceShopeeFood('');
    setPriceGrabFood('');
    setFormStatus(1);
    setFormVariants([]);
    setMenuModalVisible(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormName(item.nama);
    setFormCatId(item.category_id);
    setPriceOffline(formatCurrencyInput(item.harga_offline));
    setPriceGoFood(formatCurrencyInput(item.harga_gofood));
    setPriceShopeeFood(formatCurrencyInput(item.harga_shopeefood));
    setPriceGrabFood(formatCurrencyInput(item.harga_grabfood));
    setFormStatus(item.status_tersedia);
    setFormVariants(
      item.variants?.map((v) => ({
        id: v.id,
        nama_varian: v.nama_varian,
        harga_tambahan: v.harga_offline !== undefined ? v.harga_offline : (v.harga_tambahan || 0),
        harga_offline: v.harga_offline !== undefined ? v.harga_offline : (v.harga_tambahan || 0),
        harga_gofood: v.harga_gofood !== undefined ? v.harga_gofood : (v.harga_offline ?? v.harga_tambahan ?? 0),
        harga_shopeefood: v.harga_shopeefood !== undefined ? v.harga_shopeefood : (v.harga_offline ?? v.harga_tambahan ?? 0),
        harga_grabfood: v.harga_grabfood !== undefined ? v.harga_grabfood : (v.harga_offline ?? v.harga_tambahan ?? 0),
        master_variant_id: v.master_variant_id || null,
        ingredient_id: v.ingredient_id || null,
        jumlah_terpakai: v.jumlah_terpakai || 0,
        ingredient_nama: v.ingredient_nama,
        ingredient_satuan: v.ingredient_satuan,
      })) || []
    );
    setMenuModalVisible(true);
  };

  const openRecipeModal = (item: MenuItem) => {
    setSelectedItemForRecipe(item);
    setRecipeModalVisible(true);
  };

  const addVariantField = () => {
    setFormVariants([
      ...formVariants,
      {
        nama_varian: '',
        harga_tambahan: 0,
        harga_offline: 0,
        harga_gofood: 0,
        harga_shopeefood: 0,
        harga_grabfood: 0,
        master_variant_id: null,
      },
    ]);
  };

  const updateVariantField = (
    index: number,
    field: 'nama_varian' | 'harga_tambahan' | 'harga_offline' | 'harga_gofood' | 'harga_shopeefood' | 'harga_grabfood',
    value: string
  ) => {
    const next = [...formVariants];
    if (field === 'nama_varian') {
      next[index].nama_varian = value;
    } else {
      const parsed = parseCurrencyInput(value);
      if (field === 'harga_offline' || field === 'harga_tambahan') {
        next[index].harga_offline = parsed;
        next[index].harga_tambahan = parsed;
      } else {
        next[index][field] = parsed;
      }
    }
    setFormVariants(next);
  };

  const removeVariantField = (index: number) => {
    const next = formVariants.filter((_, i) => i !== index);
    setFormVariants(next);
  };

  const handleSaveItem = async () => {
    if (!formName.trim()) {
      showToast({
        type: 'warning',
        title: 'Form Belum Lengkap',
        message: 'Nama menu wajib diisi.',
      });
      return;
    }

    const off = parseCurrencyInput(priceOffline);
    if (off <= 0) {
      showToast({
        type: 'warning',
        title: 'Harga Wajib Diisi',
        message: 'Harga offline harus lebih dari 0.',
      });
      return;
    }

    try {
      setIsSaving(true);
      const gf = parseCurrencyInput(priceGoFood) || off;
      const sf = parseCurrencyInput(priceShopeeFood) || off;
      const grb = parseCurrencyInput(priceGrabFood) || off;

      const validVariants = formVariants
        .filter((v) => v.nama_varian.trim().length > 0)
        .map((v) => {
          const vOff = v.harga_offline !== undefined ? v.harga_offline : (v.harga_tambahan || 0);
          return {
            nama_varian: v.nama_varian.trim(),
            harga_tambahan: vOff,
            harga_offline: vOff,
            harga_gofood: v.harga_gofood !== undefined ? v.harga_gofood : vOff,
            harga_shopeefood: v.harga_shopeefood !== undefined ? v.harga_shopeefood : vOff,
            harga_grabfood: v.harga_grabfood !== undefined ? v.harga_grabfood : vOff,
            master_variant_id: v.master_variant_id || null,
            ingredient_id: v.ingredient_id || null,
            jumlah_terpakai: Number(v.jumlah_terpakai) || 0,
            ingredient_nama: v.ingredient_nama,
            ingredient_satuan: v.ingredient_satuan,
          };
        });
      const payload = {
        category_id: formCatId,
        nama: formName.trim(),
        harga_offline: off,
        harga_gofood: gf,
        harga_shopeefood: sf,
        harga_grabfood: grb,
        status_tersedia: formStatus,
      };

      if (editingItem) {
        await menuService.updateMenuItem(editingItem.id, payload, validVariants);
        desktopSyncService.pushMenuItemToDesktop({ id: editingItem.id, ...payload, variants: validVariants }).catch(() => { });
        showToast({
          type: 'success',
          title: 'Menu Diperbarui',
          message: `Menu "${payload.nama}" berhasil diperbarui.`,
        });
      } else {
        const newItemId = await menuService.createMenuItem(payload, validVariants);
        desktopSyncService.pushMenuItemToDesktop({ id: newItemId, ...payload, variants: validVariants }).catch(() => { });
        showToast({
          type: 'success',
          title: 'Menu Ditambahkan',
          message: `Menu "${payload.nama}" berhasil ditambahkan.`,
        });
      }

      setMenuModalVisible(false);
      loadData(false);
    } catch (e: any) {
      console.error('Save menu failed:', e);
      showToast({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: e?.message || 'Terjadi kesalahan.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Master Variant Helpers
  const masterVariantCategories = useMemo(() => {
    const cats = new Set<string>();
    masterVariants.forEach((mv) => {
      if (mv.kategori_varian && mv.kategori_varian.trim()) {
        cats.add(mv.kategori_varian.trim());
      } else {
        cats.add('Topping');
      }
    });
    return Array.from(cats).sort();
  }, [masterVariants]);

  const filteredMasterVariants = useMemo(() => {
    let list = masterVariants;
    if (masterCategoryFilter !== 'all') {
      list = list.filter(
        (mv) => (mv.kategori_varian || 'Topping').trim().toLowerCase() === masterCategoryFilter.toLowerCase()
      );
    }
    const q = masterSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (mv) =>
          mv.nama_varian.toLowerCase().includes(q) ||
          (mv.kategori_varian && mv.kategori_varian.toLowerCase().includes(q))
      );
    }
    return list;
  }, [masterVariants, masterCategoryFilter, masterSearch]);

  const activeCategoryName = useMemo(() => {
    if (!activeItemForVariants) return '';
    const c = categories.find((cat) => cat.id === activeItemForVariants.category_id);
    return c ? c.nama : '';
  }, [activeItemForVariants, categories]);

  const filteredPickerVariants = useMemo(() => {
    let list = masterVariants;
    if (pickerCategoryFilter === 'selected') {
      list = list.filter((mv) => selectedMasterIds.includes(mv.id));
    } else if (pickerCategoryFilter !== 'all') {
      list = list.filter(
        (mv) => (mv.kategori_varian || 'Topping').trim().toLowerCase() === pickerCategoryFilter.toLowerCase()
      );
    }
    const q = pickerSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (mv) =>
          mv.nama_varian.toLowerCase().includes(q) ||
          (mv.kategori_varian && mv.kategori_varian.toLowerCase().includes(q))
      );
    }
    // Urutkan varian yang sudah dipilih / tercentang di paling atas
    return [...list].sort((a, b) => {
      const aChecked = selectedMasterIds.includes(a.id) ? 0 : 1;
      const bChecked = selectedMasterIds.includes(b.id) ? 0 : 1;
      if (aChecked !== bChecked) return aChecked - bChecked;
      return a.nama_varian.localeCompare(b.nama_varian);
    });
  }, [masterVariants, pickerCategoryFilter, pickerSearch, selectedMasterIds]);

  const handleMasterPriceChange = (val: string) => {
    setNewMasterPrice(val);
  };

  const copyMasterPriceToAll = () => {
    setNewMasterPriceGofood(newMasterPrice);
    setNewMasterPriceShopeefood(newMasterPrice);
    setNewMasterPriceGrabfood(newMasterPrice);
  };

  const handleInlinePickerPriceChange = (val: string) => {
    setInlinePickerPrice(val);
  };

  const copyInlinePriceToAll = () => {
    setInlinePickerPriceGofood(inlinePickerPrice);
    setInlinePickerPriceShopeefood(inlinePickerPrice);
    setInlinePickerPriceGrabfood(inlinePickerPrice);
  };

  const resetMasterForm = () => {
    setEditingMaster(null);
    setIsAddingMaster(false);
    setIsMasterCatDropdownOpen(false);
    setNewMasterName('');
    setNewMasterPrice('');
    setNewMasterPriceGofood('');
    setNewMasterPriceShopeefood('');
    setNewMasterPriceGrabfood('');
    setNewMasterCategory('');
    setNewMasterIngredientId(null);
    setNewMasterUsage('');
    setNewMasterIngredientsList([]);
  };

  const handleSaveInlineVariant = async () => {
    if (!inlinePickerName.trim()) {
      showToast({ type: 'warning', title: 'Form Belum Lengkap', message: 'Nama varian wajib diisi.' });
      return;
    }
    const offPrice = parseCurrencyInput(inlinePickerPrice);
    const goPrice = inlinePickerPriceGofood ? parseCurrencyInput(inlinePickerPriceGofood) : offPrice;
    const shopeePrice = inlinePickerPriceShopeefood ? parseCurrencyInput(inlinePickerPriceShopeefood) : offPrice;
    const grabPrice = inlinePickerPriceGrabfood ? parseCurrencyInput(inlinePickerPriceGrabfood) : offPrice;
    const cat = inlinePickerCategory.trim() || 'Topping';
    const ingId = inlinePickerIngredientId || null;
    const usage = parseFloat(inlinePickerUsage.replace(',', '.')) || 0;
    const ingObj = ingredients.find((i) => i.id === ingId);

    try {
      setIsSavingInline(true);
      const newV = await menuService.addMasterVariant(
        inlinePickerName.trim(),
        offPrice,
        cat,
        ingId,
        usage,
        offPrice,
        goPrice,
        shopeePrice,
        grabPrice
      );
      desktopSyncService.pushMasterVariantToDesktop({
        id: newV.id,
        nama_varian: newV.nama_varian,
        harga_tambahan: offPrice,
        harga_offline: offPrice,
        harga_gofood: goPrice,
        harga_shopeefood: shopeePrice,
        harga_grabfood: grabPrice,
        kategori_varian: cat,
        ingredient_id: ingId,
        jumlah_terpakai: usage,
        ingredient_nama: ingObj?.nama,
        ingredient_satuan: ingObj?.satuan,
      }).catch(() => { });

      setSelectedMasterIds((prev) => (prev.includes(newV.id) ? prev : [...prev, newV.id]));
      showToast({
        type: 'success',
        title: 'Varian Ditambahkan',
        message: `"${newV.nama_varian}" tersimpan di pustaka & otomatis terpasang.`,
      });
      setInlinePickerName('');
      setInlinePickerPrice('');
      setInlinePickerPriceGofood('');
      setInlinePickerPriceShopeefood('');
      setInlinePickerPriceGrabfood('');
      setInlinePickerIngredientId(null);
      setInlinePickerUsage('');
      setIsAddingInPicker(false);
      await loadData(false);
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Membuat Varian', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSavingInline(false);
    }
  };

  const toggleCategorySelectionInPicker = (categoryName: string) => {
    const variantsInCat = masterVariants.filter(
      (mv) => (mv.kategori_varian || 'Topping').trim().toLowerCase() === categoryName.toLowerCase()
    );
    const catIds = variantsInCat.map((mv) => mv.id);
    const allSelected = catIds.length > 0 && catIds.every((id) => selectedMasterIds.includes(id));

    if (allSelected) {
      setSelectedMasterIds((prev) => prev.filter((id) => !catIds.includes(id)));
    } else {
      setSelectedMasterIds((prev) => Array.from(new Set([...prev, ...catIds])));
    }
  };

  const handleSaveMasterVariant = async () => {
    if (!newMasterName.trim()) {
      showToast({ type: 'warning', title: 'Form Belum Lengkap', message: 'Nama varian wajib diisi.' });
      return;
    }
    const offPrice = parseCurrencyInput(newMasterPrice);
    const goPrice = newMasterPriceGofood ? parseCurrencyInput(newMasterPriceGofood) : offPrice;
    const shopeePrice = newMasterPriceShopeefood ? parseCurrencyInput(newMasterPriceShopeefood) : offPrice;
    const grabPrice = newMasterPriceGrabfood ? parseCurrencyInput(newMasterPriceGrabfood) : offPrice;
    const cat = newMasterCategory.trim() || 'Topping';

    const normalizedList = newMasterIngredientsList.filter(e => e.ingredient_id && e.jumlah_terpakai > 0);
    const ingId = normalizedList.length > 0 ? normalizedList[0].ingredient_id : (newMasterIngredientId || null);
    const usage = normalizedList.length > 0 ? normalizedList[0].jumlah_terpakai : (parseFloat(newMasterUsage.replace(',', '.')) || 0);
    const ingObj = ingredients.find((i) => i.id === ingId);

    try {
      setIsSavingMaster(true);
      if (editingMaster) {
        await menuService.updateMasterVariant(
          editingMaster.id,
          newMasterName.trim(),
          offPrice,
          cat,
          ingId,
          usage,
          offPrice,
          goPrice,
          shopeePrice,
          grabPrice,
          normalizedList
        );
        desktopSyncService.pushMasterVariantToDesktop({
          id: editingMaster.id,
          nama_varian: newMasterName.trim(),
          harga_tambahan: offPrice,
          harga_offline: offPrice,
          harga_gofood: goPrice,
          harga_shopeefood: shopeePrice,
          harga_grabfood: grabPrice,
          kategori_varian: cat,
          ingredient_id: ingId,
          jumlah_terpakai: usage,
          ingredient_nama: ingObj?.nama,
          ingredient_satuan: ingObj?.satuan,
          ingredients_list: normalizedList,
        }).catch(() => { });
        showToast({
          type: 'success',
          title: 'Master Varian Diperbarui',
          message: `Varian "${newMasterName.trim()}" berhasil diperbarui & disinkronkan ke desktop.`,
        });
      } else {
        const added = await menuService.addMasterVariant(
          newMasterName.trim(),
          offPrice,
          cat,
          ingId,
          usage,
          offPrice,
          goPrice,
          shopeePrice,
          grabPrice,
          normalizedList
        );
        desktopSyncService.pushMasterVariantToDesktop({
          id: added.id,
          nama_varian: added.nama_varian,
          harga_tambahan: offPrice,
          harga_offline: offPrice,
          harga_gofood: goPrice,
          harga_shopeefood: shopeePrice,
          harga_grabfood: grabPrice,
          kategori_varian: cat,
          ingredient_id: ingId,
          jumlah_terpakai: usage,
          ingredient_nama: ingObj?.nama,
          ingredient_satuan: ingObj?.satuan,
          ingredients_list: normalizedList,
        }).catch(() => { });
        showToast({
          type: 'success',
          title: 'Master Varian Ditambahkan',
          message: `Varian "${newMasterName.trim()}" ditambahkan ke pustaka & disinkronkan ke desktop.`,
        });
      }
      resetMasterForm();
      await loadData(false);
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Menyimpan', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSavingMaster(false);
    }
  };

  const handleDeleteMasterVariant = (id: number, nama: string) => {
    setDeleteConfirmData({ id, nama });
    setDeleteConfirmVisible(true);
  };

  const confirmDeleteMasterVariant = async () => {
    if (!deleteConfirmData) return;
    const { id, nama } = deleteConfirmData;
    setDeleteConfirmVisible(false);
    setDeleteConfirmData(null);
    try {
      await menuService.deleteMasterVariant(id);
      desktopSyncService.deleteMasterVariantOnDesktop(id, nama).catch(() => { });
      await loadData(false);
      showToast({ type: 'info', title: 'Master Varian Dihapus', message: `"${nama}" telah dihapus.` });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Hapus', message: e?.message || 'Terjadi kesalahan.' });
    }
  };

  const handleOpenVariantsForItem = (item: MenuItem) => {
    setActiveItemForVariants(item);
    setPickerSearch('');
    setPickerCategoryFilter('all');
    setIsAddingInPicker(false);
    setInlinePickerName('');
    setInlinePickerPrice('');
    setInlinePickerCategory('');
    setInlinePickerIngredientId(null);
    setInlinePickerUsage('');
    const existing = item.variants || [];
    const masterIds = existing
      .map((v) => v.master_variant_id)
      .filter((id): id is number => typeof id === 'number' && id > 0);

    existing.forEach((v) => {
      if (!v.master_variant_id) {
        const matched = masterVariants.find(
          (m) => m.nama_varian.trim().toLowerCase() === v.nama_varian.trim().toLowerCase()
        );
        if (matched && !masterIds.includes(matched.id)) {
          masterIds.push(matched.id);
        }
      }
    });

    setSelectedMasterIds(masterIds);
    setPickerModalVisible(true);
  };

  const handleOpenPicker = () => {
    setActiveItemForVariants(null);
    setPickerSearch('');
    setPickerCategoryFilter('all');
    setIsAddingInPicker(false);
    setInlinePickerName('');
    setInlinePickerPrice('');
    setInlinePickerCategory('');
    setInlinePickerIngredientId(null);
    setInlinePickerUsage('');
    const currentMasterIds = formVariants
      .map((fv) => fv.master_variant_id)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    setSelectedMasterIds(currentMasterIds);
    setPickerModalVisible(true);
  };

  const toggleMasterSelection = (id: number) => {
    setSelectedMasterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPicker = () => {
    if (selectedMasterIds.length === filteredPickerVariants.length && filteredPickerVariants.length > 0) {
      setSelectedMasterIds([]);
    } else {
      setSelectedMasterIds(filteredPickerVariants.map((mv) => mv.id));
    }
  };

  const handleApplySelectedMasters = async () => {
    const selectedMasters = masterVariants.filter((mv) => selectedMasterIds.includes(mv.id));

    // Jika dibuka langsung dari kartu menu
    if (activeItemForVariants) {
      try {
        setIsSaving(true);
        const newVariants = selectedMasters.map((sm) => {
          const off = sm.harga_offline !== undefined ? sm.harga_offline : (sm.harga_tambahan || 0);
          return {
            nama_varian: sm.nama_varian,
            harga_tambahan: off,
            harga_offline: off,
            harga_gofood: sm.harga_gofood !== undefined ? sm.harga_gofood : off,
            harga_shopeefood: sm.harga_shopeefood !== undefined ? sm.harga_shopeefood : off,
            harga_grabfood: sm.harga_grabfood !== undefined ? sm.harga_grabfood : off,
            master_variant_id: sm.id,
            ingredient_id: sm.ingredient_id || null,
            jumlah_terpakai: Number(sm.jumlah_terpakai) || 0,
            ingredient_nama: sm.ingredient_nama,
            ingredient_satuan: sm.ingredient_satuan,
          };
        });

        await menuService.updateMenuItem(
          activeItemForVariants.id,
          {
            category_id: activeItemForVariants.category_id,
            nama: activeItemForVariants.nama,
            harga_offline: activeItemForVariants.harga_offline,
            harga_gofood: activeItemForVariants.harga_gofood,
            harga_shopeefood: activeItemForVariants.harga_shopeefood,
            harga_grabfood: activeItemForVariants.harga_grabfood,
            status_tersedia: activeItemForVariants.status_tersedia,
          },
          newVariants
        );

        desktopSyncService
          .pushMenuItemToDesktop({
            id: activeItemForVariants.id,
            category_id: activeItemForVariants.category_id,
            nama: activeItemForVariants.nama,
            harga_offline: activeItemForVariants.harga_offline,
            harga_gofood: activeItemForVariants.harga_gofood,
            harga_shopeefood: activeItemForVariants.harga_shopeefood,
            harga_grabfood: activeItemForVariants.harga_grabfood,
            status_tersedia: activeItemForVariants.status_tersedia,
            variants: newVariants,
          })
          .catch(() => { });

        showToast({
          type: 'success',
          title: 'Varian Disimpan',
          message: `${selectedMasters.length} varian terpasang pada menu "${activeItemForVariants.nama}".`,
        });
        setPickerModalVisible(false);
        setActiveItemForVariants(null);
        await loadData(false);
      } catch (err: any) {
        showToast({
          type: 'error',
          title: 'Gagal Menyimpan Varian',
          message: err?.message || 'Terjadi kesalahan.',
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Jika dipanggil dari dalam Form Modal Tambah/Edit Menu
    const nextVariants = [...formVariants];
    let addedCount = 0;
    for (const sm of selectedMasters) {
      const alreadyExists = nextVariants.some(
        (v) =>
          v.master_variant_id === sm.id ||
          v.nama_varian.toLowerCase().trim() === sm.nama_varian.toLowerCase().trim()
      );
      if (!alreadyExists) {
        const off = sm.harga_offline !== undefined ? sm.harga_offline : (sm.harga_tambahan || 0);
        nextVariants.push({
          nama_varian: sm.nama_varian,
          harga_tambahan: off,
          harga_offline: off,
          harga_gofood: sm.harga_gofood !== undefined ? sm.harga_gofood : off,
          harga_shopeefood: sm.harga_shopeefood !== undefined ? sm.harga_shopeefood : off,
          harga_grabfood: sm.harga_grabfood !== undefined ? sm.harga_grabfood : off,
          master_variant_id: sm.id,
          ingredient_id: sm.ingredient_id || null,
          jumlah_terpakai: Number(sm.jumlah_terpakai) || 0,
          ingredient_nama: sm.ingredient_nama,
          ingredient_satuan: sm.ingredient_satuan,
        });
        addedCount++;
      }
    }

    // Saring varian master yang telah di-uncheck
    const filteredNext = nextVariants.filter((v) => {
      if (v.master_variant_id) {
        return selectedMasterIds.includes(v.master_variant_id);
      }
      return true;
    });

    setFormVariants(filteredNext);
    setPickerModalVisible(false);
    showToast({
      type: 'success',
      title: 'Varian Terpasang',
      message: `${selectedMasterIds.length} varian master terpilih.`,
    });
  };

  const handleDeleteItem = (id: number, nama: string) => {
    Alert.alert(
      'Hapus Menu',
      `Apakah Anda yakin ingin menghapus menu "${nama}" beserta resep dan variannya?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await menuService.deleteMenuItem(id);
              await loadData(false);
              showToast({
                type: 'info',
                title: 'Menu Dihapus',
                message: `Menu "${nama}" berhasil dihapus.`,
              });
            } catch (e: any) {
              showToast({
                type: 'error',
                title: 'Gagal Hapus',
                message: e?.message || 'Terjadi kesalahan.',
              });
            }
          },
        },
      ]
    );
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const nextStatus = item.status_tersedia === 1 ? 0 : 1;
      await menuService.toggleAvailability(item.id, nextStatus);
      desktopSyncService.pushMenuItemToDesktop({ ...item, status_tersedia: nextStatus }).catch(() => { });
      loadData(false);
      showToast({
        type: 'info',
        title: 'Status Menu',
        message: `"${item.nama}" kini ${nextStatus === 1 ? 'TERSEDIA' : 'HABIS'}.`,
      });
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Gagal memperbarui status ketersediaan.',
      });
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cleanName = newCatName.trim();
      const newCat = await menuService.addCategory(cleanName);
      desktopSyncService.pushCategoryToDesktop(newCat).catch(() => { });
      showToast({
        type: 'success',
        title: 'Kategori Ditambahkan',
        message: `Kategori "${cleanName}" berhasil dibuat.`,
      });
      setNewCatName('');
      setCatModalVisible(false);
      loadData(false);
    } catch (e: any) {
      showToast({
        type: 'error',
        title: 'Gagal Tambah Kategori',
        message: e?.message || 'Terjadi kesalahan.',
      });
    }
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCatId === null || item.category_id === selectedCatId;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        (item.category_name && item.category_name.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [menuItems, selectedCatId, searchQuery]);

  return (
    <View style={styles.container}>
      <Header title="Menu & Varian" onBack={onBack} />

      {/* Top Controls: Search, Sync, Actions, and Category Filters */}
      <View style={styles.topSection}>
        {/* Row 1: Search Input & Sync PC Button */}
        <View style={styles.searchAndSyncRow}>
          <View style={styles.searchBar}>
            <Search size={15} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama menu..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.searchClearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={13} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.syncBtn, isSyncing && styles.syncBtnLoading]}
            onPress={handleSyncWithDesktop}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <RefreshCw size={14} color="#2563EB" />
            )}
            <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync PC'}</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: Action Buttons (Kategori, Master Varian, Menu Baru) */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.addCatBtn}
            onPress={() => setCatModalVisible(true)}
            activeOpacity={0.7}
          >
            <FolderPlus size={15} color="#D97706" />
            <Text style={styles.addCatBtnText}>Kategori</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.masterVarBtn}
            onPress={() => {
              setNewMasterName('');
              setNewMasterPrice('');
              setNewMasterCategory('');
              setEditingMaster(null);
              setIsAddingMaster(false);
              setMasterCategoryFilter('all');
              setMasterSearch('');
              setMasterModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Sparkles size={14} color="#7C3AED" />
            <Text style={styles.masterVarBtnText}>Master Varian</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addMenuBtn}
            onPress={openAddModal}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.addMenuBtnText}>Menu Baru</Text>
          </TouchableOpacity>
        </View>

        {/* Row 3: Category Filter Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <TouchableOpacity
            style={[
              styles.catFilterChip,
              selectedCatId === null && styles.catFilterChipActive,
            ]}
            onPress={() => setSelectedCatId(null)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.catFilterText,
                selectedCatId === null && styles.catFilterTextActive,
              ]}
            >
              Semua ({menuItems.length})
            </Text>
          </TouchableOpacity>

          {categories.map((c) => {
            const isActive = selectedCatId === c.id;
            const theme = getCategoryTheme(c.nama);
            const count = menuItems.filter((i) => i.category_id === c.id).length;
            return (
              <TouchableOpacity
                key={`cat-filter-${c.id}`}
                style={[
                  styles.catFilterChip,
                  isActive && { backgroundColor: theme.bgColor, borderColor: theme.color },
                ]}
                onPress={() => setSelectedCatId(c.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.catDot, { backgroundColor: theme.color }]} />
                <Text
                  style={[
                    styles.catFilterText,
                    isActive && { color: theme.color, fontWeight: '800' },
                  ]}
                >
                  {c.nama} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Menu List */}
      {loading ? (
        <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#D97706']}
            />
          }
        >
          {filteredItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <UtensilsCrossed size={38} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Menu tidak ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `Tidak ada menu yang cocok dengan "${searchQuery}"`
                  : 'Belum ada menu di kategori ini'}
              </Text>
            </View>
          ) : (
            filteredItems.map((item) => (
              <View key={`menu-${item.id}`} style={styles.menuItemCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.nama}</Text>
                    <Text style={styles.cardCat}>{item.category_name || 'Kategori'}</Text>
                  </View>

                  {/* Availability Switch */}
                  <View style={styles.availabilityBox}>
                    <Text
                      style={[
                        styles.availText,
                        item.status_tersedia ? styles.availOn : styles.availOff,
                      ]}
                    >
                      {item.status_tersedia ? 'Tersedia' : 'Habis'}
                    </Text>
                    <Switch
                      value={item.status_tersedia === 1}
                      onValueChange={() => handleToggleAvailability(item)}
                      thumbColor={item.status_tersedia ? '#16A34A' : '#94A3B8'}
                      trackColor={{ true: '#BBF7D0', false: '#E2E8F0' }}
                    />
                  </View>
                </View>

                {/* Price Grid per Channel */}
                <View style={styles.priceGrid}>
                  <View style={styles.priceCol}>
                    <Text style={styles.priceChannelLabel}>Offline</Text>
                    <Text style={styles.priceVal}>{formatIDR(item.harga_offline)}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.priceChannelLabel}>GoFood</Text>
                    <Text style={styles.priceVal}>{formatIDR(item.harga_gofood)}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.priceChannelLabel}>ShopeeFood</Text>
                    <Text style={styles.priceVal}>{formatIDR(item.harga_shopeefood)}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.priceChannelLabel}>GrabFood</Text>
                    <Text style={styles.priceVal}>{formatIDR(item.harga_grabfood)}</Text>
                  </View>
                </View>

                {/* Variants / Toppings chips */}
                {item.variants && item.variants.length > 0 && (
                  <TouchableOpacity
                    style={styles.variantChipRow}
                    onPress={() => handleOpenVariantsForItem(item)}
                    activeOpacity={0.7}
                  >
                    {item.variants.map((v, vIdx) => {
                      const price = v.harga_tambahan || 0;
                      return (
                        <View key={`v-chip-${vIdx}`} style={styles.vChip}>
                          <Text style={styles.vChipText}>
                            {v.nama_varian}{price > 0 ? ` (+${formatIDR(price)})` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </TouchableOpacity>
                )}

                {/* Actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionBtnVariant}
                    onPress={() => handleOpenVariantsForItem(item)}
                    activeOpacity={0.7}
                  >
                    <Sparkles size={12} color="#7C3AED" />
                    <Text style={styles.actionBtnVariantText}>
                      {item.variants && item.variants.length > 0 ? `${item.variants.length} Varian` : 'Varian'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnRecipe}
                    onPress={() => openRecipeModal(item)}
                    activeOpacity={0.7}
                  >
                    <UtensilsCrossed size={13} color="#D97706" />
                    <Text style={styles.actionBtnRecipeText}>Resep</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnEdit}
                    onPress={() => openEditModal(item)}
                  >
                    <Edit2 size={13} color="#0369A1" />
                    <Text style={styles.actionBtnEditText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnDelete}
                    onPress={() => handleDeleteItem(item.id, item.nama)}
                  >
                    <Trash2 size={13} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add / Edit Menu Modal */}
      <Modal visible={menuModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.menuModalContainer}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <UtensilsCrossed size={20} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>
                    {editingItem ? 'Edit Data Menu' : 'Tambah Menu Baru'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Atur nama, kategori, harga & varian
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setMenuModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginTop: 6 }} showsVerticalScrollIndicator={false}>
              {/* SECTION 1: Informasi Menu & Kategori */}
              <View style={styles.menuFormCard}>
                <Text style={styles.fieldLabel}>Nama Menu</Text>
                <TextInput
                  style={styles.textInputStyled}
                  placeholder="Contoh: Roti Bakar Coklat Keju"
                  placeholderTextColor="#94A3B8"
                  value={formName}
                  onChangeText={setFormName}
                />

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Pilih Kategori *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                  {categories.map((c) => {
                    const isSelected = formCatId === c.id;
                    return (
                      <TouchableOpacity
                        key={`select-cat-${c.id}`}
                        style={[
                          styles.catChipStyled,
                          isSelected && styles.catChipStyledActive,
                        ]}
                        onPress={() => setFormCatId(c.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.catChipTextStyled,
                            isSelected && styles.catChipTextStyledActive,
                          ]}
                        >
                          {isSelected ? '✓ ' : ''}{c.nama}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* SECTION 2: Harga Jual 4 Channel */}
              <View style={styles.menuFormCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={styles.formSectionTitle}>Harga Jual Per Channel</Text>
                  <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Dalam Rupiah (Rp)</Text>
                </View>

                <View style={styles.channelPriceGrid}>
                  {/* Offline */}
                  <View style={[styles.channelPriceCard, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}>
                    <View style={styles.channelPriceHeader}>
                      <View style={[styles.channelDot, { backgroundColor: '#475569' }]} />
                      <Text style={[styles.channelPriceName, { color: '#334155' }]}>Offline / Kasir</Text>
                    </View>
                    <View style={styles.priceInputWrapper}>
                      <Text style={styles.pricePrefix}>Rp</Text>
                      <TextInput
                        style={styles.priceInputModern}
                        placeholder="0"
                        placeholderTextColor="#CBD5E1"
                        keyboardType="numeric"
                        value={priceOffline}
                        onChangeText={setPriceOffline}
                      />
                    </View>
                  </View>

                  {/* GoFood */}
                  <View style={[styles.channelPriceCard, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
                    <View style={styles.channelPriceHeader}>
                      <View style={[styles.channelDot, { backgroundColor: '#16A34A' }]} />
                      <Text style={[styles.channelPriceName, { color: '#15803D' }]}>GoFood</Text>
                    </View>
                    <View style={styles.priceInputWrapper}>
                      <Text style={[styles.pricePrefix, { color: '#16A34A' }]}>Rp</Text>
                      <TextInput
                        style={[styles.priceInputModern, { color: '#15803D' }]}
                        placeholder="0"
                        placeholderTextColor="#86EFAC"
                        keyboardType="numeric"
                        value={priceGoFood}
                        onChangeText={setPriceGoFood}
                      />
                    </View>
                  </View>

                  {/* ShopeeFood */}
                  <View style={[styles.channelPriceCard, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
                    <View style={styles.channelPriceHeader}>
                      <View style={[styles.channelDot, { backgroundColor: '#EA580C' }]} />
                      <Text style={[styles.channelPriceName, { color: '#C2410C' }]}>ShopeeFood</Text>
                    </View>
                    <View style={styles.priceInputWrapper}>
                      <Text style={[styles.pricePrefix, { color: '#EA580C' }]}>Rp</Text>
                      <TextInput
                        style={[styles.priceInputModern, { color: '#C2410C' }]}
                        placeholder="0"
                        placeholderTextColor="#FDBA74"
                        keyboardType="numeric"
                        value={priceShopeeFood}
                        onChangeText={setPriceShopeeFood}
                      />
                    </View>
                  </View>

                  {/* GrabFood */}
                  <View style={[styles.channelPriceCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                    <View style={styles.channelPriceHeader}>
                      <View style={[styles.channelDot, { backgroundColor: '#059669' }]} />
                      <Text style={[styles.channelPriceName, { color: '#047857' }]}>GrabFood</Text>
                    </View>
                    <View style={styles.priceInputWrapper}>
                      <Text style={[styles.pricePrefix, { color: '#059669' }]}>Rp</Text>
                      <TextInput
                        style={[styles.priceInputModern, { color: '#047857' }]}
                        placeholder="0"
                        placeholderTextColor="#6EE7B7"
                        keyboardType="numeric"
                        value={priceGrabFood}
                        onChangeText={setPriceGrabFood}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* SECTION 3: Varian Menu */}
              <View style={styles.menuFormCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View>
                    <Text style={styles.formSectionTitle}>Varian</Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>{formVariants.length} varian terpasang</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={handleOpenPicker}
                      style={styles.callMasterBtnModern}
                      activeOpacity={0.7}
                    >
                      <Sparkles size={13} color="#7C3AED" />
                      <Text style={styles.callMasterBtnModernText}>+ Varian</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {formVariants.length === 0 ? (
                  <View style={styles.emptyVariantsBox}>
                    <Sparkles size={20} color="#CBD5E1" />
                    <Text style={styles.emptyVariantsText}>Belum ada varian pada menu ini.</Text>
                  </View>
                ) : (
                  formVariants.map((v, idx) => (
                    <View key={`form-var-${idx}`} style={styles.varCardItem}>
                      <View style={{ flex: 2 }}>
                        <TextInput
                          style={styles.varNameInputModern}
                          placeholder="Nama varian"
                          placeholderTextColor="#94A3B8"
                          value={v.nama_varian}
                          onChangeText={(t) => updateVariantField(idx, 'nama_varian', t)}
                        />
                        {v.master_variant_id ? (
                          <View style={styles.masterBadgeRow}>
                            <Sparkles size={10} color="#7C3AED" />
                            <Text style={styles.masterBadgeText}>Master Varian</Text>
                          </View>
                        ) : null}
                        {v.ingredient_id && v.jumlah_terpakai ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <Text style={{ fontSize: 9, color: '#D97706', fontWeight: '700' }}>
                              🌾 Potong: {v.jumlah_terpakai} {v.ingredient_satuan || ''} {v.ingredient_nama || ''}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.varPriceWrapper}>
                        <Text style={styles.varPricePrefix}>+Rp</Text>
                        <TextInput
                          style={styles.varPriceInputModern}
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                          value={v.harga_tambahan ? v.harga_tambahan.toString() : ''}
                          onChangeText={(t) => updateVariantField(idx, 'harga_tambahan', t)}
                        />
                      </View>

                      <TouchableOpacity
                        style={styles.varDeleteBtnModern}
                        onPress={() => removeVariantField(idx)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={15} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* Modal Actions Footer */}
            <View style={styles.menuModalFooter}>
              <TouchableOpacity
                style={styles.menuCancelBtn}
                onPress={() => setMenuModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.menuCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuSaveBtn}
                onPress={handleSaveItem}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.menuSaveBtnText}>
                    {editingItem ? 'Simpan Perubahan' : 'Simpan Menu Baru'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Modal */}
      <Modal visible={catModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.catModal}>
            <Text style={styles.modalTitle}>Tambah Kategori Menu</Text>
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Contoh: Cemilan & Snack"
              value={newCatName}
              onChangeText={setNewCatName}
            />
            <View style={styles.catModalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCatModalVisible(false)}
              >
                <Text style={styles.cancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addCatConfirmBtn} onPress={handleAddCategory}>
                <Text style={styles.addCatConfirmText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Master Variant Library Modal */}
      <Modal visible={masterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.formModal, { height: '86%', maxWidth: 440, width: '94%', display: 'flex', flexDirection: 'column' }]}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#F3E8FF', padding: 7, borderRadius: 12 }}>
                  <Sparkles size={18} color="#7C3AED" />
                </View>
                <View>
                  <Text style={styles.modalTitle}> Master Varian</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    {masterVariants.length} varian global terdaftar
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setMasterModalVisible(false);
                  setEditingMaster(null);
                  setIsAddingMaster(false);
                }}
                style={styles.closeBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Actions Bar: Search + Button Tambah Baru */}
            {!isAddingMaster && !editingMaster && (
              <View style={{ marginTop: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={[styles.searchBar, { flex: 1, marginVertical: 0 }]}>
                    <Search size={14} color="#94A3B8" />
                    <TextInput
                      style={[styles.searchInput, { fontSize: 12 }]}
                      placeholder="Cari master varian..."
                      placeholderTextColor="#94A3B8"
                      value={masterSearch}
                      onChangeText={setMasterSearch}
                    />
                    {masterSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setMasterSearch('')}>
                        <X size={13} color="#64748B" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#7C3AED',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                    }}
                    onPress={() => {
                      setEditingMaster(null);
                      setNewMasterName('');
                      setNewMasterPrice('');
                      setNewMasterCategory('');
                      setIsAddingMaster(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Plus size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Tambah Baru</Text>
                  </TouchableOpacity>
                </View>

                {/* Filter Kategori Horizontal */}
                {masterVariantCategories.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    <TouchableOpacity
                      onPress={() => setMasterCategoryFilter('all')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 12,
                        backgroundColor: masterCategoryFilter === 'all' ? '#7C3AED' : '#F1F5F9',
                        marginRight: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: masterCategoryFilter === 'all' ? '#FFFFFF' : '#64748B' }}>
                        Semua ({masterVariants.length})
                      </Text>
                    </TouchableOpacity>
                    {masterVariantCategories.map((catName) => {
                      const count = masterVariants.filter((v) => (v.kategori_varian || 'Topping').trim().toLowerCase() === catName.toLowerCase()).length;
                      const active = masterCategoryFilter.toLowerCase() === catName.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={catName}
                          onPress={() => setMasterCategoryFilter(catName)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 12,
                            backgroundColor: active ? '#7C3AED' : '#F1F5F9',
                            marginRight: 6,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFFFFF' : '#64748B' }}>
                            {catName} ({count})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Form Input Section: Muncul saat Tambah Baru atau Edit */}
            {(isAddingMaster || Boolean(editingMaster)) && (
              <View style={styles.masterFormCard}>
                <View style={styles.masterFormHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View style={{ backgroundColor: '#F3E8FF', padding: 6, borderRadius: 10 }}>
                      <Sparkles size={16} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.masterFormTitle}>
                        {editingMaster ? '✏️ Edit Master Varian' : 'Tambah Varian Baru'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingMaster(null);
                      setIsAddingMaster(false);
                    }}
                    style={styles.masterFormCloseBtn}
                  >
                    <X size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Nama Varian */}
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>Nama Varian *</Text>
                  <TextInput
                    style={styles.textInputStyled}
                    value={newMasterName}
                    onChangeText={setNewMasterName}
                  />
                </View>

                {/* 4 Channel Harga Varian */}
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>Harga Tambahan Varian per Channel</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {/* Offline / Toko */}
                    <View style={[styles.variantChannelBox, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}>
                      <Text style={[styles.variantChannelLabel, { color: '#475569' }]}>Offline (Toko)</Text>
                      <View style={styles.variantChannelInputWrap}>
                        <Text style={styles.variantChannelPrefix}>Rp</Text>
                        <TextInput
                          style={styles.variantChannelInput}
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                          value={newMasterPrice}
                          onChangeText={handleMasterPriceChange}
                        />
                      </View>
                    </View>

                    {/* GoFood */}
                    <View style={[styles.variantChannelBox, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
                      <Text style={[styles.variantChannelLabel, { color: '#16A34A' }]}>GoFood</Text>
                      <View style={styles.variantChannelInputWrap}>
                        <Text style={[styles.variantChannelPrefix, { color: '#16A34A' }]}>Rp</Text>
                        <TextInput
                          style={[styles.variantChannelInput, { color: '#15803D' }]}
                          placeholder="0"
                          placeholderTextColor="#86EFAC"
                          keyboardType="numeric"
                          value={newMasterPriceGofood}
                          onChangeText={setNewMasterPriceGofood}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {/* ShopeeFood */}
                    <View style={[styles.variantChannelBox, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
                      <Text style={[styles.variantChannelLabel, { color: '#EA580C' }]}>ShopeeFood</Text>
                      <View style={styles.variantChannelInputWrap}>
                        <Text style={[styles.variantChannelPrefix, { color: '#EA580C' }]}>Rp</Text>
                        <TextInput
                          style={[styles.variantChannelInput, { color: '#C2410C' }]}
                          placeholder="0"
                          placeholderTextColor="#FDBA74"
                          keyboardType="numeric"
                          value={newMasterPriceShopeefood}
                          onChangeText={setNewMasterPriceShopeefood}
                        />
                      </View>
                    </View>

                    {/* GrabFood */}
                    <View style={[styles.variantChannelBox, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                      <Text style={[styles.variantChannelLabel, { color: '#059669' }]}>GrabFood</Text>
                      <View style={styles.variantChannelInputWrap}>
                        <Text style={[styles.variantChannelPrefix, { color: '#059669' }]}>Rp</Text>
                        <TextInput
                          style={[styles.variantChannelInput, { color: '#047857' }]}
                          placeholder="0"
                          placeholderTextColor="#6EE7B7"
                          keyboardType="numeric"
                          value={newMasterPriceGrabfood}
                          onChangeText={setNewMasterPriceGrabfood}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Kategori Varian */}
                <View style={{ marginTop: 10, zIndex: 20 }}>
                  <Text style={styles.fieldLabel}>Kategori Varian</Text>
                  <View style={{ position: 'relative' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={[styles.textInputStyled, { paddingVertical: 8, paddingRight: 36, flex: 1 }]}
                        value={newMasterCategory}
                        onChangeText={(t) => {
                          setNewMasterCategory(t);
                          setIsMasterCatDropdownOpen(true);
                        }}
                        onFocus={() => setIsMasterCatDropdownOpen(true)}
                        placeholder=""
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={{ position: 'absolute', right: 10, padding: 4 }}
                        onPress={() => setIsMasterCatDropdownOpen(!isMasterCatDropdownOpen)}
                      >
                        <ChevronDown size={16} color={isMasterCatDropdownOpen ? '#7C3AED' : '#94A3B8'} />
                      </TouchableOpacity>
                    </View>

                    {/* Floating Dropdown List Kategori */}
                    {isMasterCatDropdownOpen && (
                      <View style={styles.catDropdownList}>
                        <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          {masterVariantCategories.map((cat) => {
                            const isSelected = newMasterCategory.trim().toLowerCase() === cat.trim().toLowerCase();
                            return (
                              <TouchableOpacity
                                key={`m-cat-${cat}`}
                                style={[styles.catDropdownItem, isSelected && styles.catDropdownItemActive]}
                                onPress={() => {
                                  setNewMasterCategory(cat);
                                  setIsMasterCatDropdownOpen(false);
                                }}
                              >
                                <Text style={[styles.catDropdownItemText, isSelected && styles.catDropdownItemTextActive]}>
                                  {cat}
                                </Text>
                                {isSelected && <Check size={14} color="#7C3AED" />}
                              </TouchableOpacity>
                            );
                          })}
                          {newMasterCategory.trim() &&
                            !masterVariantCategories.some(
                              (c) => c.toLowerCase() === newMasterCategory.trim().toLowerCase()
                            ) && (
                              <TouchableOpacity
                                style={[styles.catDropdownItem, { backgroundColor: '#F3E8FF' }]}
                                onPress={() => setIsMasterCatDropdownOpen(false)}
                              >

                              </TouchableOpacity>
                            )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>

                {/* Hubungkan Pengurangan Bahan Baku Multi-Ingredients (Opsional) */}
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.fieldLabel}>Hubungkan Pengurangan Bahan Baku (Opsional)</Text>
                    <TouchableOpacity
                      onPress={() => handleOpenIngPicker('master')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' }}
                      activeOpacity={0.7}
                    >
                      <Plus size={12} color="#D97706" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>+ Tambah Bahan</Text>
                    </TouchableOpacity>
                  </View>

                  {/* List bahan yang sudah ditambahkan */}
                  {newMasterIngredientsList.length === 0 ? (
                    <TouchableOpacity
                      style={[styles.ingDropdownBtn, { marginTop: 6 }]}
                      onPress={() => handleOpenIngPicker('master')}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Boxes size={14} color="#94A3B8" />
                        <Text style={styles.ingDropdownText}>Belum ada bahan baku yang terhubung</Text>
                      </View>
                      <Plus size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ marginTop: 6, gap: 6 }}>
                      {newMasterIngredientsList.map((entry, idx) => {
                        const ing = ingredients.find(i => i.id === entry.ingredient_id);
                        return (
                          <View
                            key={idx}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: '#FFFBEB',
                              borderColor: '#FDE68A',
                              borderWidth: 1,
                              borderRadius: 12,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              gap: 8,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Boxes size={14} color="#D97706" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                                {ing?.nama || `#${entry.ingredient_id}`}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={styles.ingUsageBox}>
                                <TextInput
                                  style={styles.ingUsageInput}
                                  placeholder="Takaran"
                                  placeholderTextColor="#94A3B8"
                                  keyboardType="numeric"
                                  value={entry.jumlah_terpakai.toString()}
                                  onChangeText={(val) => {
                                    const num = parseFloat(val.replace(',', '.')) || 0;
                                    setNewMasterIngredientsList(prev => {
                                      const copy = [...prev];
                                      copy[idx] = { ...copy[idx], jumlah_terpakai: num };
                                      return copy;
                                    });
                                  }}
                                />
                                <Text style={styles.ingUsageUnit}>{ing?.satuan || ''}</Text>
                              </View>

                              <TouchableOpacity
                                onPress={() => {
                                  setNewMasterIngredientsList(prev => prev.filter((_, i) => i !== idx));
                                }}
                                style={{ padding: 4 }}
                                accessibilityLabel="Hapus bahan"
                              >
                                <X size={15} color="#DC2626" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {newMasterIngredientsList.length > 0 && (
                    <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600', marginTop: 4 }}>
                      * Setiap varian ini dipesan di kasir, seluruh bahan di atas otomatis terpotong sesuai takaran masing-masing.
                    </Text>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.masterFormActions}>
                  <TouchableOpacity
                    style={styles.masterFormCancelBtn}
                    onPress={resetMasterForm}
                  >
                    <Text style={styles.masterFormCancelText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.masterFormSaveBtn, isSavingMaster && { opacity: 0.6 }]}
                    onPress={async () => {
                      await handleSaveMasterVariant();
                      setIsAddingMaster(false);
                    }}
                    disabled={isSavingMaster}
                  >
                    {isSavingMaster ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.masterFormSaveText}>
                        {editingMaster ? 'Simpan Perubahan' : 'Simpan ke Pustaka'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* List Master Variants — hanya tampil saat tidak sedang isi form */}
            {!isAddingMaster && !editingMaster && (
              <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
                {filteredMasterVariants.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Sparkles size={28} color="#DDD6FE" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 8 }}>
                      {masterSearch ? 'Tidak ada varian yang cocok.' : 'Pustaka varian masih kosong.'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, textAlign: 'center' }}>
                      Tap tombol "Tambah Baru" di atas untuk membuat master varian.
                    </Text>
                  </View>
                ) : (
                  filteredMasterVariants.map((mv) => {
                    const offPrice = mv.harga_offline !== undefined ? mv.harga_offline : (mv.harga_tambahan || 0);
                    const goPrice = mv.harga_gofood !== undefined ? mv.harga_gofood : offPrice;
                    const shopeePrice = mv.harga_shopeefood !== undefined ? mv.harga_shopeefood : offPrice;
                    const grabPrice = mv.harga_grabfood !== undefined ? mv.harga_grabfood : offPrice;

                    return (
                      <View key={`mv-${mv.id}`} style={styles.masterItemRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.masterItemName}>{mv.nama_varian}</Text>
                            <View style={{ backgroundColor: '#F3E8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#EDE9FE' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>
                                {mv.kategori_varian || 'Topping'}
                              </Text>
                            </View>
                          </View>

                          {/* 4 Channel Price Badges */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#334155' }}>
                                Toko: +{formatIDR(offPrice)}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#BBF7D0' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>
                                GoFood: +{formatIDR(goPrice)}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#FFEDD5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#FED7AA' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#EA580C' }}>
                                Shopee: +{formatIDR(shopeePrice)}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#CCFBF1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#99F6E4' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0D9488' }}>
                                Grab: +{formatIDR(grabPrice)}
                              </Text>
                            </View>
                          </View>

                          {/* Daftar Bahan Baku Terhubung */}
                          {(() => {
                            const ings = (mv.ingredients_list && mv.ingredients_list.length > 0)
                              ? mv.ingredients_list
                              : (mv.ingredient_id ? [{ ingredient_id: mv.ingredient_id, jumlah_terpakai: mv.jumlah_terpakai || 0 }] : []);
                            if (ings.length === 0) return null;
                            return (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {ings.map((entry, i) => {
                                  const ing = ingredients.find((x) => x.id === entry.ingredient_id);
                                  return (
                                    <View key={i} style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#FDE68A' }}>
                                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#B45309' }}>
                                        🌾 {ing?.nama || `#${entry.ingredient_id}`}: {entry.jumlah_terpakai} {ing?.satuan || ''}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            );
                          })()}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-start', marginTop: 2 }}>
                          <TouchableOpacity
                            style={styles.masterActionEdit}
                            onPress={() => {
                              const existingList = (mv.ingredients_list && mv.ingredients_list.length > 0)
                                ? mv.ingredients_list
                                : (mv.ingredient_id ? [{ ingredient_id: mv.ingredient_id, jumlah_terpakai: mv.jumlah_terpakai || 0 }] : []);
                              setEditingMaster(mv);
                              setIsAddingMaster(true);
                              setNewMasterName(mv.nama_varian);
                              setNewMasterPrice(offPrice.toString());
                              setNewMasterPriceGofood(goPrice.toString());
                              setNewMasterPriceShopeefood(shopeePrice.toString());
                              setNewMasterPriceGrabfood(grabPrice.toString());
                              setNewMasterCategory(mv.kategori_varian || '');
                              setNewMasterIngredientsList(existingList);
                              setNewMasterIngredientId(existingList.length > 0 ? existingList[0].ingredient_id : null);
                              setNewMasterUsage(existingList.length > 0 ? existingList[0].jumlah_terpakai.toString() : '');
                            }}
                          >
                            <Edit2 size={13} color="#2563EB" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.masterActionDelete}
                            onPress={() => handleDeleteMasterVariant(mv.id, mv.nama_varian)}
                          >
                            <Trash2 size={13} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Master Variant Picker Modal (opened from Menu Card or Menu Form) */}
      <Modal visible={pickerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.menuModalContainer}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ backgroundColor: '#F3E8FF', padding: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E9D5FF' }}>
                  <Sparkles size={20} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {activeItemForVariants ? activeItemForVariants.nama : 'Pilih dari Master Varian'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    {activeItemForVariants
                      ? `${activeCategoryName ? activeCategoryName + ' • ' : ''}Atur varian & topping menu ini`
                      : 'Centang varian untuk dipasang ke menu ini'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPickerModalVisible(false);
                  setActiveItemForVariants(null);
                  setIsAddingInPicker(false);
                }}
                style={styles.closeBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Banner Info jika dibuka dari Menu Card */}
            {activeItemForVariants && (
              <View style={styles.pickerActiveItemBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <View style={styles.pickerDot} />
                  <Text style={styles.pickerBannerMenuName} numberOfLines={1}>{activeItemForVariants.nama}</Text>
                  <Text style={styles.pickerBannerPrice}>{formatIDR(activeItemForVariants.harga_offline)}</Text>
                </View>
                <View style={styles.pickerCountBadge}>
                  <Text style={styles.pickerCountBadgeText}>
                    {selectedMasterIds.length} Varian Terpasang
                  </Text>
                </View>
              </View>
            )}

            {/* Search & Actions Bar */}
            <View style={{ marginTop: 8, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={[styles.searchBar, { flex: 1, marginVertical: 0 }]}>
                  <Search size={14} color="#94A3B8" />
                  <TextInput
                    style={[styles.searchInput, { fontSize: 12 }]}
                    placeholder="Cari varian"
                    placeholderTextColor="#94A3B8"
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                  />
                  {pickerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setPickerSearch('')}>
                      <X size={13} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tombol Buat Varian Baru Langsung di Modal */}
                <TouchableOpacity
                  style={styles.pickerAddVariantBtn}
                  onPress={() => setIsAddingInPicker(!isAddingInPicker)}
                  activeOpacity={0.8}
                >
                  <Plus size={13} color="#7C3AED" />
                  <Text style={styles.pickerAddVariantBtnText}>
                    {isAddingInPicker ? 'Tutup Form' : 'Varian Baru'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Form Tambah Varian Baru Inline di Picker */}
              {isAddingInPicker && (
                <View style={styles.inlineAddVariantCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#7C3AED' }}>
                      Buat Varian
                    </Text>
                    <TouchableOpacity onPress={() => setIsAddingInPicker(false)}>
                      <X size={14} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Nama Varian *</Text>
                      <TextInput
                        style={[styles.textInputStyled, { paddingVertical: 6, fontSize: 12 }]}
                        value={inlinePickerName}
                        onChangeText={setInlinePickerName}
                      />
                    </View>
                  </View>

                  {/* 4 Channel Harga Inline */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.miniLabel}>Harga Varian per Channel</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {/* Offline */}
                      <View style={[styles.variantChannelBox, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 4 }]}>
                        <Text style={[styles.variantChannelLabel, { color: '#475569', fontSize: 8 }]}>Offline</Text>
                        <View style={[styles.variantChannelInputWrap, { paddingHorizontal: 4 }]}>
                          <Text style={[styles.variantChannelPrefix, { fontSize: 9 }]}>Rp</Text>
                          <TextInput
                            style={[styles.variantChannelInput, { fontSize: 11, paddingVertical: 2 }]}
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={inlinePickerPrice}
                            onChangeText={handleInlinePickerPriceChange}
                          />
                        </View>
                      </View>

                      {/* GoFood */}
                      <View style={[styles.variantChannelBox, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 4 }]}>
                        <Text style={[styles.variantChannelLabel, { color: '#16A34A', fontSize: 8 }]}>GoFood</Text>
                        <View style={[styles.variantChannelInputWrap, { paddingHorizontal: 4 }]}>
                          <Text style={[styles.variantChannelPrefix, { color: '#16A34A', fontSize: 9 }]}>Rp</Text>
                          <TextInput
                            style={[styles.variantChannelInput, { color: '#15803D', fontSize: 11, paddingVertical: 2 }]}
                            placeholder="0"
                            placeholderTextColor="#86EFAC"
                            keyboardType="numeric"
                            value={inlinePickerPriceGofood}
                            onChangeText={setInlinePickerPriceGofood}
                          />
                        </View>
                      </View>

                      {/* ShopeeFood */}
                      <View style={[styles.variantChannelBox, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED', padding: 4 }]}>
                        <Text style={[styles.variantChannelLabel, { color: '#EA580C', fontSize: 8 }]}>Shopee</Text>
                        <View style={[styles.variantChannelInputWrap, { paddingHorizontal: 4 }]}>
                          <Text style={[styles.variantChannelPrefix, { color: '#EA580C', fontSize: 9 }]}>Rp</Text>
                          <TextInput
                            style={[styles.variantChannelInput, { color: '#C2410C', fontSize: 11, paddingVertical: 2 }]}
                            placeholder="0"
                            placeholderTextColor="#FDBA74"
                            keyboardType="numeric"
                            value={inlinePickerPriceShopeefood}
                            onChangeText={setInlinePickerPriceShopeefood}
                          />
                        </View>
                      </View>

                      {/* GrabFood */}
                      <View style={[styles.variantChannelBox, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5', padding: 4 }]}>
                        <Text style={[styles.variantChannelLabel, { color: '#059669', fontSize: 8 }]}>Grab</Text>
                        <View style={[styles.variantChannelInputWrap, { paddingHorizontal: 4 }]}>
                          <Text style={[styles.variantChannelPrefix, { color: '#059669', fontSize: 9 }]}>Rp</Text>
                          <TextInput
                            style={[styles.variantChannelInput, { color: '#047857', fontSize: 11, paddingVertical: 2 }]}
                            placeholder="0"
                            placeholderTextColor="#6EE7B7"
                            keyboardType="numeric"
                            value={inlinePickerPriceGrabfood}
                            onChangeText={setInlinePickerPriceGrabfood}
                          />
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Kategori Varian di Inline Form */}
                  <View style={{ marginTop: 8, zIndex: 15 }}>
                    <Text style={styles.miniLabel}>Kategori / Kelompok Varian</Text>
                    <View style={{ position: 'relative' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[styles.textInputStyled, { paddingVertical: 5, paddingRight: 32, fontSize: 11, flex: 1 }]}
                          value={inlinePickerCategory}
                          onChangeText={(t) => {
                            setInlinePickerCategory(t);
                            setIsInlineCatDropdownOpen(true);
                          }}
                          onFocus={() => setIsInlineCatDropdownOpen(true)}
                          placeholder=""
                          placeholderTextColor="#94A3B8"
                        />
                        <TouchableOpacity
                          style={{ position: 'absolute', right: 8, padding: 3 }}
                          onPress={() => setIsInlineCatDropdownOpen(!isInlineCatDropdownOpen)}
                        >
                          <ChevronDown size={14} color={isInlineCatDropdownOpen ? '#7C3AED' : '#94A3B8'} />
                        </TouchableOpacity>
                      </View>

                      {isInlineCatDropdownOpen && (
                        <View style={styles.catDropdownList}>
                          <ScrollView style={{ maxHeight: 130 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {masterVariantCategories.map((cat) => {
                              const isSelected = inlinePickerCategory.trim().toLowerCase() === cat.trim().toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={`in-cat-${cat}`}
                                  style={[styles.catDropdownItem, isSelected && styles.catDropdownItemActive]}
                                  onPress={() => {
                                    setInlinePickerCategory(cat);
                                    setIsInlineCatDropdownOpen(false);
                                  }}
                                >
                                  <Text style={[styles.catDropdownItemText, isSelected && styles.catDropdownItemTextActive]}>
                                    {cat}
                                  </Text>
                                  {isSelected && <Check size={13} color="#7C3AED" />}
                                </TouchableOpacity>
                              );
                            })}
                            {inlinePickerCategory.trim() &&
                              !masterVariantCategories.some(
                                (c) => c.toLowerCase() === inlinePickerCategory.trim().toLowerCase()
                              ) && (
                                <TouchableOpacity
                                  style={[styles.catDropdownItem, { backgroundColor: '#F3E8FF' }]}
                                  onPress={() => setIsInlineCatDropdownOpen(false)}
                                >
                                  <Text style={[styles.catDropdownItemText, { color: '#7C3AED', fontWeight: '700' }]}>
                                    + "{inlinePickerCategory.trim()}"
                                  </Text>
                                </TouchableOpacity>
                              )}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Potong Bahan Baku di Inline Form */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.miniLabel}>Potong Bahan Baku (Opsional)</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 3 }}>
                      <TouchableOpacity
                        style={[
                          styles.ingDropdownBtn,
                          { paddingVertical: 6, paddingHorizontal: 8 },
                          inlinePickerIngredientId ? styles.ingDropdownBtnActive : null,
                        ]}
                        onPress={() => handleOpenIngPicker('inline')}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <Boxes size={12} color={inlinePickerIngredientId ? '#D97706' : '#94A3B8'} />
                          <Text
                            style={[
                              styles.ingDropdownText,
                              { fontSize: 11 },
                              inlinePickerIngredientId ? styles.ingDropdownTextActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {inlinePickerIngredientId
                              ? ingredients.find((i) => i.id === inlinePickerIngredientId)?.nama || 'Bahan Dipilih'
                              : 'Tidak Memotong Bahan'}
                          </Text>
                        </View>
                        <ChevronDown size={12} color={inlinePickerIngredientId ? '#D97706' : '#94A3B8'} />
                      </TouchableOpacity>

                      {inlinePickerIngredientId ? (
                        <TouchableOpacity
                          onPress={() => {
                            setInlinePickerIngredientId(null);
                            setInlinePickerUsage('');
                          }}
                          style={[styles.ingResetBtn, { padding: 4 }]}
                          accessibilityLabel="Batal pilih bahan"
                        >
                          <X size={12} color="#64748B" />
                        </TouchableOpacity>
                      ) : null}

                      {inlinePickerIngredientId ? (
                        <View style={[styles.ingUsageBox, { height: 32 }]}>
                          <TextInput
                            style={[styles.ingUsageInput, { fontSize: 11 }]}
                            placeholder="Takaran"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={inlinePickerUsage}
                            onChangeText={setInlinePickerUsage}
                          />
                          <Text style={[styles.ingUsageUnit, { fontSize: 10 }]}>
                            {ingredients.find((i) => i.id === inlinePickerIngredientId)?.satuan || ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.masterFormCancelBtn}
                      onPress={() => setIsAddingInPicker(false)}
                    >
                      <Text style={styles.masterFormCancelText}>Batal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.masterFormSaveBtn, { paddingVertical: 8, paddingHorizontal: 14 }]}
                      onPress={handleSaveInlineVariant}
                      disabled={isSavingInline}
                    >
                      {isSavingInline ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.masterFormSaveText}>Simpan</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Filter Tabs Horizontal */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  onPress={() => setPickerCategoryFilter('all')}
                  style={[
                    styles.pickerFilterChip,
                    pickerCategoryFilter === 'all' && styles.pickerFilterChipActive,
                  ]}
                >
                  <Text style={[styles.pickerFilterText, pickerCategoryFilter === 'all' && styles.pickerFilterTextActive]}>
                    Semua
                  </Text>
                </TouchableOpacity>

                {/* Tab Filter Terpasang */}
                <TouchableOpacity
                  onPress={() => setPickerCategoryFilter('selected')}
                  style={[
                    styles.pickerFilterChip,
                    pickerCategoryFilter === 'selected' && styles.pickerFilterChipActive,
                    selectedMasterIds.length > 0 && pickerCategoryFilter !== 'selected' ? { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' } : null,
                  ]}
                >
                  <Text style={[styles.pickerFilterText, pickerCategoryFilter === 'selected' && styles.pickerFilterTextActive, selectedMasterIds.length > 0 && pickerCategoryFilter !== 'selected' ? { color: '#7C3AED' } : null]}>
                    ✓ Terpasang ({selectedMasterIds.length})
                  </Text>
                </TouchableOpacity>

                {masterVariantCategories.map((catName) => {
                  const count = masterVariants.filter((v) => (v.kategori_varian || 'Topping').trim().toLowerCase() === catName.toLowerCase()).length;
                  const active = pickerCategoryFilter.toLowerCase() === catName.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={catName}
                      onPress={() => setPickerCategoryFilter(catName)}
                      style={[
                        styles.pickerFilterChip,
                        active && styles.pickerFilterChipActive,
                      ]}
                    >
                      <Text style={[styles.pickerFilterText, active && styles.pickerFilterTextActive]}>
                        {catName} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Counter & Select All Controls */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                  {selectedMasterIds.length} dari {filteredPickerVariants.length} varian dipilih
                </Text>
                <TouchableOpacity
                  onPress={toggleSelectAllPicker}
                  style={{ paddingVertical: 2, paddingHorizontal: 6 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>
                    {selectedMasterIds.length === filteredPickerVariants.length && filteredPickerVariants.length > 0
                      ? 'Batal Semua'
                      : 'Pilih Semua'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Selectable Variants List Grouped by Category */}
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {filteredPickerVariants.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Sparkles size={28} color="#DDD6FE" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 8 }}>
                    {pickerSearch
                      ? 'Tidak ada master varian yang cocok.'
                      : pickerCategoryFilter === 'selected'
                        ? 'Belum ada varian yang dipilih untuk menu ini.'
                        : 'Pustaka varian masih kosong.'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, textAlign: 'center' }}>
                    Tap "Varian Baru" di atas untuk menambahkan varian baru.
                  </Text>
                </View>
              ) : (
                (() => {
                  const grouped: Record<string, MasterVariant[]> = {};
                  filteredPickerVariants.forEach((mv) => {
                    const cat = (mv.kategori_varian || 'Topping').trim();
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(mv);
                  });

                  const sortedGroups = Object.entries(grouped).sort(([catA, itemsA], [catB, itemsB]) => {
                    const hasSelectedA = itemsA.some((item) => selectedMasterIds.includes(item.id)) ? 0 : 1;
                    const hasSelectedB = itemsB.some((item) => selectedMasterIds.includes(item.id)) ? 0 : 1;
                    if (hasSelectedA !== hasSelectedB) return hasSelectedA - hasSelectedB;
                    return catA.localeCompare(catB);
                  });

                  return sortedGroups.map(([categoryName, groupItems]) => {
                    const sortedItems = [...groupItems].sort((a, b) => {
                      const aChecked = selectedMasterIds.includes(a.id) ? 0 : 1;
                      const bChecked = selectedMasterIds.includes(b.id) ? 0 : 1;
                      if (aChecked !== bChecked) return aChecked - bChecked;
                      return a.nama_varian.localeCompare(b.nama_varian);
                    });

                    const allGroupSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedMasterIds.includes(item.id));
                    return (
                      <View key={categoryName} style={{ marginBottom: 12 }}>
                        {/* Category header */}
                        <View style={styles.pickerCategoryHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED' }} />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>
                              {categoryName}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                              ({groupItems.length})
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleCategorySelectionInPicker(categoryName)}
                            style={{ paddingVertical: 2, paddingHorizontal: 6 }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: allGroupSelected ? '#059669' : '#7C3AED' }}>
                              {allGroupSelected ? '✓ Terpilih Semua' : 'Pilih Semua Kategori'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Items under category */}
                        {sortedItems.map((mv) => {
                          const isSelected = selectedMasterIds.includes(mv.id);
                          return (
                            <TouchableOpacity
                              key={`pick-mv-${mv.id}`}
                              style={[styles.pickerItemRowModern, isSelected && styles.pickerItemRowModernActive]}
                              onPress={() => toggleMasterSelection(mv.id)}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.pickerCheckboxModern, isSelected && styles.pickerCheckboxModernActive]}>
                                {isSelected && <CheckCircle2 size={16} color="#FFFFFF" />}
                              </View>
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Text style={[styles.pickerItemNameModern, isSelected && styles.pickerItemNameModernActive]}>
                                    {mv.nama_varian}
                                  </Text>
                                  {mv.kategori_varian && (
                                    <View style={styles.pickerItemCatBadge}>
                                      <Text style={styles.pickerItemCatBadgeText}>{mv.kategori_varian}</Text>
                                    </View>
                                  )}
                                </View>
                                {/* 4 Channel Price Badges */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#334155' }}>
                                      Toko: +{formatIDR(mv.harga_offline ?? mv.harga_tambahan ?? 0)}
                                    </Text>
                                  </View>
                                  <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1, borderColor: '#BBF7D0' }}>
                                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#16A34A' }}>
                                      GoFood: +{formatIDR(mv.harga_gofood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0)}
                                    </Text>
                                  </View>
                                  <View style={{ backgroundColor: '#FFEDD5', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1, borderColor: '#FED7AA' }}>
                                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#EA580C' }}>
                                      Shopee: +{formatIDR(mv.harga_shopeefood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0)}
                                    </Text>
                                  </View>
                                  <View style={{ backgroundColor: '#CCFBF1', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1, borderColor: '#99F6E4' }}>
                                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0D9488' }}>
                                      Grab: +{formatIDR(mv.harga_grabfood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0)}
                                    </Text>
                                  </View>
                                </View>

                                {mv.ingredient_id && mv.jumlah_terpakai ? (
                                  <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700', marginTop: 3 }}>
                                    🌾 Potong {mv.jumlah_terpakai} {mv.ingredient_satuan || ''} {mv.ingredient_nama || ''}
                                  </Text>
                                ) : null}
                              </View>
                              {isSelected && (
                                <View style={styles.pickerActiveTag}>
                                  <Text style={styles.pickerActiveTagText}>✓ Terpasang</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  });
                })()
              )}
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.menuModalFooter}>
              <TouchableOpacity
                style={styles.menuCancelBtn}
                onPress={() => {
                  setPickerModalVisible(false);
                  setActiveItemForVariants(null);
                  setIsAddingInPicker(false);
                }}
              >
                <Text style={styles.menuCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuSaveBtn, { backgroundColor: '#7C3AED' }]}
                onPress={handleApplySelectedMasters}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.menuSaveBtnText}>
                    {activeItemForVariants
                      ? `Simpan Varian ke Menu`
                      : `Terapkan (${selectedMasterIds.length})`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Searchable Modal Picker Bahan Baku untuk Potong Stok Varian */}
      <Modal visible={ingPickerModalVisible} transparent animationType="fade" onRequestClose={() => setIngPickerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.menuModalContainer, { maxHeight: '80%' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#FEF3C7', padding: 6, borderRadius: 8 }}>
                  <Boxes size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Pilih Bahan Baku</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>Hubungkan pengurangan stok varian</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIngPickerModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Input Box */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
              <View style={styles.ingSearchBar}>
                <View style={styles.ingSearchIconWrap}>
                  <Search size={15} color="#7C3AED" />
                </View>
                <TextInput
                  style={styles.ingSearchInput}
                  placeholder="Cari bahan baku..."
                  placeholderTextColor="#94A3B8"
                  value={ingPickerSearch}
                  onChangeText={setIngPickerSearch}
                  autoFocus
                />
                {ingPickerSearch.length > 0 && (
                  <TouchableOpacity style={styles.ingSearchClearBtn} onPress={() => setIngPickerSearch('')}>
                    <View style={styles.ingSearchClearIcon}>
                      <X size={11} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* List Bahan Baku */}
            <ScrollView style={{ flex: 1, paddingHorizontal: 16, marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {/* Opsi Tanpa Memotong Bahan Baku */}
              <TouchableOpacity
                style={[
                  styles.ingPickItemRow,
                  ((ingPickerTarget === 'master' && !newMasterIngredientId) ||
                    (ingPickerTarget === 'inline' && !inlinePickerIngredientId)) &&
                  styles.ingPickItemRowActive,
                ]}
                onPress={() => handleSelectIng(null)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                    🚫 Tidak Memotong Bahan Baku
                  </Text>
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                    Varian ini tidak akan mengurangi stok bahan apapun
                  </Text>
                </View>
                {((ingPickerTarget === 'master' && !newMasterIngredientId) ||
                  (ingPickerTarget === 'inline' && !inlinePickerIngredientId)) && (
                    <Check size={16} color="#7C3AED" />
                  )}
              </TouchableOpacity>

              {filteredIngPickerList.map((ing) => {
                const isSelected =
                  (ingPickerTarget === 'master' && newMasterIngredientId === ing.id) ||
                  (ingPickerTarget === 'inline' && inlinePickerIngredientId === ing.id);

                return (
                  <TouchableOpacity
                    key={`ing-pick-${ing.id}`}
                    style={[styles.ingPickItemRow, isSelected && styles.ingPickItemRowActive]}
                    onPress={() => handleSelectIng(ing)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.ingPickItemName, isSelected && { color: '#7C3AED' }]}>
                          {ing.nama}
                        </Text>
                        <View style={styles.ingUnitBadge}>
                          <Text style={styles.ingUnitBadgeText}>{ing.satuan}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                        Stok saat ini: {ing.stok_saat_ini} {ing.satuan}
                      </Text>
                    </View>
                    {isSelected && <Check size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                );
              })}

              {filteredIngPickerList.length === 0 && (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#94A3B8' }}>Bahan baku tidak ditemukan.</Text>
                </View>
              )}
            </ScrollView>

            <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#F1F5F9', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.masterFormCancelBtn}
                onPress={() => setIngPickerModalVisible(false)}
              >
                <Text style={styles.masterFormCancelText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Recipe Modal */}
      <RecipeModal
        visible={recipeModalVisible}
        menuItem={selectedItemForRecipe}
        onClose={() => setRecipeModalVisible(false)}
      />

      {/* Custom Delete Confirm Modal */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalBox}>
            {/* Icon */}
            <View style={styles.confirmIconWrap}>
              <Trash2 size={28} color="#DC2626" />
            </View>
            <Text style={styles.confirmTitle}>Hapus Varian?</Text>
            <Text style={styles.confirmMessage}>
              Hapus{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>"{deleteConfirmData?.nama}"</Text>{' '}
              dari pustaka?{'\n'}Varian ini juga akan <Text style={{ fontWeight: '700', color: '#DC2626' }}>dihapus dari semua menu</Text> yang menggunakannya.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => { setDeleteConfirmVisible(false); setDeleteConfirmData(null); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={confirmDeleteMasterVariant}
                activeOpacity={0.85}
              >
                <Trash2 size={14} color="#fff" />
                <Text style={styles.confirmDeleteText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  searchAndSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 2,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  syncBtnLoading: {
    opacity: 0.7,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addCatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  addCatBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  masterVarBtn: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  masterVarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
  },
  addMenuBtn: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addMenuBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  categoryScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  catFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catFilterChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  catDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  catFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  catFilterTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  listContainer: {
    padding: 14,
    gap: 12,
    paddingBottom: 40,
  },
  menuItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardCat: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  availabilityBox: {
    alignItems: 'flex-end',
  },
  availText: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: -4,
  },
  availOn: {
    color: '#16A34A',
  },
  availOff: {
    color: '#DC2626',
  },
  priceGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  priceCol: {
    flex: 1,
    alignItems: 'center',
  },
  priceChannelLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  priceVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  variantChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  vChip: {
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  vChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B45309',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtnVariant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  actionBtnVariantText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
  actionBtnRecipe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  actionBtnRecipeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
  },
  actionBtnEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  actionBtnDelete: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  formModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  formBody: {
    paddingVertical: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  catSelectRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  selectCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  selectCatChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  selectCatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  selectCatTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  formPriceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  formPriceCol: {
    width: '48%',
  },
  formPriceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  priceInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  variantSetupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  addVarFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
  },
  addVarFieldText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  varInputRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  delVarBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  catModal: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
  },
  catModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  addCatConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  addCatConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  varHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callMasterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F5F3FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  callMasterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  masterInputBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  masterInputBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  masterCancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  masterCancelEditText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  masterSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  masterSaveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  masterItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 6,
  },
  masterItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  masterItemPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  masterActionEdit: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  masterActionDelete: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  pickerItemRowActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pickerItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pickerItemNameActive: {
    fontWeight: '700',
    color: '#7C3AED',
  },
  pickerItemPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  menuModalContainer: {
    width: '95%',
    maxWidth: 480,
    height: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  menuFormCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 10,
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  textInputStyled: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  catChipStyled: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  catChipStyledActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  catChipTextStyled: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  catChipTextStyledActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  channelPriceGrid: {
    gap: 8,
  },
  channelPriceCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelPriceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 110,
  },
  channelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  channelPriceName: {
    fontSize: 12,
    fontWeight: '700',
  },
  priceInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pricePrefix: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 4,
  },
  priceInputModern: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    minWidth: 70,
    padding: 0,
  },
  callMasterBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  callMasterBtnModernText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  addManualBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  addManualBtnModernText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  emptyVariantsBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyVariantsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
  },
  emptyVariantsSubtext: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },
  varCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  varNameInputModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  masterBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    marginLeft: 2,
  },
  masterBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7C3AED',
  },
  varPriceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 6,
    paddingVertical: 5,
    width: 90,
  },
  varPricePrefix: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  varPriceInputModern: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
    marginLeft: 2,
  },
  varDeleteBtnModern: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  menuModalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  menuCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  menuCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  menuSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  menuSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Master Form Card & Inputs
  masterFormCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    marginTop: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  masterFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  masterFormTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  masterFormSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  masterFormCloseBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  formPriceInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  formPricePrefix: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7C3AED',
    marginRight: 6,
  },
  formPriceInputField: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 6,
  },
  pricePresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  pricePresetChipActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  pricePresetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  pricePresetTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  suggestCatChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  suggestCatChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#8B5CF6',
  },
  suggestCatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  suggestCatTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  masterFormActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  masterFormCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterFormCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  masterFormSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterFormSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Picker Modal Elements
  pickerActiveItemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  pickerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
  },
  pickerBannerMenuName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#581C87',
  },
  pickerBannerPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7C3AED',
  },
  pickerCountBadge: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pickerCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickerAddVariantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pickerAddVariantBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  inlineAddVariantCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 10,
    marginTop: 2,
  },
  pickerFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  pickerFilterChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pickerFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  pickerFilterTextActive: {
    color: '#FFFFFF',
  },
  pickerCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pickerItemRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    marginBottom: 6,
  },
  pickerItemRowModernActive: {
    backgroundColor: '#FAF5FF',
    borderColor: '#7C3AED',
  },
  pickerCheckboxModern: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  pickerCheckboxModernActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pickerItemNameModern: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerItemNameModernActive: {
    color: '#581C87',
  },
  pickerItemCatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pickerItemCatBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  pickerItemPriceModern: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
    marginTop: 2,
  },
  pickerActiveTag: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  pickerActiveTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7C3AED',
  },
  variantChannelBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
  },
  variantChannelLabel: {
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  variantChannelInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
  },
  variantChannelPrefix: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginRight: 2,
  },
  variantChannelInput: {
    flex: 1,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  ingDropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ingDropdownBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  ingDropdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  ingDropdownTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  ingResetBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingUsageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 8,
    width: 95,
    height: 38,
  },
  ingUsageInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    paddingVertical: 2,
  },
  ingUsageUnit: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
    marginLeft: 3,
  },
  ingPickItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  ingPickItemRowActive: {
    backgroundColor: '#FAF5FF',
    borderColor: '#DDD6FE',
  },
  ingPickItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  ingUnitBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ingUnitBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7C3AED',
  },
  catDropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  catDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FAF5FF',
    borderBottomWidth: 1,
    borderColor: '#EDE9FE',
  },
  catDropdownHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7C3AED',
    textTransform: 'uppercase',
  },
  catDropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderColor: '#F1F5F9',
  },
  catDropdownItemActive: {
    backgroundColor: '#FAF5FF',
  },
  catDropdownItemText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  catDropdownItemTextActive: {
    color: '#7C3AED',
    fontWeight: '800',
  },
  ingSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F5FF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C4B5FD',
    paddingRight: 8,
    height: 44,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  ingSearchIconWrap: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 0,
    fontWeight: '500',
  },
  ingSearchClearBtn: {
    padding: 4,
  },
  ingSearchClearIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    marginHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
