import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MenuItem, MenuCategory, MenuVariant, OrderChannel, PaymentMethod, Transaction, CartItem, AppSettings } from '../../types';
import { menuService } from '../../services/menuService';
import { transactionService } from '../../services/transactionService';
import { settingsService } from '../../services/settingsService';
import { useCartStore, getMenuItemPriceForChannel } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useSyncStore } from '../../stores/syncStore';
import { usePrinterStore } from '../../stores/printerStore';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { bluetoothPrinterService } from '../../services/bluetoothPrinterService';
import { VariantSelectionModal } from '../../components/pos/VariantSelectionModal';
import { QuickEditMenuModal } from '../../components/pos/QuickEditMenuModal';
import { PaymentModal } from '../../components/pos/PaymentModal';
import { ReceiptSuccessModal } from '../../components/pos/ReceiptSuccessModal';
import { shiftService } from '../../services/shiftService';
import { showToast } from '../../stores/toastStore';
import { CashierShift } from '../../types';
import { OpenShiftModal } from '../../components/shift/OpenShiftModal';
import { CloseShiftModal } from '../../components/shift/CloseShiftModal';
import { DesktopPairingModal } from '../../components/sync/DesktopPairingModal';
import { formatIDR, getChannelLabel } from '../../utils/formatters';
import { getCategoryTheme } from '../../utils/categoryTheme';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Wifi,
  Wallet,
  X,
  Store,
  ArrowRight,
  ArrowLeft,
  UtensilsCrossed,
  Bike,
  ShoppingBag,
  Pencil,
  Edit3,
  AlertTriangle,
  Clock,
} from 'lucide-react-native';

interface MenuCardProps {
  item: MenuItem;
  price: number;
  inCartQty: number;
  cardWidth: number;
  isLandscape: boolean;
  onPress: (item: MenuItem) => void;
  onLongPress: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
}

