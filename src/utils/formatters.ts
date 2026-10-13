import { OrderChannel, PaymentMethod } from '../types';

export function formatIDR(amount: number): string {
  if (isNaN(amount)) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDateIndo(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr || '-');
  }
}

export function formatTimeIndo(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

export function formatOnlyDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCurrentTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export function getChannelLabel(channel: OrderChannel): string {
  switch (channel) {
    case 'offline':
      return 'Offline';
    case 'gofood':
      return 'GoFood';
    case 'shopeefood':
      return 'ShopeeFood';
    case 'grabfood':
      return 'GrabFood';
    default:
      return channel;
  }
}

export function getChannelColor(channel: OrderChannel): { bg: string; text: string } {
  switch (channel) {
    case 'offline':
      return { bg: '#E0F2FE', text: '#0369A1' }; // Blue
    case 'gofood':
      return { bg: '#DCFCE7', text: '#15803D' }; // Green
    case 'shopeefood':
      return { bg: '#FFEDD5', text: '#C2410C' }; // Orange
    case 'grabfood':
      return { bg: '#ECFCCB', text: '#4D7C0F' }; // Lime
    default:
      return { bg: '#F1F5F9', text: '#475569' };
  }
}

export function getPaymentMethodLabel(method: PaymentMethod | string): string {
  if (method === 'qris') return 'QRIS';
  if (method === 'tunai' || method === 'cash') return 'Tunai';
  if (method === 'transfer') return 'Transfer Bank';
  if (method === 'edc') return 'EDC/Kartu';
  return String(method || 'Tunai');
}

/**
 * Format Nomor Transaksi agar seragam dengan Desktop POS (contoh: LTR-20260910-0001)
 */
export function formatTransactionNo(id: number | string, tanggal?: string, prefix = 'LTR'): string {
  let y = '';
  let m = '';
  let d = '';

  if (tanggal) {
    const dObj = new Date(tanggal);
    if (!isNaN(dObj.getTime())) {
      y = String(dObj.getFullYear());
      m = String(dObj.getMonth() + 1).padStart(2, '0');
      d = String(dObj.getDate()).padStart(2, '0');
    }
  }

  if (!y) {
    const now = new Date();
    y = String(now.getFullYear());
    m = String(now.getMonth() + 1).padStart(2, '0');
    d = String(now.getDate()).padStart(2, '0');
  }

  const numericId = typeof id === 'number' ? id : parseInt(String(id), 10);
  const counterStr = isNaN(numericId) ? String(id).slice(-4) : String(numericId).padStart(4, '0');
  return `${prefix}-${y}${m}${d}-${counterStr}`;
}

/**
 * Format string or number to Indonesian thousand-separator format (e.g. 10000 -> "10.000")
 * Strips all non-digit characters first.
 */
export function formatCurrencyInput(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const rawStr = String(val).replace(/\D/g, '');
  if (!rawStr) return '';
  const num = parseInt(rawStr, 10);
  if (isNaN(num)) return '';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse a thousand-separated string back to raw number (e.g. "10.000" -> 10000)
 */
export function parseCurrencyInput(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const rawStr = String(val).replace(/\D/g, '');
  const num = parseInt(rawStr, 10);
  return isNaN(num) ? 0 : num;
}

