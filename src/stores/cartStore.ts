import { create } from 'zustand';
import { CartItem, MenuItem, MenuVariant, OrderChannel, getVariantPriceForChannel } from '../types';

interface CartState {
  currentChannel: OrderChannel;
  cartItems: CartItem[];
  catatanPesanan: string;
  setChannel: (channel: OrderChannel) => void;
  setCatatanPesanan: (catatan: string) => void;
  addItem: (menuItem: MenuItem, selectedVariants?: MenuVariant[], customNotes?: string) => void;
  editCartItem: (uid: string, selectedVariants: MenuVariant[], customNotes?: string) => void;
  updateQty: (uid: string, delta: number) => void;
  removeItem: (uid: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export function getMenuItemPriceForChannel(item: MenuItem, channel: OrderChannel): number {
  switch (channel) {
    case 'gofood':
      return item.harga_gofood || item.harga_offline;
    case 'shopeefood':
      return item.harga_shopeefood || item.harga_offline;
    case 'grabfood':
      return item.harga_grabfood || item.harga_offline;
    case 'offline':
    default:
      return item.harga_offline;
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  currentChannel: 'offline',
  cartItems: [],
  catatanPesanan: '',

  setChannel: (channel) => {
    // When channel changes, recalculate unit price for items in cart
    const current = get().cartItems;
    const updated = current.map((item) => {
      const basePrice = getMenuItemPriceForChannel(item.menuItem, channel);
      const variantTotal = item.selectedVariants.reduce((sum, v) => sum + getVariantPriceForChannel(v, channel), 0);
      const unitPrice = basePrice + variantTotal;
      return {
        ...item,
        unitPrice,
        subtotal: unitPrice * item.qty,
      };
    });
    set({ currentChannel: channel, cartItems: updated });
  },

  setCatatanPesanan: (catatan) => set({ catatanPesanan: catatan }),

  addItem: (menuItem, selectedVariants = [], customNotes = '') => {
    const channel = get().currentChannel;
    const basePrice = getMenuItemPriceForChannel(menuItem, channel);
    const variantTotal = selectedVariants.reduce((sum, v) => sum + getVariantPriceForChannel(v, channel), 0);
    const unitPrice = basePrice + variantTotal;

    // Create unique key based on item id and selected variant names + notes
    const variantKey = selectedVariants.map((v) => v.nama_varian).sort().join('|');
    const uid = `${menuItem.id}_${variantKey}_${customNotes}`;

    const existingIndex = get().cartItems.findIndex((i) => i.uid === uid);
    if (existingIndex > -1) {
      const updated = [...get().cartItems];
      updated[existingIndex].qty += 1;
      updated[existingIndex].subtotal = updated[existingIndex].unitPrice * updated[existingIndex].qty;
      set({ cartItems: updated });
    } else {
      const newItem: CartItem = {
        uid,
        menuItem,
        selectedVariants,
        customNotes,
        qty: 1,
        unitPrice,
        subtotal: unitPrice,
      };
      set({ cartItems: [...get().cartItems, newItem] });
    }
  },

  editCartItem: (uid, selectedVariants = [], customNotes = '') => {
    const channel = get().currentChannel;
    const items = get().cartItems;
    const itemIndex = items.findIndex((i) => i.uid === uid);
    if (itemIndex === -1) return;

    const currentItem = items[itemIndex];
    const basePrice = getMenuItemPriceForChannel(currentItem.menuItem, channel);
    const variantTotal = selectedVariants.reduce((sum, v) => sum + getVariantPriceForChannel(v, channel), 0);
    const unitPrice = basePrice + variantTotal;

    const variantKey = selectedVariants.map((v) => v.nama_varian).sort().join('|');
    const newUid = `${currentItem.menuItem.id}_${variantKey}_${customNotes}`;

    // If newUid already matches another item in cart (merge them)
    const duplicateIndex = items.findIndex((i) => i.uid === newUid && i.uid !== uid);
    if (duplicateIndex > -1) {
      // After filtering out itemIndex, the duplicate's index shifts if it was after itemIndex
      const mergeTargetIdx = duplicateIndex > itemIndex ? duplicateIndex - 1 : duplicateIndex;
      const updated = items
        .filter((_, idx) => idx !== itemIndex)
        .map((item, idx) => {
          if (idx === mergeTargetIdx) {
            const mergedQty = item.qty + currentItem.qty;
            return {
              ...item,
              qty: mergedQty,
              subtotal: item.unitPrice * mergedQty,
            };
          }
          return item;
        });
      set({ cartItems: updated });
    } else {
      const updated = [...items];
      updated[itemIndex] = {
        ...currentItem,
        uid: newUid,
        selectedVariants,
        customNotes,
        unitPrice,
        subtotal: unitPrice * currentItem.qty,
      };
      set({ cartItems: updated });
    }
  },

  updateQty: (uid, delta) => {
    const updated = get()
      .cartItems.map((item) => {
        if (item.uid === uid) {
          const newQty = item.qty + delta;
          if (newQty <= 0) return null;
          return {
            ...item,
            qty: newQty,
            subtotal: item.unitPrice * newQty,
          };
        }
        return item;
      })
      .filter((item): item is CartItem => item !== null);

    set({ cartItems: updated });
  },

  removeItem: (uid) => {
    set({ cartItems: get().cartItems.filter((i) => i.uid !== uid) });
  },

  clearCart: () => {
    set({ cartItems: [], catatanPesanan: '' });
  },

  getTotal: () => {
    return get().cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  },

  getItemCount: () => {
    return get().cartItems.reduce((sum, item) => sum + item.qty, 0);
  },
}));