const MenuCardItem = React.memo<MenuCardProps>(
  ({
    item,
    price,
    inCartQty,
    cardWidth,
    isLandscape,
    onPress,
    onLongPress,
    onEdit,
  }) => {
    const hasVariants = Boolean(item.variants && item.variants.length > 0);
    const catTheme = getCategoryTheme(item.category_name);

    return (
      <TouchableOpacity
        style={[
          styles.menuCard,
          isLandscape && styles.menuCardLandscape,
          { width: cardWidth },
          inCartQty > 0 && styles.menuCardInCart,
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeaderBadges}>
          <View
            style={[
              styles.catBadge,
              isLandscape && styles.catBadgeLandscape,
              { backgroundColor: catTheme.bgColor },
            ]}
          >
            <Text
              style={[
                styles.catBadgeText,
                isLandscape && styles.catBadgeTextLandscape,
                { color: catTheme.color },
              ]}
              numberOfLines={1}
            >
              {item.category_name || 'Menu'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {hasVariants && (
              <View
                style={[
                  styles.toppingBadge,
                  isLandscape && styles.toppingBadgeLandscape,
                ]}
              >
                <Sparkles size={isLandscape ? 8 : 9} color="#D97706" />
                <Text style={[styles.toppingBadgeText, isLandscape && { fontSize: 8 }]}>
                  Topping
                </Text>
              </View>
            )}
            {isLandscape && (
              <TouchableOpacity
                style={styles.cardEditBadge}
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                activeOpacity={0.7}
              >
                <Pencil size={9} color="#B45309" />
                <Text style={styles.cardEditText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text
          style={[styles.cardTitle, isLandscape && styles.cardTitleLandscape]}
          numberOfLines={2}
        >
          {item.nama}
        </Text>

        <View
          style={[
            styles.cardFooterRow,
            isLandscape && styles.cardFooterRowLandscape,
          ]}
        >
          <Text
            style={[
              styles.cardPrice,
              isLandscape && styles.cardPriceLandscape,
            ]}
          >
            {formatIDR(price)}
          </Text>

          {inCartQty > 0 ? (
            <View
              style={[
                styles.inCartBadge,
                isLandscape && styles.inCartBadgeLandscape,
              ]}
            >
              <Text
                style={[
                  styles.inCartBadgeText,
                  isLandscape && { fontSize: 9.5 },
                ]}
              >
                {inCartQty}x
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.addIconCircle,
                isLandscape && styles.addIconCircleLandscape,
              ]}
            >
              <Plus
                size={isLandscape ? 12 : 14}
                color="#FFFFFF"
                strokeWidth={2.5}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.nama === next.item.nama &&
      prev.item.status_tersedia === next.item.status_tersedia &&
      prev.price === next.price &&
      prev.inCartQty === next.inCartQty &&
      prev.cardWidth === next.cardWidth &&
      prev.isLandscape === next.isLandscape
    );
  }
);

export const PosScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Cart & Auth Stores
  const {
    currentChannel,
    cartItems,
    setChannel,
    addItem,
    editCartItem,
    updateQty,
    removeItem,
    clearCart,
    getTotal,
    getItemCount,
  } = useCartStore();

  const currentUser = useAuthStore((s) => s.currentUser);

  // Modals state
  const [activeItemForVariant, setActiveItemForVariant] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [quickEditModalVisible, setQuickEditModalVisible] = useState(false);
  const [variantModalVisible, setVariantModalVisible] = useState(false);
  const [cartDrawerVisible, setCartDrawerVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [shiftAlertVisible, setShiftAlertVisible] = useState(false);

  // Shift Management State
  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [openShiftModalVisible, setOpenShiftModalVisible] = useState(false);
  const [closeShiftModalVisible, setCloseShiftModalVisible] = useState(false);
  const hasPromptedShiftRef = useRef(false);

  // Sync Store
  const { isConnected } = useSyncStore();

  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [cats, items, stgs] = await Promise.all([
        menuService.getCategories(),
        menuService.getMenuItems(null, true),
        settingsService.getSettings().catch(() => null),
      ]);
      setCategories(cats);
      setMenuItems(items);
      if (stgs) setAppSettings(stgs);
    } catch (e) {
      console.error('Failed to load menu data:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat menu sistem.' });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadShift = async (autoPrompt = false) => {
    try {
      const s = await shiftService.getActiveShift(currentUser?.id);
      setActiveShift(s);
      if (!s && autoPrompt && !hasPromptedShiftRef.current) {
        hasPromptedShiftRef.current = true;
        setOpenShiftModalVisible(true);
      }
    } catch (e) {
      console.warn('Failed to load active shift:', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await desktopSyncService.syncMenuFromDesktop().catch(() => {});
    await loadData(false);
    await loadShift(false);
    setRefreshing(false);
  };

  // Auto-refresh when tab is focused
  useFocusEffect(
    useCallback(() => {
      loadData(false);
      loadShift(true);
      desktopSyncService.testConnection().catch(() => {});
      // Sync fresh menu from Desktop in background so new items appear immediately
      desktopSyncService.syncMenuFromDesktop().catch(() => {}).then(() => {
        loadData(false);
      });
    }, [currentUser])
  );

  // Live WebSocket auto-refresh when Desktop updates catalog or stock
  useEffect(() => {
    loadData(true);
    loadShift(true);
    desktopSyncService.testConnection().catch(() => {});

    const unsub = subscribeToSyncEvents(async (event) => {
      if (event === 'catalog') {
        console.log('[PosScreen] Auto-refreshing menu catalog from live sync event');
        await desktopSyncService.syncMenuFromDesktop().catch(() => {});
        loadData(false);
      } else if (event === 'stock') {
        console.log('[PosScreen] Auto-refreshing menu stock from live sync event');
        loadData(false);
      }
    });
    return unsub;
  }, []);

  // Menu yang tersedia di channel aktif (harga > 0)
  const availableForChannel = useMemo(() => {
    return menuItems.filter((item) => {
      const channelPrice = getMenuItemPriceForChannel(item, currentChannel);
      return channelPrice > 0;
    });
  }, [menuItems, currentChannel]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return availableForChannel.filter((item) => {
      const matchCat = selectedCatId === null || item.category_id === selectedCatId;
      const matchSearch =
        item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.category_name && item.category_name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [availableForChannel, selectedCatId, searchQuery]);

  // Item cart count map
  const itemQtyInCart = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of cartItems) {
      const current = map.get(item.menuItem.id) || 0;
      map.set(item.menuItem.id, current + item.qty);
    }
    return map;
  }, [cartItems]);

  const handleItemPress = useCallback(
    (item: MenuItem) => {
      setEditingCartItem(null);
      if (item.variants && item.variants.length > 0) {
        setActiveItemForVariant(item);
        setVariantModalVisible(true);
      } else {
        addItem(item, []);
      }
    },
    [addItem]
  );

  const handleOpenEditCartItem = (cartItem: CartItem) => {
    setEditingCartItem(cartItem);
    setActiveItemForVariant(cartItem.menuItem);
    setVariantModalVisible(true);
  };

  const handleOpenQuickEditMenu = useCallback((item: MenuItem) => {
    setEditingMenuItem(item);
    setQuickEditModalVisible(true);
  }, []);

  const handleConfirmVariant = (
    item: MenuItem,
    selectedVariants: MenuVariant[],
    notes: string
  ) => {
    if (editingCartItem) {
      editCartItem(editingCartItem.uid, selectedVariants, notes);
      showToast({
        type: 'success',
        title: 'Pesanan Diperbarui',
        message: `Perubahan pesanan "${item.nama}" berhasil disimpan.`,
      });
      setVariantModalVisible(false);
      setEditingCartItem(null);
      setActiveItemForVariant(null);
      return;
    }
    setVariantModalVisible(false);
    addItem(item, selectedVariants, notes);
  };

  const handleCheckoutClick = () => {
    if (cartItems.length === 0) {
      showToast({ type: 'warning', title: 'Keranjang Kosong', message: 'Silakan pilih menu terlebih dahulu.' });
      return;
    }

    // Must have an open shift before processing transactions
    if (!activeShift) {
      setShiftAlertVisible(true);
      return;
    }

    setCartDrawerVisible(false);
    setPaymentModalVisible(true);
  };

  const handleConfirmPayment = async (
    metode: PaymentMethod,
    cashPaid: number,
    kembalian: number,
    onlineOrderCode?: string,
    onlineVoucherDiscount?: number
  ) => {
    if (!currentUser) return;
    if (!activeShift) {
      showToast({
        type: 'warning',
        title: 'Shift Belum Dibuka',
        message: 'Harap buka shift kasir terlebih dahulu sebelum memproses transaksi.',
      });
      setShiftAlertVisible(true);
      return;
    }
    try {
      setIsProcessingOrder(true);
      const itemsSubtotal = getTotal();
      const isOnline = currentChannel !== 'offline';
      const voucherDiscount = isOnline ? (onlineVoucherDiscount || 0) : 0;
      const taxPercentage = appSettings?.enable_tax ? (appSettings.tax_percentage ?? 10) : 0;
      const taxAmount = appSettings?.enable_tax ? Math.round((itemsSubtotal * taxPercentage) / 100) : 0;
      const finalTotal = Math.max(0, itemsSubtotal + taxAmount - voucherDiscount);
      const onlineNote = (isOnline && onlineOrderCode && onlineOrderCode.trim())
        ? `[No. Pesanan: ${onlineOrderCode.trim().toUpperCase()}] `
        : '';
      const orderNotes = `${onlineNote}Order dari HP Kasir (${currentUser.nama})`;

      const trx = await Promise.race([
        transactionService.createTransaction(
          currentChannel,
          metode,
          finalTotal,
          currentUser.id,
          cartItems,
          orderNotes,
          {
            cashPaid,
            kembalian,
            shiftId: activeShift?.id,
            subtotal: itemsSubtotal,
            taxPercentage,
            taxAmount,
            onlineVoucherDiscount: voucherDiscount,
          }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Waktu proses transaksi habis (timeout). Silakan periksa koneksi atau coba lagi.')), 12000)
        ),
      ]);

      // Asynchronously push order to Desktop POS if connected
      if (isConnected) {
        desktopSyncService.pushOrderToDesktop({
          id: trx.id,
          uuid: trx.uuid,
          localTransactionId: trx.id,
          tanggal: trx.tanggal,
          channel: currentChannel,
          metode_bayar: metode,
          subtotal: trx.subtotal,
          tax_percentage: trx.tax_percentage,
          tax_amount: trx.tax_amount,
          cashPaid,
          uang_diterima: cashPaid,
          kembalian,
          sumber_dana: trx.sumber_dana,
          online_voucher_discount: voucherDiscount,
          online_commission_amount: trx.online_commission_amount,
          online_net_amount: trx.online_net_amount,
          total: finalTotal,
          kasir_nama: currentUser.nama,
          catatan: orderNotes,
          cartItems: cartItems.map((ci) => ({
            menu_item_id: ci.menuItem.id,
            nama: ci.menuItem.nama,
            selectedVariants: ci.selectedVariants,
            customNotes: ci.customNotes,
            qty: ci.qty,
            unitPrice: ci.unitPrice,
            subtotal: ci.subtotal,
          })),
        }).catch((err) => console.warn('[Sync] Push to desktop failed:', err));
      }

      clearCart();
      setPaymentModalVisible(false);
      setLandscapePaymentActive(false);
      setCompletedTransaction(trx);
      setSuccessModalVisible(true);

      // Auto-print receipt via Bluetooth if connected and setting enabled
      const { connected, connectedPrinter, printerTarget, autoPrintOnSuccess, paperWidth } = usePrinterStore.getState();
      if ((connected || connectedPrinter || printerTarget) && autoPrintOnSuccess) {
        bluetoothPrinterService
          .printReceipt(trx, 'Lette Roti Bakar', paperWidth)
          .catch((err) => console.warn('[AutoPrint] Bluetooth direct print failed:', err));
      }
    } catch (e: any) {
      console.error('Transaction failed:', e);
      showToast({ type: 'error', title: 'Transaksi Gagal', message: e?.message || 'Terjadi kesalahan saat memproses transaksi.' });
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const channels: { key: OrderChannel; label: string; icon: any; color: string }[] = [
    { key: 'offline', label: 'Offline', icon: UtensilsCrossed, color: '#D97706' },
    { key: 'gofood', label: 'GoFood', icon: Bike, color: '#059669' },
    { key: 'shopeefood', label: 'ShopeeFood', icon: ShoppingBag, color: '#EA580C' },
    { key: 'grabfood', label: 'GrabFood', icon: Bike, color: '#16A34A' },
  ];

  const itemsSubtotal = getTotal();
  const taxPercentage = appSettings?.enable_tax ? (appSettings.tax_percentage ?? 10) : 0;
  const taxAmount = appSettings?.enable_tax ? Math.round((itemsSubtotal * taxPercentage) / 100) : 0;
  const totalAmount = itemsSubtotal + taxAmount;
  const totalItemCount = getItemCount();

  // Track landscape inline payment mode
  const [landscapePaymentActive, setLandscapePaymentActive] = useState(false);

  // Dynamic calculations for responsive layout (portrait & landscape)
  const safeLeft = isLandscape ? Math.max(insets.left, 8) : 0;
  const safeRight = isLandscape ? Math.max(insets.right, 8) : 0;
  const safeAvailableWidth = width - safeLeft - safeRight;

  const rightCartWidth = isLandscape
    ? Math.min(360, Math.max(290, Math.round(safeAvailableWidth * 0.35)))
    : 0;
  const leftPaneWidth = isLandscape ? safeAvailableWidth - rightCartWidth : width;
  const numColumns = isLandscape
    ? leftPaneWidth >= 740
      ? 4
      : leftPaneWidth >= 440
      ? 3
      : 2
    : 2;
  const menuGridPadding = isLandscape ? 8 : 12;
  const menuGridGap = isLandscape ? 8 : 10;
  const cardWidth = Math.floor(
    (leftPaneWidth - menuGridPadding * 2 - menuGridGap * (numColumns - 1)) / numColumns
  );

  // Override handleCheckoutClick for landscape — open inline payment instead of modal
  const handleLandscapeCheckout = () => {
    if (cartItems.length === 0) {
      showToast({ type: 'warning', title: 'Keranjang Kosong', message: 'Silakan pilih menu terlebih dahulu.' });
      return;
    }
    // Must have an open shift before processing transactions
    if (!activeShift) {
      setShiftAlertVisible(true);
      return;
    }
    setLandscapePaymentActive(true);
  };

  /**
   * Reusable Cart Panel Content
   * Used both in the Landscape Right Panel and in the Portrait Bottom Drawer
   */
  const renderCartContent = (isDrawer = false) => (
    <View style={styles.cartContentContainer}>
      {isDrawer && <View style={styles.drawerHandleBar} />}

      {/* Cart Header */}
      <View style={[styles.cartHeader, isLandscape && styles.cartHeaderLandscape]}>
        <View style={styles.cartHeaderLeft}>
          <ShoppingCart size={isLandscape ? 15 : 18} color="#D97706" />
          <Text style={[styles.cartHeaderTitle, isLandscape && { fontSize: 13 }]}>Pesanan</Text>
          <View style={styles.cartChannelPill}>
            <Text style={styles.cartChannelText}>{getChannelLabel(currentChannel)}</Text>
          </View>
        </View>

        <View style={styles.cartHeaderRight}>
          {cartItems.length > 0 && (
            <TouchableOpacity onPress={clearCart} style={styles.clearCartBtn} activeOpacity={0.7}>
              <Trash2 size={12} color="#EF4444" />
              <Text style={styles.clearCartText}>Hapus</Text>
            </TouchableOpacity>
          )}

          {isDrawer && (
            <TouchableOpacity onPress={() => setCartDrawerVisible(false)} style={styles.drawerCloseBtn}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Items Scroll List */}
      <ScrollView
        style={styles.cartItemList}
        contentContainerStyle={cartItems.length === 0 ? styles.cartEmptyContainer : styles.cartListContent}
        showsVerticalScrollIndicator={false}
      >
        {cartItems.length === 0 ? (
          <View style={styles.emptyCartBox}>
            <View style={styles.emptyCartIconBox}>
              <ShoppingBag size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyCartTitle}>Pesanan Kosong</Text>
            <Text style={styles.emptyCartSubtitle}>
              {isLandscape
                ? 'Pilih menu di sebelah kiri untuk menambah ke pesanan'
                : 'Pilih menu untuk menambahkan ke pesanan'}
            </Text>
          </View>
        ) : (
          cartItems.map((item) => (
            <View key={`cart-item-${item.uid}`} style={styles.cartItemRow}>
              {/* Row 1: Item Name & Subtotal */}
              <TouchableOpacity
                style={styles.cartItemTopRow}
                onPress={() => handleOpenEditCartItem(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.cartItemName} numberOfLines={2}>
                  {item.menuItem.nama}
                </Text>
                <Text style={styles.cartItemSubtotal}>{formatIDR(item.subtotal)}</Text>
              </TouchableOpacity>

              {/* Row 2: Variants & Notes if any */}
              {(item.selectedVariants.length > 0 || item.customNotes) && (
                <TouchableOpacity
                  style={styles.cartItemDetailsRow}
                  onPress={() => handleOpenEditCartItem(item)}
                  activeOpacity={0.7}
                >
                  {item.selectedVariants.length > 0 && (
                    <Text style={styles.cartItemVariants} numberOfLines={2}>
                      + {item.selectedVariants.map((v) => v.nama_varian).join(', ')}
                    </Text>
                  )}
                  {item.customNotes ? (
                    <Text style={styles.cartItemNotes} numberOfLines={2}>
                      Catatan: {item.customNotes}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}

              {/* Row 3: Unit Price & Action Controls (Edit, Trash, Stepper) */}
              <View style={styles.cartItemBottomRow}>
                <View style={styles.cartItemActionLeft}>
                  <TouchableOpacity
                    style={styles.cartEditBtn}
                    onPress={() => handleOpenEditCartItem(item)}
                    activeOpacity={0.7}
                  >
                    <Pencil size={11} color="#B45309" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cartDeleteBtn}
                    onPress={() => removeItem(item.uid)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={12} color="#EF4444" />
                  </TouchableOpacity>

                  <Text style={styles.cartItemUnitPrice}>
                    {formatIDR(item.unitPrice)}
                  </Text>
                </View>

                {/* Steppers */}
                <View style={styles.cartStepperGroup}>
                  <TouchableOpacity
                    style={styles.cartStepperBtn}
                    onPress={() => updateQty(item.uid, -1)}
                    activeOpacity={0.7}
                  >
                    <Minus size={13} color="#334155" strokeWidth={2.5} />
                  </TouchableOpacity>

                  <Text style={styles.cartStepperQty}>{item.qty}</Text>

                  <TouchableOpacity
                    style={[styles.cartStepperBtn, styles.cartStepperBtnPlus]}
                    onPress={() => updateQty(item.uid, 1)}
                    activeOpacity={0.7}
                  >
                    <Plus size={13} color="#B45309" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Cart Summary & Checkout Footer */}
      <View
        style={[
          styles.cartFooter,
          isLandscape && styles.cartFooterLandscape,
          { paddingBottom: isDrawer ? Math.max(insets.bottom, 16) : Math.max(insets.bottom, 8) + 4 },
        ]}
      >
        {taxAmount > 0 && (
          <View style={{ gap: 2, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#64748B' }}>Subtotal</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>{formatIDR(itemsSubtotal)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#64748B' }}>Pajak ({taxPercentage}%)</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>+{formatIDR(taxAmount)}</Text>
            </View>
          </View>
        )}
        <View style={styles.cartTotalRow}>
          <View>
            <Text style={styles.cartTotalLabel}>Total Tagihan</Text>
            <Text style={styles.cartSummaryCount}>{totalItemCount} porsi dipesan</Text>
          </View>
          <Text style={styles.cartTotalValue}>{formatIDR(totalAmount)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkoutBtn, isLandscape && styles.checkoutBtnLandscape, totalItemCount === 0 && styles.checkoutBtnDisabled]}
          onPress={isLandscape ? handleLandscapeCheckout : handleCheckoutClick}
          disabled={totalItemCount === 0}
          activeOpacity={0.88}
        >
          <CheckCircle2 size={isLandscape ? 15 : 17} color="#FFFFFF" />
          <Text style={[styles.checkoutBtnText, isLandscape && { fontSize: 12 }]}>
            {totalItemCount === 0
              ? 'Pilih Menu Dulu'
              : !activeShift
              ? `Buka Shift Dulu (${formatIDR(totalAmount)})`
              : `Bayar Sekarang (${formatIDR(totalAmount)})`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ==================== LANDSCAPE INLINE PAYMENT VIEW ====================
  if (isLandscape && landscapePaymentActive) {
    return (
      <PaymentModal
        visible={true}
        total={totalAmount}
        channel={currentChannel}
        onClose={() => setLandscapePaymentActive(false)}
        onConfirmPayment={handleConfirmPayment}
        isProcessing={isProcessingOrder}
        inline={true}
        cartItems={cartItems}
      />
    );
  }

  return (
    <View style={[styles.container, isLandscape && styles.containerLandscape, { paddingLeft: safeLeft, paddingRight: safeRight }]}>
      {/* LEFT SECTION (Header, Channels, Categories, Menu Grid) */}
      <View style={[styles.leftSection, isLandscape && { width: leftPaneWidth }]}>
        {/* Top Header */}
        <View
          style={[
            styles.headerContainer,
            isLandscape && styles.headerContainerLandscape,
            {
              paddingTop: isLandscape ? 6 : Math.max(insets.top, 10) + 4,
              paddingBottom: isLandscape ? 5 : 8,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            {navigation?.canGoBack?.() && (
              <TouchableOpacity
                style={[styles.backBtn, isLandscape && styles.backBtnLandscape]}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <ArrowLeft size={isLandscape ? 15 : 18} color="#0F172A" />
              </TouchableOpacity>
            )}
            <Image
              source={require('../../../assets/logo.png')}
              style={[styles.headerLogo, isLandscape && styles.headerLogoLandscape]}
              resizeMode="contain"
            />
            <View>
              <View style={styles.storeNameRow}>
                <Text style={[styles.headerStoreName, isLandscape && styles.headerStoreNameLandscape]}>Lette POS</Text>
                <View style={[styles.offlinePill, isLandscape && styles.offlinePillLandscape]}>
                  <Text style={[styles.offlinePillText, isLandscape && { fontSize: 7.5 }]}>Kasir</Text>
                </View>
              </View>
              <Text style={[styles.headerCashierName, isLandscape && styles.headerCashierNameLandscape]} numberOfLines={1}>
                {currentUser?.nama ? `Kasir: ${currentUser.nama}` : 'Lette Roti Bakar'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {/* WiFi Desktop Bridge status pill */}
            <TouchableOpacity
              style={[
                styles.bridgePill,
                isLandscape && styles.bridgePillLandscape,
                isConnected ? styles.bridgePillOnline : styles.bridgePillOffline,
              ]}
              onPress={() => setPairingModalVisible(true)}
              activeOpacity={0.8}
            >
              <Wifi size={isLandscape ? 10 : 12} color={isConnected ? '#16A34A' : '#D97706'} strokeWidth={2.5} />
              <Text style={[styles.bridgePillText, isLandscape && { fontSize: 9 }, { color: isConnected ? '#16A34A' : '#D97706' }]}>
                {isConnected ? 'PC On' : 'Pairing'}
              </Text>
            </TouchableOpacity>

            {/* Shift Control Button */}
            {activeShift ? (
              <TouchableOpacity
                style={[styles.shiftActivePill, isLandscape && styles.shiftActivePillLandscape]}
                onPress={() => setCloseShiftModalVisible(true)}
                activeOpacity={0.8}
              >
                <View style={styles.shiftGreenDot} />
                <Text style={[styles.shiftActiveText, isLandscape && { fontSize: 9 }]} numberOfLines={1}>
                  Shift Aktif
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.openShiftBtn, isLandscape && styles.openShiftBtnLandscape]}
                onPress={() => setOpenShiftModalVisible(true)}
                activeOpacity={0.8}
              >
                <Wallet size={isLandscape ? 10 : 12} color="#FFFFFF" />
                <Text style={[styles.openShiftText, isLandscape && { fontSize: 9 }]}>Buka Shift</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Channel Selection Bar */}
        <View style={[styles.channelBarWrapper, isLandscape && styles.channelBarLandscape]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.channelScroll, isLandscape && styles.channelScrollLandscape]}
          >
            {channels.map((ch) => {
              const isActive = currentChannel === ch.key;
              const IconComp = ch.icon;
              return (
                <TouchableOpacity
                  key={`ch-${ch.key}`}
                  style={[
                    styles.channelTab,
                    isLandscape && styles.channelTabLandscape,
                    isActive && { backgroundColor: ch.color, borderColor: ch.color },
                  ]}
                  onPress={() => setChannel(ch.key)}
                  activeOpacity={0.8}
                >
                  <IconComp size={isLandscape ? 11 : 13} color={isActive ? '#FFFFFF' : ch.color} />
                  <Text
                    style={[
                      styles.channelTabText,
                      isLandscape && styles.channelTabTextLandscape,
                      isActive && styles.channelTabTextActive,
                    ]}
                  >
                    {ch.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* No Shift Warning Banner */}
        {!activeShift && (
          <TouchableOpacity
            style={[styles.noShiftBanner, isLandscape && styles.noShiftBannerLandscape]}
            onPress={() => setOpenShiftModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.noShiftBannerLeft}>
              <AlertTriangle size={isLandscape ? 12 : 14} color="#D97706" />
              <Text style={[styles.noShiftBannerText, isLandscape && { fontSize: 10 }]} numberOfLines={1}>
                Shift kasir belum dibuka. Wajib buka shift sebelum transaksi.
              </Text>
            </View>
            <View style={styles.noShiftActionPill}>
              <Text style={[styles.noShiftActionText, isLandscape && { fontSize: 10 }]}>Buka Shift</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Search & Category Filter */}
        {isLandscape ? (
          <View style={styles.filterSectionLandscapeRow}>
            {/* Inline Search Bar */}
            <View style={styles.searchBarLandscapeInline}>
              <Search size={13} color="#94A3B8" />
              <TextInput
                style={styles.searchInputLandscape}
                placeholder="Cari menu..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                  <X size={12} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inlineDivider} />

            {/* Inline Category Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsInline}
            >
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  styles.categoryChipLandscape,
                  selectedCatId === null && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCatId(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    styles.categoryChipTextLandscape,
                    selectedCatId === null && styles.categoryChipTextActive,
                  ]}
                >
                  Semua ({menuItems.length})
                </Text>
              </TouchableOpacity>

              {categories.map((cat) => {
                const isActive = selectedCatId === cat.id;
                const theme = getCategoryTheme(cat.nama);
                const count = menuItems.filter((i) => i.category_id === cat.id).length;
                return (
                  <TouchableOpacity
                    key={`cat-${cat.id}`}
                    style={[
                      styles.categoryChip,
                      styles.categoryChipLandscape,
                      isActive && { backgroundColor: theme.bgColor, borderColor: theme.color },
                    ]}
                    onPress={() => setSelectedCatId(cat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catDot, { backgroundColor: theme.color }]} />
                    <Text
                      style={[
                        styles.categoryChipText,
                        styles.categoryChipTextLandscape,
                        isActive && { color: theme.color, fontWeight: '800' },
                      ]}
                    >
                      {cat.nama} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.filterSection}>
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
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                  <X size={13} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChips}
            >
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  selectedCatId === null && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCatId(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCatId === null && styles.categoryChipTextActive,
                  ]}
                >
                  Semua ({availableForChannel.length})
                </Text>
              </TouchableOpacity>

              {categories.map((cat) => {
                const isActive = selectedCatId === cat.id;
                const theme = getCategoryTheme(cat.nama);
                const count = availableForChannel.filter((i) => i.category_id === cat.id).length;
                return (
                  <TouchableOpacity
                    key={`cat-${cat.id}`}
                    style={[
                      styles.categoryChip,
                      isActive && { backgroundColor: theme.bgColor, borderColor: theme.color },
                    ]}
                    onPress={() => setSelectedCatId(cat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catDot, { backgroundColor: theme.color }]} />
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive && { color: theme.color, fontWeight: '800' },
                      ]}
                    >
                      {cat.nama} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Menu Items Grid */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#D97706" />
            <Text style={styles.loadingText}>Memuat menu...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.menuScrollGrid,
              isLandscape && styles.menuScrollGridLandscape,
              { paddingBottom: isLandscape ? 20 : totalItemCount > 0 ? 100 : 25 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
            }
          >
            {filteredItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconCircle}>
                  <UtensilsCrossed size={28} color="#D97706" />
                </View>
                <Text style={styles.emptyTitle}>
                  {menuItems.length === 0 ? 'Daftar Menu Masih Kosong' : 'Menu tidak ditemukan'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {menuItems.length === 0
                    ? 'Tambahkan menu baru di Kelola Menu atau sinkronkan data dari Desktop PC.'
                    : searchQuery
                    ? selectedCatId !== null
                      ? `"${searchQuery}" tidak ditemukan pada kategori ini.`
                      : `Kata kunci "${searchQuery}" tidak cocok`
                    : 'Belum ada menu di kategori ini'}
                </Text>
                {menuItems.length > 0 && selectedCatId !== null && (
                  <TouchableOpacity
                    style={styles.emptyResetFilterBtn}
                    onPress={() => setSelectedCatId(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyResetFilterText}>Cari di Semua Kategori</Text>
                  </TouchableOpacity>
                )}
                {menuItems.length === 0 && (
                  <View style={styles.emptyActionRow}>
                    <TouchableOpacity
                      style={styles.emptyActionBtnPrimary}
                      onPress={() => navigation?.navigate?.('KelolaTab', { screen: 'MenuManagement' }) || navigation?.navigate?.('MenuManagement')}
                      activeOpacity={0.8}
                    >
                      <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
                      <Text style={styles.emptyActionTextPrimary}>Tambah Menu Baru</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.emptyActionBtnSecondary}
                      onPress={() => setPairingModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Wifi size={13} color="#059669" strokeWidth={2.5} />
                      <Text style={styles.emptyActionTextSecondary}>Sync Desktop PC</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.menuGridRow, isLandscape && styles.menuGridRowLandscape]}>
                {filteredItems.map((item) => (
                  <MenuCardItem
                    key={`item-${item.id}`}
                    item={item}
                    price={getMenuItemPriceForChannel(item, currentChannel)}
                    inCartQty={itemQtyInCart.get(item.id) || 0}
                    cardWidth={cardWidth}
                    isLandscape={isLandscape}
                    onPress={handleItemPress}
                    onLongPress={handleOpenQuickEditMenu}
                    onEdit={handleOpenQuickEditMenu}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* RIGHT SECTION: Dedicated Order Panel in Landscape Mode */}
      {isLandscape && (
        <View style={[styles.landscapeCartPanel, { width: rightCartWidth }]}>
          {renderCartContent(false)}
        </View>
      )}

      {/* PORTRAIT MODE: Floating Bottom Cart Bar */}
      {!isLandscape && totalItemCount > 0 && (
        <View style={[styles.floatingBarWrapper, { bottom: insets.bottom > 0 ? insets.bottom + 65 : 75 }]}>
          <TouchableOpacity
            style={styles.floatingBar}
            onPress={() => setCartDrawerVisible(true)}
            activeOpacity={0.9}
          >
            <View style={styles.floatingBarLeft}>
              <View style={styles.floatingCartIconBox}>
                <ShoppingCart size={17} color="#FFFFFF" />
                <View style={styles.floatingCartBadge}>
                  <Text style={styles.floatingCartBadgeText}>{totalItemCount}</Text>
                </View>
              </View>
              <View>
                <Text style={styles.floatingTotalLabel}>{totalItemCount} Pesanan</Text>
                <Text style={styles.floatingTotalAmount}>{formatIDR(totalAmount)}</Text>
              </View>
            </View>

            <View style={styles.floatingBarRight}>
              <Text style={styles.floatingPayText}>Bayar</Text>
              <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* PORTRAIT MODE: Slide-Up Bottom Sheet Cart Drawer */}
      {!isLandscape && (
        <Modal
          visible={cartDrawerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCartDrawerVisible(false)}
        >
          <View style={styles.drawerOverlay}>
            <TouchableOpacity
              style={styles.drawerBackdropTap}
              activeOpacity={1}
              onPress={() => setCartDrawerVisible(false)}
            />
            <View style={styles.drawerContent}>
              {renderCartContent(true)}
            </View>
          </View>
        </Modal>
      )}

      {/* Variant Selection / Customization Modal */}
      <VariantSelectionModal
        visible={variantModalVisible}
        item={activeItemForVariant}
        channel={currentChannel}
        onClose={() => {
          setVariantModalVisible(false);
          setEditingCartItem(null);
          setActiveItemForVariant(null);
        }}
        onConfirm={handleConfirmVariant}
        initialVariants={editingCartItem ? editingCartItem.selectedVariants : []}
        initialNotes={editingCartItem ? editingCartItem.customNotes : ''}
        isEditing={!!editingCartItem}
      />

      {/* Quick Edit Menu Modal (Landscape & Long Press) */}
      <QuickEditMenuModal
        visible={quickEditModalVisible}
        item={editingMenuItem}
        onClose={() => {
          setQuickEditModalVisible(false);
          setEditingMenuItem(null);
        }}
        onSaveSuccess={() => loadData(false)}
      />

      {/* Payment Modal (portrait only — landscape uses inline) */}
      {!isLandscape && (
        <PaymentModal
          visible={paymentModalVisible}
          total={totalAmount}
          channel={currentChannel}
          onClose={() => setPaymentModalVisible(false)}
          onConfirmPayment={handleConfirmPayment}
          isProcessing={isProcessingOrder}
        />
      )}

      {/* ===== Beautiful Shift Alert Modal ===== */}
      <Modal
        visible={shiftAlertVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShiftAlertVisible(false)}
      >
        <View style={styles.shiftAlertOverlay}>
          <View style={styles.shiftAlertCard}>
            {/* Animated Warning Icon */}
            <View style={styles.shiftAlertIconCircle}>
              <AlertTriangle size={28} color="#F59E0B" />
            </View>

            <Text style={styles.shiftAlertTitle}>Shift Belum Dibuka</Text>
            <Text style={styles.shiftAlertMessage}>
              Kasir wajib membuka shift dan mencatat modal kas laci sebelum melayani pesanan.
            </Text>

            {/* Info Tip */}
            <View style={styles.shiftAlertTip}>
              <Clock size={13} color="#D97706" />
              <Text style={styles.shiftAlertTipText}>
                Buka shift untuk mulai mencatat transaksi dan mengelola kas laci.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.shiftAlertActions}>
              <TouchableOpacity
                style={styles.shiftAlertSecondaryBtn}
                onPress={() => setShiftAlertVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.shiftAlertSecondaryText}>Nanti Saja</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shiftAlertPrimaryBtn}
                onPress={() => {
                  setShiftAlertVisible(false);
                  setOpenShiftModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Wallet size={15} color="#FFFFFF" />
                <Text style={styles.shiftAlertPrimaryText}>Buka Shift Sekarang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <ReceiptSuccessModal
        visible={successModalVisible}
        transaction={completedTransaction}
        onNewOrder={() => {
          setSuccessModalVisible(false);
        }}
      />

      {/* Desktop WiFi Bridge Pairing Modal */}
      <DesktopPairingModal
        visible={pairingModalVisible}
        onClose={() => setPairingModalVisible(false)}
      />

      {/* Shift Management Modals */}
      <OpenShiftModal
        visible={openShiftModalVisible}
        kasirId={currentUser?.id || 1}
        kasirNama={currentUser?.nama || 'Kasir'}
        onClose={() => setOpenShiftModalVisible(false)}
        onCancelOrLogout={() => setOpenShiftModalVisible(false)}
        onShiftOpened={(shift) => {
          setActiveShift(shift);
          setOpenShiftModalVisible(false);
        }}
      />
      <CloseShiftModal
        visible={closeShiftModalVisible}
        shift={activeShift}
        onClose={() => setCloseShiftModalVisible(false)}
        onShiftClosed={() => {
          setActiveShift(null);
          hasPromptedShiftRef.current = false;
          loadShift(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  containerLandscape: {
    flexDirection: 'row',
  },
  leftSection: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  landscapeCartPanel: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    height: '100%',
  },

  // Header styles
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerContainerLandscape: {
    paddingHorizontal: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnLandscape: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
  },
  headerLogoLandscape: {
    width: 24,
    height: 24,
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerStoreName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerStoreNameLandscape: {
    fontSize: 13,
  },
  offlinePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  offlinePillLandscape: {
    paddingHorizontal: 4,
    paddingVertical: 0.5,
  },
  offlinePillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#B45309',
    textTransform: 'uppercase',
  },
  headerCashierName: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 0.5,
  },
  headerCashierNameLandscape: {
    fontSize: 9.5,
    marginTop: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bridgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  bridgePillLandscape: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  bridgePillOnline: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  bridgePillOffline: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  bridgePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  shiftActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  shiftActivePillLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  shiftGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16A34A',
  },
  shiftActiveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  openShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  openShiftBtnLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  openShiftText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Channels
  channelBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 6,
  },
  channelBarLandscape: {
    paddingVertical: 3,
  },
  channelScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  channelScrollLandscape: {
    paddingHorizontal: 10,
    gap: 5,
  },
  channelTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelTabLandscape: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3.5,
  },
  channelTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  channelTabTextLandscape: {
    fontSize: 10,
  },
  channelTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Search & Categories (Portrait Stacked)
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 3,
  },
  categoryChips: {
    gap: 5,
  },

  // Filter Section (Landscape Inline Row)
  filterSectionLandscapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBarLandscapeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 28,
    width: 135,
  },
  searchInputLandscape: {
    flex: 1,
    fontSize: 11,
    color: '#0F172A',
    marginLeft: 4,
    paddingVertical: 0,
  },
  inlineDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
  },
  categoryChipsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipLandscape: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  categoryChipActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  catDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  categoryChipTextLandscape: {
    fontSize: 9.5,
  },
  categoryChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },

  // Menu Grid
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 3,
    maxWidth: 280,
    lineHeight: 15,
  },
  emptyResetFilterBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  emptyResetFilterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  emptyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  emptyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  emptyActionTextPrimary: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  emptyActionTextSecondary: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },

  menuScrollGrid: {
    padding: 12,
  },
  menuScrollGridLandscape: {
    padding: 8,
  },
  menuGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuGridRowLandscape: {
    gap: 8,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
    justifyContent: 'space-between',
  },
  menuCardLandscape: {
    padding: 8,
    borderRadius: 12,
  },
  menuCardInCart: {
    borderColor: '#D97706',
    borderWidth: 1.5,
    backgroundColor: '#FFFDF7',
  },
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: '65%',
  },
  catBadgeLandscape: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    maxWidth: '60%',
  },
  catBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  catBadgeTextLandscape: {
    fontSize: 8.5,
  },
  toppingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  toppingBadgeLandscape: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  toppingBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#D97706',
  },
  cardEditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cardEditText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#B45309',
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 17,
    minHeight: 34,
  },
  cardTitleLandscape: {
    fontSize: 11.5,
    lineHeight: 15,
    minHeight: 30,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  cardFooterRowLandscape: {
    marginTop: 4,
    paddingTop: 4,
  },
  cardPrice: {
    fontSize: 13,
    fontWeight: '900',
    color: '#D97706',
  },
  cardPriceLandscape: {
    fontSize: 12,
  },
  inCartBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  inCartBadgeLandscape: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  inCartBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  addIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconCircleLandscape: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },

  // Floating Cart Bar (Portrait Mode)
  floatingBarWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 99,
  },
  floatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 7,
  },
  floatingBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingCartIconBox: {
    position: 'relative',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCartBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCartBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  floatingTotalLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  floatingTotalAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  floatingBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  floatingPayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Reusable Cart Content Styles
  cartContentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  drawerHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cartHeaderLandscape: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cartChannelPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  cartChannelText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  cartHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  clearCartText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  drawerCloseBtn: {
    padding: 3,
  },
  cartItemList: {
    flex: 1,
  },
  cartListContent: {
    padding: 8,
    gap: 6,
  },
  cartEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyCartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  emptyCartIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCartTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  emptyCartSubtitle: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 190,
    lineHeight: 14,
  },

  // Cart Item Row (3-Subrow Layout)
  cartItemRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cartItemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  cartItemName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    lineHeight: 15,
  },
  cartItemSubtotal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309',
  },
  cartItemDetailsRow: {
    marginTop: 2,
  },
  cartItemVariants: {
    fontSize: 9.5,
    color: '#D97706',
    fontWeight: '600',
  },
  cartItemNotes: {
    fontSize: 9,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 1,
  },
  cartItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cartItemActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartEditBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDeleteBtn: {
    padding: 4,
  },
  cartItemUnitPrice: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 2,
  },
  cartStepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cartStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepperBtnPlus: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cartStepperQty: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 18,
    textAlign: 'center',
  },

  // Cart Footer
  cartFooter: {
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    gap: 5,
  },
  cartFooterLandscape: {
    paddingHorizontal: 10,
    paddingTop: 6,
    gap: 4,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cartTotalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  cartSummaryCount: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  cartTotalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#D97706',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2.5,
  },
  checkoutBtnLandscape: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  checkoutBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  checkoutBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Drawer modal container
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  drawerBackdropTap: {
    flex: 1,
  },
  drawerContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 340,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },

  // ===== Shift Alert Modal =====
  shiftAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  shiftAlertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  shiftAlertIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  shiftAlertTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  shiftAlertMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    maxWidth: 280,
  },
  shiftAlertTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 18,
    width: '100%',
  },
  shiftAlertTipText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  shiftAlertActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  shiftAlertSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftAlertSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  shiftAlertPrimaryBtn: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  shiftAlertPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  noShiftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 8,
  },
  noShiftBannerLandscape: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  noShiftBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  noShiftBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  noShiftActionPill: {
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noShiftActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

