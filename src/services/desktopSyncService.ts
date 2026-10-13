import { getDatabase, runWithDbLock } from '../database/db';
import { useSyncStore } from '../stores/syncStore';
import { showToast } from '../stores/toastStore';
import { MenuCategory, MenuItem, User, WalletType } from '../types';
import { transactionService } from './transactionService';
import { menuService } from './menuService';

export interface SyncInfoResponse {
  status: string;
  server: string;
  port: number;
  primaryIp: string;
  pairingUrl: string;
  storeName: string;
  menuItemCount: number;
  pairingToken?: string;
  token?: string;
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = useSyncStore.getState().bridgeToken;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'x-device-id': useSyncStore.getState().deviceId,
    'x-device-type': 'android',
    'x-device-name': 'HP Kasir Android',
    ...extraHeaders,
  };
  if (token) {
    headers['x-bridge-token'] = token;
  }
  return headers;
}

export function normalizeServerUrl(raw?: string): string {
  if (!raw || !raw.trim()) {
    const saved = useSyncStore.getState().serverUrl;
    if (saved && saved.trim()) return saved.trim();
    return '';
  }
  let trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `http://${trimmed}`;
  }
  const hasPort = /:\d+$/.test(trimmed) || /:\d+\//.test(trimmed);
  if (!hasPort) {
    trimmed = `${trimmed}:4545`;
  }
  return trimmed;
}

export function normalizeDateToLocal(dateStr?: string | null): string {
  if (!dateStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }
  try {
    const clean = String(dateStr).replace(' ', 'T');
    const d = new Date(clean);
    if (isNaN(d.getTime())) return String(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  } catch {
    return String(dateStr);
  }
}

export type SyncEventType = 'catalog' | 'orders' | 'stock' | 'expenses' | 'users' | 'logs' | 'wallets';
export type SyncEventListener = (event: SyncEventType, payload?: any) => void;

const syncListeners = new Set<SyncEventListener>();

export function subscribeToSyncEvents(listener: SyncEventListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function notifySyncListeners(event: SyncEventType, payload?: any) {
  syncListeners.forEach((listener) => {
    try {
      listener(event, payload);
    } catch (e) {
      console.warn('[Sync Event] Listener error:', e);
    }
  });
}

let liveWs: WebSocket | null = null;
let heartbeatTimer: any = null;
let _suppressNextMasterVariantSync = false;

export const desktopSyncService = {
  normalizeServerUrl,

  async handleWsIncomingData(rawData: string) {
    try {
      const data = JSON.parse(rawData);
      console.log('[Sync WS] Event received:', data.type);
      if (data.type === 'FORCE_DISCONNECT') {
        this.handleForcedDisconnect(data.message);
      } else if (data.type === 'USERS_UPDATED') {
        await this.syncUsersFromDesktop().catch(() => {});
        notifySyncListeners('users');
      } else if (data.type === 'USER_DELETED') {
        if (data.id || data.nama) {
          await this.handleIncomingUserDelete(data.id, data.nama).catch(() => {});
        }
        notifySyncListeners('users');
      } else if (data.type === 'CATALOG_UPDATED') {
        await this.syncMenuFromDesktop().catch(() => {});
        await this.syncStockFromDesktop().catch(() => {});
        await this.syncUsersFromDesktop().catch(() => {});
        await this.syncOrdersFromDesktop().catch(() => {});
        await this.syncExpensesFromDesktop().catch(() => {});
        await this.syncTransfersFromDesktop().catch(() => {});
        await this.syncAdjustmentsFromDesktop().catch(() => {});
        notifySyncListeners('catalog');
        notifySyncListeners('stock');
        notifySyncListeners('orders');
        notifySyncListeners('expenses');
        notifySyncListeners('users');
        notifySyncListeners('wallets');
      } else if (
        data.type === 'NEW_MOBILE_MENU_ITEM' ||
        data.type === 'MOBILE_MENU_DELETED' ||
        data.type === 'RECIPES_UPDATED' ||
        data.type === 'MASTER_VARIANT_UPDATED' ||
        data.type === 'MASTER_VARIANT_DELETED'
      ) {
        // Skip echo-back sync jika kita yang baru saja push (mencegah duplikasi)
        if (_suppressNextMasterVariantSync && data.type === 'MASTER_VARIANT_UPDATED') {
          _suppressNextMasterVariantSync = false;
          notifySyncListeners('catalog');
        } else {
          await this.syncMenuFromDesktop().catch(() => {});
          notifySyncListeners('catalog');
        }
      } else if (data.type === 'NEW_MOBILE_ORDER' || data.type === 'NEW_DESKTOP_ORDER' || data.type === 'NEW_ORDER' || data.type === 'ORDERS_UPDATED') {
        await this.syncOrdersFromDesktop().catch(() => {});
        notifySyncListeners('orders');
        notifySyncListeners('stock');
      } else if (data.type === 'ORDER_VOIDED') {
        await this.handleIncomingVoid(data).catch(() => {});
        notifySyncListeners('orders');
        notifySyncListeners('stock');
      } else if (data.type === 'STOCK_ADJUSTED' || data.type === 'STOCK_PURCHASED' || data.type === 'STOCK_UPDATED' || data.type === 'INGREDIENT_SAVED') {
        await this.syncStockFromDesktop().catch(() => {});
        notifySyncListeners('stock');
      } else if (data.type === 'NEW_MOBILE_EXPENSE' || data.type === 'NEW_DESKTOP_EXPENSE' || data.type === 'EXPENSES_UPDATED') {
        if (data.expense) {
          await this.applyIncomingExpense(data.expense).catch(() => {});
        } else {
          await this.syncExpensesFromDesktop().catch(() => {});
        }
        notifySyncListeners('expenses', data.expense);
        notifySyncListeners('wallets');
      } else if (data.type === 'WALLETS_UPDATED' || data.type === 'NEW_WALLET_TRANSFER' || data.type === 'NEW_BALANCE_ADJUSTMENT') {
        if (data.type === 'NEW_WALLET_TRANSFER' && data.transfer) {
          await this.applyIncomingTransfer(data.transfer).catch(() => {});
        } else if (data.type === 'NEW_BALANCE_ADJUSTMENT' && data.adjustment) {
          await this.applyIncomingAdjustment(data.adjustment).catch(() => {});
        } else {
          await this.syncTransfersFromDesktop().catch(() => {});
          await this.syncAdjustmentsFromDesktop().catch(() => {});
        }
        notifySyncListeners('wallets');
      } else if (data.type === 'EXPENSE_DELETED') {
        if (data.id) {
          await runWithDbLock(async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM expenses WHERE id = ?;', [data.id]).catch(() => {});
          });
        }
        notifySyncListeners('expenses');
      } else if (data.type === 'WALLET_TRANSFER_DELETED') {
        if (data.id) {
          await runWithDbLock(async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM wallet_transfers WHERE id = ?;', [String(data.id)]).catch(() => {});
          });
        }
        notifySyncListeners('wallets');
      } else if (data.type === 'SALES_RESET') {
        await this.handleIncomingSalesReset().catch(() => {});
        notifySyncListeners('orders');
        notifySyncListeners('expenses');
      } else if (data.type === 'NEW_ACTIVITY_LOG' || data.type === 'LOGS_UPDATED') {
        await this.syncLogsFromDesktop().catch(() => {});
        notifySyncListeners('logs');
      } else if (data.type === 'DATABASE_RESET_TO_DEFAULT') {
        await this.handleIncomingDatabaseReset().catch(() => {});
        notifySyncListeners('catalog');
        notifySyncListeners('stock');
        notifySyncListeners('orders');
        notifySyncListeners('expenses');
        notifySyncListeners('users');
        notifySyncListeners('logs');
        notifySyncListeners('wallets');
      }
    } catch (e) {
      console.warn('[Sync WS] Error parsing WS message:', e);
    }
  },

  async catchUpAllFromDesktop() {
    try {
      await this.syncMenuFromDesktop();
      notifySyncListeners('catalog');
    } catch (e) {
      console.warn('[Sync] Catchup menu warning:', e);
    }
    try {
      await this.syncOrdersFromDesktop();
      notifySyncListeners('orders');
    } catch (e) {
      console.warn('[Sync] Catchup orders warning:', e);
    }
    try {
      await this.syncStockFromDesktop();
      notifySyncListeners('stock');
    } catch (e) {
      console.warn('[Sync] Catchup stock warning:', e);
    }
    try {
      await this.syncExpensesFromDesktop();
      notifySyncListeners('expenses');
    } catch (e) {
      console.warn('[Sync] Catchup expenses warning:', e);
    }
    try {
      await this.syncUsersFromDesktop();
      notifySyncListeners('users');
    } catch (e) {
      console.warn('[Sync] Catchup users warning:', e);
    }
    try {
      await this.syncLogsFromDesktop();
      notifySyncListeners('logs');
    } catch (e) {
      console.warn('[Sync] Catchup logs warning:', e);
    }
    try {
      await this.syncTransfersFromDesktop();
      await this.syncAdjustmentsFromDesktop();
      notifySyncListeners('wallets');
    } catch (e) {
      console.warn('[Sync] Catchup wallets warning:', e);
    }
  },

  handleForcedDisconnect(message?: string) {
    const alertMsg = message || 'Koneksi perangkat telah diputuskan oleh komputer kasir utama.';
    console.log('[Sync] Disconnecting device:', alertMsg);

    const wasConnected = useSyncStore.getState().isConnected;
    useSyncStore.getState().setIsConnected(false);
    useSyncStore.getState().setDisconnectMessage(alertMsg);

    if (liveWs) {
      try {
        liveWs.onclose = null;
        liveWs.close();
      } catch {}
      liveWs = null;
    }

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (wasConnected) {
      showToast({ type: 'warning', title: 'Koneksi Terputus', message: alertMsg });
    }
  },

  startLiveMonitoring(serverUrl: string) {
    // 1. Clean previous connections
    if (liveWs) {
      try {
        liveWs.onclose = null;
        liveWs.close();
      } catch {}
      liveWs = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // 2. Start WebSocket connection for realtime push notifications
    try {
      const devId = encodeURIComponent(useSyncStore.getState().deviceId);
      const token = useSyncStore.getState().bridgeToken;
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws?device=${devId}&action=pair${tokenParam}`;
      liveWs = new WebSocket(wsUrl);

      liveWs.onopen = () => {
        console.log('[Sync WS] Connected to Desktop Bridge WebSocket');
        if (liveWs && liveWs.readyState === WebSocket.OPEN) {
          liveWs.send(
            JSON.stringify({
              type: 'IDENTIFY',
              deviceId: useSyncStore.getState().deviceId,
              deviceName: 'HP Kasir Android',
              deviceType: 'Android Kasir',
              token: useSyncStore.getState().bridgeToken,
            })
          );
        }
        this.syncPendingOrders().catch(() => {});
        this.syncPendingExpenses().catch(() => {});
        this.syncPendingTransfers().catch(() => {});
        this.syncPendingAdjustments().catch(() => {});
        this.syncPendingStockMovements().catch(() => {});
        this.catchUpAllFromDesktop().catch(() => {});
      };

      liveWs.onmessage = (event) => {
        this.handleWsIncomingData(event.data);
      };

      liveWs.onclose = (event) => {
        console.log('[Sync WS] Closed with code:', event.code, event.reason);
        if (event.code === 4001) {
          this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        }
      };

      liveWs.onerror = (err: any) => {
        console.log('[Sync WS] Connection notice:', err?.message || 'Reconnecting or closed');
      };
    } catch (wsErr) {
      console.warn('[Sync WS] Could not initialize WebSocket:', wsErr);
    }

    // 3. Heartbeat safety polling every 15 seconds (reduced from 4s for battery conservation)
    heartbeatTimer = setInterval(async () => {
      if (!useSyncStore.getState().isConnected) {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        return;
      }

      try {
        const res = await fetch(`${serverUrl}/api/info?device=android`, {
          method: 'GET',
          headers: getAuthHeaders(),
          signal: AbortSignal.timeout(3000),
        });

        if (res.status === 403) {
          this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
          return;
        }

        // Check and maintain live WebSocket health
        if (useSyncStore.getState().isConnected) {
          if (liveWs && liveWs.readyState === WebSocket.OPEN) {
            try {
              liveWs.send(JSON.stringify({ type: 'PING' }));
            } catch {
              try { liveWs.close(); } catch {}
            }
          } else if (!liveWs || liveWs.readyState === WebSocket.CLOSED || liveWs.readyState === WebSocket.CLOSING) {
            try {
              const devId = encodeURIComponent(useSyncStore.getState().deviceId);
              const token = useSyncStore.getState().bridgeToken;
              const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
              const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws?device=${devId}&action=pair${tokenParam}`;
              liveWs = new WebSocket(wsUrl);
              liveWs.onopen = () => {
                console.log('[Sync WS] Reconnected to Desktop Bridge WebSocket');
                if (liveWs && liveWs.readyState === WebSocket.OPEN) {
                  liveWs.send(
                    JSON.stringify({
                      type: 'IDENTIFY',
                      deviceId: useSyncStore.getState().deviceId,
                      deviceName: 'HP Kasir Android',
                      deviceType: 'Android Kasir',
                      token: useSyncStore.getState().bridgeToken,
                    })
                  );
                }
                this.syncPendingOrders().catch(() => {});
                this.syncPendingExpenses().catch(() => {});
                this.syncPendingTransfers().catch(() => {});
                this.syncPendingAdjustments().catch(() => {});
                this.syncPendingStockMovements().catch(() => {});
              };
              liveWs.onmessage = (event) => {
                this.handleWsIncomingData(event.data);
              };
              liveWs.onclose = (event) => {
                if (event.code === 4001) {
                  this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
                }
              };
            } catch (e) {}
          }
        }
      } catch {
        // Transient network lag, WebSocket or next cycle will catch
      }
    }, 10000);
  },

  // 1. Test ping connection to desktop
  async testConnection(targetUrl?: string, isExplicitPair: boolean = false): Promise<{ success: boolean; data?: SyncInfoResponse; error?: string }> {
    let raw = targetUrl || useSyncStore.getState().serverUrl;
    if (!raw || !raw.trim()) {
      raw = await useSyncStore.getState().initFromStorage();
    }
    if (!raw || !raw.trim()) {
      return { success: false, error: 'Silakan scan QR Code pada layar Desktop Kasir.' };
    }
    const cleanUrl = normalizeServerUrl(raw);
    useSyncStore.getState().setIsConnecting(true);

    // Helper to attempt fetch with timeout
    const tryPing = async (url: string): Promise<SyncInfoResponse> => {
      const pairParam = isExplicitPair ? '&action=pair' : '';
      const response = await fetch(`${url}/api/info?device=android${pairParam}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(3500),
      });
      if (response.status === 403) {
        throw new Error('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
      }
      if (!response.ok) {
        throw new Error(`Server status HTTP ${response.status}`);
      }
      return await response.json();
    };

    try {
      // 1. Attempt primary URL
      const data = await tryPing(cleanUrl);
      useSyncStore.getState().setServerUrl(cleanUrl);
      useSyncStore.getState().setIsConnected(true);
      if (data.storeName) {
        useSyncStore.getState().setStoreName(data.storeName);
      }
      if (data.pairingToken || data.token) {
        useSyncStore.getState().setBridgeToken(data.pairingToken || data.token || null);
      }
      this.startLiveMonitoring(cleanUrl);
      this.syncPendingOrders().catch((e) => console.warn('[Sync] Auto-push offline orders failed:', e));
      this.syncPendingExpenses().catch((e) => console.warn('[Sync] Auto-push offline expenses failed:', e));
      this.syncPendingTransfers().catch((e) => console.warn('[Sync] Auto-push offline transfers failed:', e));
      this.syncPendingAdjustments().catch((e) => console.warn('[Sync] Auto-push offline adjustments failed:', e));
      this.syncPendingStockMovements().catch((e) => console.warn('[Sync] Auto-push offline stock movements failed:', e));
      this.catchUpAllFromDesktop().catch((e) => console.warn('[Sync] Catchup failed:', e));
      return { success: true, data };
    } catch (err: any) {
      if (err?.message?.includes('diputuskan')) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return {
          success: false,
          error: 'Koneksi perangkat telah diputuskan oleh komputer kasir utama.',
        };
      }

      // 2. If primary fails and it was not already localhost, try ADB USB reverse (127.0.0.1:4545)
      if (!cleanUrl.includes('127.0.0.1') && !cleanUrl.includes('localhost')) {
        try {
          const usbUrl = 'http://127.0.0.1:4545';
          const usbData = await tryPing(usbUrl);
          useSyncStore.getState().setServerUrl(usbUrl);
          useSyncStore.getState().setIsConnected(true);
          if (usbData.storeName) {
            useSyncStore.getState().setStoreName(usbData.storeName);
          }
          if (usbData.pairingToken || usbData.token) {
            useSyncStore.getState().setBridgeToken(usbData.pairingToken || usbData.token || null);
          }
          this.startLiveMonitoring(usbUrl);
          this.syncPendingOrders().catch((e) => console.warn('[Sync] Auto-push offline orders failed:', e));
          this.syncPendingExpenses().catch((e) => console.warn('[Sync] Auto-push offline expenses failed:', e));
          this.syncPendingStockMovements().catch((e) => console.warn('[Sync] Auto-push offline stock movements failed:', e));
          this.catchUpAllFromDesktop().catch((e) => console.warn('[Sync] Catchup failed:', e));
          return { success: true, data: usbData };
        } catch (usbErr: any) {
          if (usbErr?.message?.includes('diputuskan')) {
            this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
            return {
              success: false,
              error: 'Koneksi perangkat telah diputuskan oleh komputer kasir utama.',
            };
          }
          // Both failed
        }
      }

      useSyncStore.getState().setIsConnected(false);
      return {
        success: false,
        error:
          'Tidak dapat terhubung ke komputer kasir. Mohon pastikan HP dan komputer kasir sudah terhubung ke jaringan Wi-Fi yang sama.',
      };
    } finally {
      useSyncStore.getState().setIsConnecting(false);
    }
  },

  // 2. Parse scanned QR Code content into candidate server URLs
  parseQrCandidates(rawString: string): string[] {
    if (!rawString) return [];
    const trimmed = rawString.trim();
    const candidates: string[] = [];

    // Case 1: JSON payload with candidate URLs & token
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.pairingToken || parsed.token) {
        useSyncStore.getState().setBridgeToken(parsed.pairingToken || parsed.token);
      }
      if (Array.isArray(parsed.candidates)) {
        for (const c of parsed.candidates) {
          if (c && typeof c === 'string') candidates.push(normalizeServerUrl(c));
        }
      }
      if (Array.isArray(parsed.allIps) && parsed.port) {
        for (const ip of parsed.allIps) {
          candidates.push(normalizeServerUrl(`http://${ip}:${parsed.port}`));
        }
      }
      if (parsed.host && parsed.port) {
        candidates.push(normalizeServerUrl(`http://${parsed.host}:${parsed.port}`));
      }
      if (parsed.ip && parsed.port) {
        candidates.push(normalizeServerUrl(`http://${parsed.ip}:${parsed.port}`));
      }
      if (parsed.host) {
        candidates.push(normalizeServerUrl(`http://${parsed.host}:4545`));
      }
    } catch {
      // Ignore JSON parse error
    }

    // Case 2: Direct HTTP URL or IP address
    const tokenMatch = trimmed.match(/[?&]token=([^&]+)/i);
    if (tokenMatch && tokenMatch[1]) {
      useSyncStore.getState().setBridgeToken(decodeURIComponent(tokenMatch[1]));
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
      candidates.push(normalizeServerUrl(trimmed));
    }

    return Array.from(new Set(candidates)).filter(Boolean);
  },

  // Backward compatible single parse
  parseQrCode(rawString: string): string | null {
    const candidates = this.parseQrCandidates(rawString);
    return candidates.length > 0 ? candidates[0] : null;
  },

  // 2b. Connect automatically to any responding candidate from QR scan
  async connectFromQr(rawString: string): Promise<{ success: boolean; url?: string; data?: SyncInfoResponse; error?: string }> {
    const candidates = this.parseQrCandidates(rawString);
    if (candidates.length === 0) {
      return { success: false, error: 'QR Code tidak dikenali. Mohon pindai QR Code yang tampil di layar kasir desktop.' };
    }

    useSyncStore.getState().setIsConnecting(true);
    try {
      const probeCandidate = async (url: string): Promise<{ url: string; data: SyncInfoResponse }> => {
        const response = await fetch(`${url}/api/info?device=android&action=pair`, {
          method: 'GET',
          headers: getAuthHeaders(),
          signal: AbortSignal.timeout(2500),
        });
        if (response.status === 403) {
          throw new Error('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return { url, data };
      };

      try {
        // Probe all candidate network IPs concurrently
        const winner = await Promise.any(candidates.map((c) => probeCandidate(c)));
        useSyncStore.getState().setDisconnectMessage(null);
        useSyncStore.getState().setServerUrl(winner.url);
        useSyncStore.getState().setIsConnected(true);
        if (winner.data.storeName) {
          useSyncStore.getState().setStoreName(winner.data.storeName);
        }
        if (winner.data.pairingToken || winner.data.token) {
          useSyncStore.getState().setBridgeToken(winner.data.pairingToken || winner.data.token || null);
        }

        // Explicitly pair device on server to remove any block list entry
        try {
          fetch(`${winner.url}/api/bridge/pair-device`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              deviceId: useSyncStore.getState().deviceId,
              deviceName: 'HP Kasir Android',
            }),
            signal: AbortSignal.timeout(2000),
          }).catch(() => {});
        } catch {}

        this.startLiveMonitoring(winner.url);
        this.syncPendingOrders().catch((e) => console.warn('[Sync] Auto-push offline orders failed:', e));
        this.syncPendingExpenses().catch((e) => console.warn('[Sync] Auto-push offline expenses failed:', e));
        this.syncPendingStockMovements().catch((e) => console.warn('[Sync] Auto-push offline stock movements failed:', e));
        this.catchUpAllFromDesktop().catch((e) => console.warn('[Sync] Catchup failed:', e));
        return { success: true, url: winner.url, data: winner.data };
      } catch {
        // Network candidates failed, try USB reverse (127.0.0.1:4545)
        try {
          const usbUrl = 'http://127.0.0.1:4545';
          const usbRes = await probeCandidate(usbUrl);
          useSyncStore.getState().setDisconnectMessage(null);
          useSyncStore.getState().setServerUrl(usbUrl);
          useSyncStore.getState().setIsConnected(true);
          if (usbRes.data.storeName) {
            useSyncStore.getState().setStoreName(usbRes.data.storeName);
          }
          if (usbRes.data.pairingToken || usbRes.data.token) {
            useSyncStore.getState().setBridgeToken(usbRes.data.pairingToken || usbRes.data.token || null);
          }

          try {
            fetch(`${usbUrl}/api/bridge/pair-device`, {
              method: 'POST',
              headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                deviceId: useSyncStore.getState().deviceId,
                deviceName: 'HP Kasir Android',
              }),
              signal: AbortSignal.timeout(2000),
            }).catch(() => {});
          } catch {}

          this.startLiveMonitoring(usbUrl);
          this.syncPendingOrders().catch((e) => console.warn('[Sync] Auto-push offline orders failed:', e));
          this.syncPendingExpenses().catch((e) => console.warn('[Sync] Auto-push offline expenses failed:', e));
          this.syncPendingStockMovements().catch((e) => console.warn('[Sync] Auto-push offline stock movements failed:', e));
          this.catchUpAllFromDesktop().catch((e) => console.warn('[Sync] Catchup failed:', e));
          return { success: true, url: usbUrl, data: usbRes.data };
        } catch {}
      }

      return {
        success: false,
        error: 'Tidak dapat menjangkau komputer kasir utama. Mohon pastikan HP dan komputer kasir sudah terhubung ke jaringan Wi-Fi yang sama, lalu coba pindai ulang.',
      };
    } finally {
      useSyncStore.getState().setIsConnecting(false);
    }
  },

  // 3. Pull menu catalog from Desktop and cache into local SQLite
  async syncMenuFromDesktop(): Promise<{ success: boolean; itemCount?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) {
      return { success: false, error: 'Alamat server desktop belum diatur.' };
    }

    try {
      // 1. Push any pending local menus created on mobile first
      try {
        const pendingMenus = await menuService.getUnsyncedMenuItems();
        for (const pMenu of pendingMenus) {
          const pushed = await this.pushMenuItemToDesktop(pMenu);
          if (pushed) {
            await menuService.markMenuSynced(pMenu.id);
          }
        }
      } catch (e) {
        console.warn('[Sync] Could not push pending menus:', e);
      }

      const response = await fetch(`${serverUrl}/api/sync/menu`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(6000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const categories: MenuCategory[] = data.categories || [];
      const menuItems: MenuItem[] = data.menuItems || [];
      const recipes: any[] = data.recipes || [];

      // SAFETY GUARD: If Desktop sends 0 menu items, DO NOT wipe local menu catalog!
      if (!menuItems || menuItems.length === 0) {
        console.warn('[Sync] Desktop sent 0 menu items. Skipping sync to protect local menu catalog.');
        return { success: true, itemCount: 0 };
      }

      // Save categories & menu items into local SQLite database
      await runWithDbLock(async () => {
        const db = await getDatabase();
        await db.execAsync('PRAGMA foreign_keys = OFF;').catch(() => {});
        try {
          // Map remote category id to local category id
          const catMap = new Map<number, number>();

        // Upsert categories safely without UNIQUE collision
        for (const cat of categories) {
          const existingCat = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM menu_categories WHERE nama = ? OR id = ?;',
            [cat.nama, cat.id]
          );
          if (existingCat) {
            await db.runAsync(
              'UPDATE menu_categories SET nama = ? WHERE id = ?;',
              [cat.nama, existingCat.id]
            );
            catMap.set(cat.id, existingCat.id);
          } else {
            const res = await db.runAsync(
              'INSERT INTO menu_categories (nama) VALUES (?);',
              [cat.nama]
            );
            catMap.set(cat.id, res.lastInsertRowId);
          }
        }

        // Ensure at least one category exists as fallback and collect valid category IDs
        const allCurrentCats = await db.getAllAsync<{ id: number }>('SELECT id FROM menu_categories;');
        let fallbackCatId = allCurrentCats.length > 0 ? allCurrentCats[0].id : 1;
        if (allCurrentCats.length === 0) {
          const res = await db.runAsync("INSERT OR IGNORE INTO menu_categories (id, nama) VALUES (1, 'Menu Utama');");
          fallbackCatId = res.lastInsertRowId || 1;
        }
        const validCatIds = new Set(allCurrentCats.map((c) => c.id));
        validCatIds.add(fallbackCatId);

        // Push and skip offline deleted menu items so Desktop deletes them and Mobile never resurrects them
        const deletedItems = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM deleted_menu_items;');
        for (const del of deletedItems) {
          const ok = await this.deleteMenuItemOnDesktop(del.id, del.nama || '');
          if (ok) {
            await db.runAsync('DELETE FROM deleted_menu_items WHERE id = ?;', [del.id]).catch(() => {});
          }
        }
        const remainingDeleted = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM deleted_menu_items;');
        const deletedIds = new Set(remainingDeleted.map((d) => d.id));
        const deletedNames = new Set(remainingDeleted.map((d) => (d.nama || '').toLowerCase().trim()));

        // Upsert menu items & variants safely
        const receivedItemNames = new Set<string>();
        const itemMap = new Map<number, number>(); // desktopItemId -> localItemId
        const ingMap = new Map<number, number>();
        const existingIngs = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM ingredients;');
        existingIngs.forEach((i) => ingMap.set(i.id, i.id));

        for (const item of menuItems) {
          if (deletedIds.has(item.id) || deletedNames.has((item.nama || '').toLowerCase().trim())) {
            continue; // Skip resurrecting deleted menu item
          }
          receivedItemNames.add(item.nama.toLowerCase().trim());
          let localCatId = catMap.get(item.category_id) || item.category_id;
          if (!localCatId || !validCatIds.has(localCatId)) {
            localCatId = fallbackCatId;
          }
          const existingItem = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM menu_items WHERE id = ? OR nama = ?;',
            [item.id, item.nama]
          );

          let targetItemId = item.id;
          if (existingItem) {
            targetItemId = existingItem.id;
            await db.runAsync(
              `UPDATE menu_items SET
                 category_id = ?,
                 nama = ?,
                 harga_offline = ?,
                 harga_gofood = ?,
                 harga_shopeefood = ?,
                 harga_grabfood = ?,
                 status_tersedia = ?,
                 image_url = CASE WHEN ? IS NOT NULL THEN ? ELSE image_url END,
                 is_synced = 1
               WHERE id = ?;`,
              [
                localCatId,
                item.nama,
                item.harga_offline ?? (item as any).harga ?? 0,
                item.harga_gofood ?? item.harga_offline ?? (item as any).harga ?? 0,
                item.harga_shopeefood ?? item.harga_offline ?? (item as any).harga ?? 0,
                item.harga_grabfood ?? item.harga_offline ?? (item as any).harga ?? 0,
                item.status_tersedia ? 1 : 0,
                item.image_url !== undefined ? item.image_url : null,
                item.image_url || null,
                existingItem.id,
              ]
            );
            targetItemId = existingItem.id;
          } else {
            // Preserve Desktop's item.id if provided so IDs match across devices
            if (item.id) {
              try {
                await db.runAsync(
                  `INSERT INTO menu_items (id, category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, image_url, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
                  [
                    item.id,
                    localCatId,
                    item.nama,
                    item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_gofood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_shopeefood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_grabfood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.status_tersedia ? 1 : 0,
                    item.image_url || null,
                  ]
                );
                targetItemId = item.id;
              } catch {
                const res = await db.runAsync(
                  `INSERT INTO menu_items (category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, image_url, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);`,
                  [
                    localCatId,
                    item.nama,
                    item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_gofood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_shopeefood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.harga_grabfood ?? item.harga_offline ?? (item as any).harga ?? 0,
                    item.status_tersedia ? 1 : 0,
                    item.image_url || null,
                  ]
                );
                targetItemId = res.lastInsertRowId;
              }
            } else {
              const res = await db.runAsync(
                `INSERT INTO menu_items (category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, image_url, is_synced)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);`,
                [
                  localCatId,
                  item.nama,
                  item.harga_offline ?? (item as any).harga ?? 0,
                  item.harga_gofood ?? item.harga_offline ?? (item as any).harga ?? 0,
                  item.harga_shopeefood ?? item.harga_offline ?? (item as any).harga ?? 0,
                  item.harga_grabfood ?? item.harga_offline ?? (item as any).harga ?? 0,
                  item.status_tersedia ? 1 : 0,
                  item.image_url || null,
                ]
              );
              targetItemId = res.lastInsertRowId;
            }
          }

          if (item.id) {
            itemMap.set(item.id, targetItemId);
          }

          // If variants are provided, sync them (clear old variants first)
          if (Array.isArray(item.variants)) {
            await db.runAsync('DELETE FROM menu_variants WHERE menu_item_id = ?;', [targetItemId]);
            for (const v of item.variants) {
              const offPrice = Number((v as any).harga_offline ?? v.harga_tambahan ?? 0);
              const goPrice = (v as any).harga_gofood !== undefined ? Number((v as any).harga_gofood) : offPrice;
              const shopeePrice = (v as any).harga_shopeefood !== undefined ? Number((v as any).harga_shopeefood) : offPrice;
              const grabPrice = (v as any).harga_grabfood !== undefined ? Number((v as any).harga_grabfood) : offPrice;
              const masterId = (v as any).master_variant_id || null;
              const ingId = (v as any).ingredient_id ? Number((v as any).ingredient_id) : null;
              const usage = Number((v as any).jumlah_terpakai || 0);
              const ingList = (v as any).ingredients_list ? (typeof (v as any).ingredients_list === 'string' ? (v as any).ingredients_list : JSON.stringify((v as any).ingredients_list)) : null;
              const katVarian = (v as any).kategori_varian || null;

              if (v.id) {
                await db.runAsync(
                  `INSERT INTO menu_variants (id, menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [v.id, targetItemId, v.nama_varian, offPrice, offPrice, goPrice, shopeePrice, grabPrice, masterId, ingId, usage, ingList, katVarian]
                ).catch(async () => {
                  await db.runAsync(
                    `INSERT INTO menu_variants (menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [targetItemId, v.nama_varian, offPrice, offPrice, goPrice, shopeePrice, grabPrice, masterId, ingId, usage, ingList, katVarian]
                  ).catch(() => {});
                });
              } else {
                await db.runAsync(
                  `INSERT INTO menu_variants (menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [targetItemId, v.nama_varian, offPrice, offPrice, goPrice, shopeePrice, grabPrice, masterId, ingId, usage, ingList, katVarian]
                ).catch(() => {});
              }
            }
          }
        }

        // Sync master variants if provided by desktop
        const remoteMasterVariants: any[] = data.masterVariants || [];
        if (Array.isArray(remoteMasterVariants) && remoteMasterVariants.length > 0) {
          for (const mv of remoteMasterVariants) {
            const ingId = mv.ingredient_id ? Number(mv.ingredient_id) : null;
            const usage = Number(mv.jumlah_terpakai || 0);
            const offPrice = Number(mv.harga_offline ?? mv.harga_tambahan ?? 0);
            const goPrice = mv.harga_gofood !== undefined ? Number(mv.harga_gofood) : offPrice;
            const shopeePrice = mv.harga_shopeefood !== undefined ? Number(mv.harga_shopeefood) : offPrice;
            const grabPrice = mv.harga_grabfood !== undefined ? Number(mv.harga_grabfood) : offPrice;
            const ingList = mv.ingredients_list ? (typeof mv.ingredients_list === 'string' ? mv.ingredients_list : JSON.stringify(mv.ingredients_list)) : null;
            const katVarian = mv.kategori_varian || null;

            const existingMv = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM master_variants WHERE id = ? OR LOWER(TRIM(nama_varian)) = LOWER(TRIM(?));',
              [mv.id, mv.nama_varian]
            );
            if (existingMv) {
              await db.runAsync(
                'UPDATE master_variants SET nama_varian = ?, harga_tambahan = ?, harga_offline = ?, harga_gofood = ?, harga_shopeefood = ?, harga_grabfood = ?, kategori_varian = ?, ingredient_id = ?, jumlah_terpakai = ?, ingredients_list = ? WHERE id = ?;',
                [mv.nama_varian.trim(), offPrice, offPrice, goPrice, shopeePrice, grabPrice, katVarian, ingId, usage, ingList, existingMv.id]
              ).catch(() => {});
            } else {
              await db.runAsync(
                'INSERT INTO master_variants (id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, kategori_varian, ingredient_id, jumlah_terpakai, ingredients_list) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
                [mv.id, mv.nama_varian.trim(), offPrice, offPrice, goPrice, shopeePrice, grabPrice, katVarian, ingId, usage, ingList]
              ).catch(async () => {
                await db.runAsync(
                  'INSERT INTO master_variants (nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, kategori_varian, ingredient_id, jumlah_terpakai, ingredients_list) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
                  [mv.nama_varian.trim(), offPrice, offPrice, goPrice, shopeePrice, grabPrice, katVarian, ingId, usage, ingList]
                ).catch(() => {});
              });
            }
          }
        }

        // Permanently remove local items that were already synced to Desktop (is_synced = 1)
        // but no longer exist in Desktop catalog. Do NOT delete items newly created locally.
        const allLocalItems = await db.getAllAsync<{ id: number; nama: string; is_synced: number }>(
          'SELECT id, nama, COALESCE(is_synced, 1) as is_synced FROM menu_items;'
        );
        for (const localIt of allLocalItems) {
          if (localIt.is_synced === 1 && !receivedItemNames.has(localIt.nama.toLowerCase().trim())) {
            // Preserve name in transaction_items if ordered in the past
            await db.runAsync(
              'UPDATE transaction_items SET menu_name = ? WHERE menu_item_id = ? AND (menu_name IS NULL OR menu_name = "");',
              [localIt.nama, localIt.id]
            ).catch(() => {});

            // Check if item has been ordered in past transactions to avoid breaking foreign key constraints
            const pastOrders = await db.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM transaction_items WHERE menu_item_id = ?;',
              [localIt.id]
            );

            if (pastOrders && pastOrders.count > 0) {
              // Archive item instead of deleting so past sales history remains valid without FK errors
              await db.runAsync('UPDATE menu_items SET status_tersedia = 0 WHERE id = ?;', [localIt.id]).catch(() => {});
              console.log(`[Sync] Archived local menu item (referenced by past orders): ${localIt.nama}`);
            } else {
              await db.runAsync('DELETE FROM recipes WHERE menu_item_id = ?;', [localIt.id]).catch(() => {});
              await db.runAsync('DELETE FROM menu_variants WHERE menu_item_id = ?;', [localIt.id]).catch(() => {});
              await db.runAsync('DELETE FROM menu_items WHERE id = ?;', [localIt.id]).catch(() => {});
              console.log(`[Sync] Removed local menu item deleted on Desktop: ${localIt.nama}`);
            }
          }
        }

        // Clean up empty local categories not in Desktop
        const receivedCatNames = new Set(categories.map((c) => c.nama.toLowerCase().trim()));
        const allLocalCats = await db.getAllAsync<{ id: number; nama: string }>(
          'SELECT id, nama FROM menu_categories;'
        );
        for (const localCat of allLocalCats) {
          if (!receivedCatNames.has(localCat.nama.toLowerCase().trim()) && localCat.id !== fallbackCatId) {
            const countInCat = await db.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?;',
              [localCat.id]
            );
            if (!countInCat || countInCat.count === 0) {
              await db.runAsync('DELETE FROM menu_categories WHERE id = ?;', [localCat.id]).catch(() => {});
            }
          }
        }

        // Sync recipes from Desktop to local recipes table (cleanly map IDs and purge deleted recipes)
        if (Array.isArray(recipes)) {
          await db.runAsync('DELETE FROM recipes;').catch(() => {});
          const allLocalIngs = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM ingredients;');
          const ingByName = new Map<string, number>();
          const validIngIds = new Set<number>();
          allLocalIngs.forEach((i) => {
            ingByName.set((i.nama || '').toLowerCase().trim(), i.id);
            validIngIds.add(i.id);
          });

          const allLocalMenuItems = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM menu_items;');
          const itemByName = new Map<string, number>();
          const validMenuItemIds = new Set<number>();
          allLocalMenuItems.forEach((m) => {
            itemByName.set((m.nama || '').toLowerCase().trim(), m.id);
            validMenuItemIds.add(m.id);
          });

          for (const r of recipes) {
            const targetMenuItemId = itemMap.get(r.menu_item_id)
              || (r.menu_item_nama ? itemByName.get((r.menu_item_nama || '').toLowerCase().trim()) : undefined)
              || r.menu_item_id;

            const targetIngId = (r.ingredient_nama ? ingByName.get((r.ingredient_nama || '').toLowerCase().trim()) : undefined)
              || (r.ingredient_id ? allLocalIngs.find((i) => i.id === r.ingredient_id)?.id : undefined)
              || r.ingredient_id;

            if (targetMenuItemId && targetIngId && validMenuItemIds.has(targetMenuItemId) && validIngIds.has(targetIngId)) {
              await db.runAsync(
                'INSERT INTO recipes (menu_item_id, ingredient_id, jumlah_terpakai) VALUES (?, ?, ?);',
                [targetMenuItemId, targetIngId, Number(r.jumlah_terpakai || 1)]
              ).catch(() => {});
            }
          }
        }

        // Sync app_settings (commissions & initial balances from Desktop)
        if (data.commissionShopee !== undefined || data.saldoAwalLaci !== undefined) {
          const existingSettings = await db.getFirstAsync<{ id: number }>('SELECT id FROM app_settings WHERE id = 1;');
          if (existingSettings) {
            await db.runAsync(
              `UPDATE app_settings SET
                commission_shopee = COALESCE(?, commission_shopee),
                commission_grab = COALESCE(?, commission_grab),
                commission_gofood = COALESCE(?, commission_gofood),
                fee_gofood = COALESCE(?, fee_gofood),
                saldo_awal_laci = COALESCE(?, saldo_awal_laci),
                saldo_awal_manager = COALESCE(?, saldo_awal_manager),
                saldo_awal_rekening = COALESCE(?, saldo_awal_rekening)
               WHERE id = 1;`,
              [
                data.commissionShopee ?? null,
                data.commissionGrab ?? null,
                data.commissionGofood ?? null,
                data.feeGofood ?? null,
                data.saldoAwalLaci ?? null,
                data.saldoAwalManager ?? null,
                data.saldoAwalRekening ?? null,
              ]
            );
          }
        }
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;').catch(() => {});
      }
    });

      const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      useSyncStore.getState().setLastSyncTime(now);
      useSyncStore.getState().setIsConnected(true);

      return { success: true, itemCount: menuItems.length };
    } catch (err: any) {
      console.warn('[Sync] Failed to sync menu:', err);
      return { success: false, error: err?.message || 'Gagal menyinkronkan menu dari Desktop.' };
    }
  },

  // 4. Pull stock ingredients from Desktop
  async syncStockFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/stock`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ingredients = data.ingredients || [];

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        for (const ing of ingredients) {
          // 1. Safe matching: Match by ID first, then case-insensitive trim of name
          let existing = ing.id
            ? await db.getFirstAsync<{ id: number; nama: string; stok_saat_ini: number }>(
                'SELECT id, nama, stok_saat_ini FROM ingredients WHERE id = ?;',
                [ing.id]
              )
            : null;

          if (!existing && ing.nama) {
            existing = await db.getFirstAsync<{ id: number; nama: string; stok_saat_ini: number }>(
              'SELECT id, nama, stok_saat_ini FROM ingredients WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?));',
              [ing.nama.trim()]
            );
          }

          const incomingStock = Number(ing.stok_saat_ini ?? 0);
          const effectiveStock = incomingStock;

          if (existing) {
            await db.runAsync(
              `UPDATE ingredients SET
                 nama = ?,
                 satuan = ?,
                 stok_saat_ini = ?,
                 stok_minimum = ?,
                 harga_beli_satuan = CASE WHEN ? IS NOT NULL THEN ? ELSE harga_beli_satuan END,
                 urutan = CASE WHEN ? IS NOT NULL THEN ? ELSE urutan END
               WHERE id = ?;`,
              [
                ing.nama ? ing.nama.trim() : existing.nama,
                ing.satuan || 'pcs',
                effectiveStock,
                Number(ing.stok_minimum ?? 0),
                ing.harga_beli_satuan !== undefined ? Number(ing.harga_beli_satuan) : null,
                ing.harga_beli_satuan !== undefined ? Number(ing.harga_beli_satuan) : 0,
                ing.urutan !== undefined ? Number(ing.urutan) : null,
                ing.urutan !== undefined ? Number(ing.urutan) : 0,
                existing.id,
              ]
            );
          } else {
            // Preserve ing.id so Mobile and Desktop have 100% matching IDs for recipes
            if (ing.id) {
              await db.runAsync(
                `INSERT INTO ingredients (id, nama, satuan, stok_saat_ini, stok_minimum, harga_beli_satuan, urutan)
                 VALUES (?, ?, ?, ?, ?, ?, ?);`,
                [
                  ing.id,
                  ing.nama.trim(),
                  ing.satuan || 'pcs',
                  effectiveStock,
                  Number(ing.stok_minimum ?? 0),
                  Number(ing.harga_beli_satuan ?? 0),
                  Number(ing.urutan ?? 0),
                ]
              );
            } else {
              await db.runAsync(
                `INSERT INTO ingredients (nama, satuan, stok_saat_ini, stok_minimum, harga_beli_satuan, urutan)
                 VALUES (?, ?, ?, ?, ?, ?);`,
                [
                  ing.nama.trim(),
                  ing.satuan || 'pcs',
                  effectiveStock,
                  Number(ing.stok_minimum ?? 0),
                  Number(ing.harga_beli_satuan ?? 0),
                  Number(ing.urutan ?? 0),
                ]
              );
            }
          }
        }

        // Clean up ingredients deleted on Desktop
        if (ingredients && ingredients.length > 0) {
          const receivedIds = new Set(ingredients.map((i: any) => i.id).filter(Boolean));
          const receivedNames = new Set(ingredients.map((i: any) => (i.nama || '').toLowerCase().trim()));
          const localIngs = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM ingredients;');
          for (const li of localIngs) {
            if (!receivedIds.has(li.id) && !receivedNames.has((li.nama || '').toLowerCase().trim())) {
              await db.runAsync('DELETE FROM recipes WHERE ingredient_id = ?;', [li.id]).catch(() => {});
              await db.runAsync('DELETE FROM ingredients WHERE id = ?;', [li.id]);
              console.log(`[Sync] Removed local ingredient deleted on Desktop: ${li.nama}`);
            }
          }
        }
        return { success: true, count: ingredients.length };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync stock:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi stok.' };
    }
  },

  // 5. Pull expenses from Desktop
  async syncExpensesFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/expenses`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const expenses = data.expenses || [];

      return await runWithDbLock(async () => {
        const db = await getDatabase();

        // Merge expense categories if provided by Desktop
        const desktopCats = data.expense_categories || data.categories;
        if (desktopCats && Array.isArray(desktopCats)) {
          try {
            const row = await db.getFirstAsync<{ value: string }>(
              "SELECT value FROM app_settings WHERE key = 'expense_categories';"
            );
            let currentCats: string[] = [];
            if (row?.value) {
              try { currentCats = JSON.parse(row.value); } catch {}
            }
            if (!currentCats.length) {
              currentCats = ['Kasbon Karyawan', 'Lembur', 'Belanja Bahan Baku', 'Operasional Lain', 'Listrik & Gas', 'Sewa & Kebersihan'];
            }
            let changed = false;
            for (const c of desktopCats) {
              const trimmed = typeof c === 'string' ? c.trim() : '';
              if (trimmed && !currentCats.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
                currentCats.push(trimmed);
                changed = true;
              }
            }
            if (changed) {
              await db.runAsync(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
                [JSON.stringify(currentCats)]
              );
            }
          } catch (catErr) {
            console.warn('[Sync] Failed merging expense categories:', catErr);
          }
        }

        // Ensure a fallback user exists
        const defaultUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
        const fallbackUserId = defaultUser ? defaultUser.id : 1;

        const deletedExpenses = await db.getAllAsync<{ id: number }>('SELECT id FROM deleted_expenses;');
        const deletedExpIds = new Set(deletedExpenses.map((d) => d.id));

        for (const exp of expenses) {
          if (exp.id && deletedExpIds.has(Number(exp.id))) {
            continue; // Skip resurrecting deleted expense
          }
          const strDesktopId = exp.id ? String(exp.id) : null;
          let existing: { id: number } | null = null;
          if (strDesktopId) {
            existing = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM expenses WHERE desktop_expense_id = ?;',
              [strDesktopId]
            );
          }
          if (!existing) {
            existing = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM expenses WHERE (tanggal = ? OR date(tanggal) = date(?)) AND jumlah = ? AND kategori = ?;',
              [exp.tanggal, exp.tanggal, Number(exp.jumlah), exp.kategori]
            );
          }

          if (existing) {
            if (strDesktopId) {
              await db.runAsync(
                'UPDATE expenses SET desktop_expense_id = COALESCE(desktop_expense_id, ?) WHERE id = ?;',
                [strDesktopId, existing.id]
              );
            }
            continue;
          }

          let validUserId = fallbackUserId;
          if (exp.input_by) {
            const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [exp.input_by]);
            if (u) validUserId = u.id;
          }

          const expDate = normalizeDateToLocal(exp.tanggal);
          await db.runAsync(
            `INSERT INTO expenses (tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, shift_id, is_synced, desktop_expense_id)
             VALUES (?, ?, ?, ?, ?, ?, null, 1, ?);`,
            [
              expDate,
              exp.kategori || 'Operasional Lain',
              Number(exp.jumlah || 0),
              exp.keterangan || '',
              validUserId,
              exp.sumber_dana || 'laci_kasir',
              strDesktopId,
            ]
          );
        }

        return { success: true, count: expenses.length };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync expenses:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi pengeluaran.' };
    }
  },

  // 5b. Pull wallet transfers from Desktop
  async syncTransfersFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/transfers`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const transfers = data.transfers || [];

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        const now = new Date().toISOString();
        for (const trf of transfers) {
          const strId = trf.id ? String(trf.id) : null;
          if (!strId) continue;
          const numJumlah = Number(trf.jumlah || trf.nominal || 0);
          const trfDate = normalizeDateToLocal(trf.tanggal);
          const existing = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM wallet_transfers 
             WHERE id = ? 
                OR (from_wallet = ? AND to_wallet = ? AND jumlah = ? AND SUBSTR(tanggal, 1, 16) = SUBSTR(?, 1, 16));`,
            [strId, trf.from_wallet, trf.to_wallet, numJumlah, trfDate]
          );
          if (!existing) {
            await db.runAsync(
              `INSERT INTO wallet_transfers (id, tanggal, from_wallet, to_wallet, jumlah, keterangan, actor_id, actor_nama, created_at, is_synced)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
              [
                strId,
                trfDate,
                trf.from_wallet,
                trf.to_wallet,
                Number(trf.jumlah || trf.nominal || 0),
                trf.keterangan || trf.catatan || 'Transfer antar dompet',
                trf.actor_id || 1,
                trf.actor_nama || 'Kasir',
                trf.created_at || now,
              ]
            );
          }
        }

        // Clean up local synced transfers that no longer exist on Desktop
        const desktopIds = new Set(transfers.map((t: any) => String(t.id)));
        const localTransfers = await db.getAllAsync<{ id: string; is_synced: number }>('SELECT id, is_synced FROM wallet_transfers;');
        for (const lt of localTransfers) {
          if (lt.is_synced === 1 && !desktopIds.has(String(lt.id))) {
            await db.runAsync('DELETE FROM wallet_transfers WHERE id = ?;', [lt.id]);
          }
        }

        return { success: true, count: transfers.length };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync transfers:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi transfer kas.' };
    }
  },

  // 5c. Pull balance adjustments from Desktop
  async syncAdjustmentsFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/adjustments`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const adjustments = data.adjustments || [];

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        const now = new Date().toISOString();
        for (const adj of adjustments) {
          const strId = adj.id ? String(adj.id) : null;
          if (!strId) continue;
          const existing = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM balance_adjustments WHERE id = ?;',
            [strId]
          );
          if (!existing) {
            const adjDate = normalizeDateToLocal(adj.tanggal);
            const nominalSebelum = Number(adj.saldo_sebelum ?? adj.nominal_sebelum ?? 0);
            const nominalSesudah = Number(adj.saldo_sesudah ?? adj.nominal_sesudah ?? 0);
            const selisih = Number(adj.selisih ?? (nominalSesudah - nominalSebelum));
            await db.runAsync(
              `INSERT INTO balance_adjustments (id, tanggal, dompet, saldo_sebelum, saldo_sesudah, selisih, alasan, actor_id, actor_nama, created_at, is_synced)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
              [
                strId,
                adjDate,
                adj.dompet,
                nominalSebelum,
                nominalSesudah,
                selisih,
                adj.alasan || 'Penyesuaian saldo riil',
                adj.actor_id || 1,
                adj.actor_nama || 'Owner',
                adj.created_at || now,
              ]
            );
          }
        }
        return { success: true, count: adjustments.length };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync adjustments:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi koreksi saldo.' };
    }
  },

  // Instant Payload-First Applicators (Runs in < 10ms without full HTTP GET fetch)
  async applyIncomingExpense(exp: any) {
    if (!exp) return;
    await runWithDbLock(async () => {
      const db = await getDatabase();
      const strDesktopId = exp.id ? String(exp.id) : null;
      let existing: { id: number } | null = null;
      if (strDesktopId) {
        existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM expenses WHERE desktop_expense_id = ?;',
          [strDesktopId]
        );
      }
      if (!existing) {
        existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM expenses WHERE (tanggal = ? OR date(tanggal) = date(?)) AND jumlah = ? AND kategori = ?;',
          [exp.tanggal, exp.tanggal, Number(exp.jumlah), exp.kategori]
        );
      }
      if (existing) {
        if (strDesktopId) {
          await db.runAsync(
            'UPDATE expenses SET desktop_expense_id = COALESCE(desktop_expense_id, ?) WHERE id = ?;',
            [strDesktopId, existing.id]
          );
        }
        return;
      }
      const defaultUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
      let validUserId = defaultUser ? defaultUser.id : 1;
      if (exp.input_by) {
        const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [exp.input_by]);
        if (u) validUserId = u.id;
      }
      const expDate = normalizeDateToLocal(exp.tanggal);
      await db.runAsync(
        `INSERT INTO expenses (tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, shift_id, is_synced, desktop_expense_id)
         VALUES (?, ?, ?, ?, ?, ?, null, 1, ?);`,
        [
          expDate,
          exp.kategori || 'Operasional Lain',
          Number(exp.jumlah || 0),
          exp.keterangan || '',
          validUserId,
          exp.sumber_dana || 'laci_kasir',
          strDesktopId,
        ]
      );
    });
  },

  async applyIncomingTransfer(trf: any) {
    if (!trf) return;
    const strId = trf.id ? String(trf.id) : null;
    if (!strId) return;
    await runWithDbLock(async () => {
      const db = await getDatabase();
      const trfDate = normalizeDateToLocal(trf.tanggal);
      const numJumlah = Number(trf.jumlah || trf.nominal || 0);
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM wallet_transfers 
         WHERE id = ? 
            OR (from_wallet = ? AND to_wallet = ? AND jumlah = ? AND SUBSTR(tanggal, 1, 16) = SUBSTR(?, 1, 16));`,
        [strId, trf.from_wallet, trf.to_wallet, numJumlah, trfDate]
      );
      if (!existing) {
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO wallet_transfers (id, tanggal, from_wallet, to_wallet, jumlah, keterangan, actor_id, actor_nama, created_at, is_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
          [
            strId,
            trfDate,
            trf.from_wallet,
            trf.to_wallet,
            Number(trf.jumlah || trf.nominal || 0),
            trf.keterangan || trf.catatan || 'Transfer antar dompet',
            trf.actor_id || 1,
            trf.actor_nama || 'Kasir',
            trf.created_at || now,
          ]
        );
      }
    });
  },

  async applyIncomingAdjustment(adj: any) {
    if (!adj) return;
    const strId = adj.id ? String(adj.id) : null;
    if (!strId) return;
    await runWithDbLock(async () => {
      const db = await getDatabase();
      const adjDate = normalizeDateToLocal(adj.tanggal);
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM balance_adjustments 
         WHERE id = ? 
            OR (dompet = ? AND SUBSTR(tanggal, 1, 16) = SUBSTR(?, 1, 16));`,
        [strId, adj.dompet, adjDate]
      );
      if (!existing) {
        const nominalSebelum = Number(adj.saldo_sebelum ?? adj.nominal_sebelum ?? 0);
        const nominalSesudah = Number(adj.saldo_sesudah ?? adj.nominal_sesudah ?? 0);
        const selisih = Number(adj.selisih ?? (nominalSesudah - nominalSebelum));
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO balance_adjustments (id, tanggal, dompet, saldo_sebelum, saldo_sesudah, selisih, alasan, actor_id, actor_nama, created_at, is_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
          [
            strId,
            adjDate,
            adj.dompet,
            nominalSebelum,
            nominalSesudah,
            selisih,
            adj.alasan || 'Penyesuaian saldo riil',
            adj.actor_id || 1,
            adj.actor_nama || 'Owner',
            adj.created_at || now,
          ]
        );
      }
    });
  },

  // 6. Pull users / employees from Desktop
  async syncUsersFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/users`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const users: User[] = data.users || [];

      if (users.length === 0) {
        return { success: true, count: 0 };
      }

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        let updatedCount = 0;

        // Check tombstone so deleted users on mobile are never resurrected
        const deletedUsers = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM deleted_users;');
        const deletedUserIds = new Set(deletedUsers.map((d) => d.id));
        const deletedUserNames = new Set(deletedUsers.map((d) => (d.nama || '').toLowerCase().trim()));

        for (const u of users) {
          if (!u.nama || !u.pin_hash) continue;
          if (deletedUserIds.has(u.id) || deletedUserNames.has(u.nama.toLowerCase().trim())) {
            continue; // Skip resurrecting deleted user!
          }

          // Check if user exists by exact name, ID, or pin_hash to avoid UNIQUE constraint collision
          const existing = await db.getFirstAsync<{ id: number; nama: string }>(
            'SELECT id, nama FROM users WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) OR id = ? OR pin_hash = ?;',
            [u.nama, u.id, u.pin_hash]
          );

          if (existing) {
            await db.runAsync(
              `UPDATE users SET
                 nama = ?,
                 pin_hash = ?,
                 role = ?,
                 status_aktif = ?
               WHERE id = ?;`,
              [
                u.nama,
                u.pin_hash,
                u.role || 'kasir',
                u.status_aktif !== undefined ? Number(u.status_aktif) : 1,
                existing.id,
              ]
            );
            updatedCount++;
          } else {
            await db.runAsync(
              `INSERT INTO users (nama, pin_hash, role, status_aktif, created_at)
               VALUES (?, ?, ?, ?, ?);`,
              [
                u.nama,
                u.pin_hash,
                u.role || 'kasir',
                u.status_aktif !== undefined ? Number(u.status_aktif) : 1,
                u.created_at || new Date().toISOString(),
              ]
            );
            updatedCount++;
          }
        }

        // Clean up local cashiers that were removed on Desktop (preserve transactions & shifts)
        try {
          const desktopNames = new Set(users.map(u => u.nama.toLowerCase().trim()));
          const desktopIds = new Set(users.map(u => u.id));
          const localCashiers = await db.getAllAsync<{ id: number; nama: string }>(
            "SELECT id, nama FROM users WHERE role = 'kasir';"
          );
          for (const lc of localCashiers) {
            if (!desktopNames.has(lc.nama.toLowerCase().trim()) && !desktopIds.has(lc.id)) {
              await db.runAsync(
                `UPDATE transactions SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ?;`,
                [lc.id, lc.id]
              );
              await db.runAsync(
                `UPDATE shifts SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ? AND status = 'closed';`,
                [lc.id, lc.id]
              );
              await db.runAsync('DELETE FROM activity_logs WHERE user_id = ?;', [lc.id]);
              await db.runAsync(
                `UPDATE expenses SET input_by = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE input_by = ?;`,
                [lc.id, lc.id]
              );
              await db.runAsync('DELETE FROM users WHERE id = ?;', [lc.id]);
              console.log('[Sync] Removed deleted cashier from local DB:', lc.nama);
            }
          }
        } catch (cleanupErr) {
          console.warn('[Sync] Cleanup removed cashiers warning:', cleanupErr);
        }

        notifySyncListeners('users');
        console.log(`[Sync] Successfully synced ${updatedCount} employees from Desktop`);
        return { success: true, count: updatedCount };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync users/employees:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi karyawan.' };
    }
  },

  // 7. Push created expense to Desktop POS
  async pushExpenseToDesktop(expensePayload: {
    id?: number;
    kategori: string;
    jumlah: number;
    keterangan: string;
    input_by: number;
    input_by_name?: string;
    sumber_dana?: string;
    tanggal?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Tidak terhubung ke Desktop' };
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/expense`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...expensePayload,
          source: 'Android Kasir',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      return { success: response.ok };
    } catch (err: any) {
      console.warn('[Sync] Failed to push expense to desktop:', err);
      return { success: false, error: err?.message };
    }
  },

  async pushTransferToDesktop(transferPayload: {
    id: string;
    tanggal?: string;
    from_wallet: string;
    to_wallet: string;
    jumlah: number;
    catatan?: string;
    actor_id?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Tidak terhubung ke Desktop' };
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/transfers`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...transferPayload,
          source: 'Android Kasir',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      return { success: response.ok };
    } catch (err: any) {
      console.warn('[Sync] Failed to push transfer to desktop:', err);
      return { success: false, error: err?.message };
    }
  },

  async pushAdjustmentToDesktop(adjPayload: {
    id: string;
    tanggal?: string;
    dompet: string;
    nominal_sebelum: number;
    nominal_sesudah: number;
    selisih: number;
    alasan?: string;
    actor_id?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Tidak terhubung ke Desktop' };
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/adjustments`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...adjPayload,
          source: 'Android Kasir',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      return { success: response.ok };
    } catch (err: any) {
      console.warn('[Sync] Failed to push adjustment to desktop:', err);
      return { success: false, error: err?.message };
    }
  },

  // 7. Send completed order to Desktop POS
  async pushOrderToDesktop(orderPayload: {
    id?: number;
    uuid?: string;
    localTransactionId?: number;
    tanggal?: string;
    channel: string;
    metode_bayar: string;
    subtotal?: number;
    tax_percentage?: number;
    tax_amount?: number;
    cashPaid?: number;
    uang_diterima?: number;
    kembalian?: number;
    total: number;
    kasir_nama?: string;
    catatan?: string;
    cartItems: any[];
    sumber_dana?: WalletType | 'laci_kasir_mobile';
    online_voucher_discount?: number;
    online_commission_amount?: number;
    online_net_amount?: number;
  }): Promise<{ success: boolean; orderId?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Tidak terhubung ke Desktop' };
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/order`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...orderPayload,
          source: 'HP Kasir',
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (orderPayload.localTransactionId) {
        const deskId = result.orderId ? String(result.orderId) : undefined;
        await transactionService.markAsSynced(orderPayload.localTransactionId, deskId);
      }
      return { success: true, orderId: result.orderId };
    } catch (err: any) {
      console.warn('[Sync] Failed to push order to desktop:', err);
      return { success: false, error: err?.message || 'Gagal mengirim order ke Desktop' };
    }
  },

  // 8. Auto-push all offline / pending transactions to Desktop
  async syncPendingOrders(): Promise<{ success: boolean; syncedCount: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, syncedCount: 0, error: 'Tidak terhubung ke Desktop' };
    }

    try {
      const pendingList = await transactionService.getUnsyncedTransactions();
      if (pendingList.length === 0) {
        return { success: true, syncedCount: 0 };
      }

      let syncedCount = 0;
      for (const trx of pendingList) {
        if (trx.status === 'void') {
          const voidOk = await this.pushVoidOrderToDesktop({
            orderId: trx.id,
            uuid: trx.uuid,
            localTransactionId: trx.id,
            desktopOrderId: trx.desktop_order_id,
            alasan: trx.alasan_void || 'Void dari HP Kasir',
            actorName: trx.kasir_name || 'Kasir',
          });
          if (voidOk) {
            await transactionService.markAsSynced(trx.id);
            syncedCount++;
          }
        } else {
          const payload = {
            id: trx.id,
            uuid: trx.uuid,
            localTransactionId: trx.id,
            tanggal: trx.tanggal,
            channel: trx.channel,
            metode_bayar: trx.metode_bayar,
            subtotal: trx.subtotal,
            tax_percentage: trx.tax_percentage,
            tax_amount: trx.tax_amount,
            cashPaid: trx.uang_diterima,
            uang_diterima: trx.uang_diterima,
            kembalian: trx.kembalian,
            total: trx.total,
            kasir_nama: trx.kasir_name || 'Kasir',
            catatan: trx.catatan || `Order Offline (ID #${trx.id})`,
            sumber_dana: trx.sumber_dana,
            online_voucher_discount: trx.online_voucher_discount || 0,
            cartItems: (trx.items || []).map((ti) => ({
              menu_item_id: ti.menu_item_id,
              nama: ti.menu_name || 'Item',
              selectedVariants: ti.variant_ids
                ? String(ti.variant_ids).split(',').map((v) => {
                    const clean = v.trim().replace(/\s*\(\+\d+\)$/, '');
                    return { nama_varian: clean, harga_tambahan: 0 };
                  })
                : [],
              customNotes: ti.custom_notes || '',
              qty: ti.qty,
              unitPrice: ti.harga_satuan,
              subtotal: ti.subtotal,
            })),
          };

          const res = await this.pushOrderToDesktop(payload);
          if (res.success) {
            syncedCount++;
          }
        }
      }

      return { success: true, syncedCount };
    } catch (err: any) {
      console.warn('[Sync] Failed to sync pending orders:', err);
      return { success: false, syncedCount: 0, error: err?.message };
    }
  },

  // 8b. Auto-push all offline / pending expenses to Desktop
  async syncPendingExpenses(): Promise<{ success: boolean; syncedCount: number }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, syncedCount: 0 };
    }

    try {
      const db = await getDatabase();
      // Push pending offline deleted users to Desktop
      const pendingDeletedUsers = await db.getAllAsync<{ id: number; nama: string }>('SELECT id, nama FROM deleted_users;');
      for (const del of pendingDeletedUsers) {
        const ok = await this.pushDeleteUserToDesktop(del.id, del.nama);
        if (ok) {
          await db.runAsync('DELETE FROM deleted_users WHERE id = ?;', [del.id]).catch(() => {});
        }
      }

      // Push pending offline deleted expenses to Desktop
      const deletedExpenses = await db.getAllAsync<{ id: number }>('SELECT id FROM deleted_expenses;');
      for (const del of deletedExpenses) {
        const ok = await this.pushDeleteExpenseToDesktop(del.id);
        if (ok) {
          await db.runAsync('DELETE FROM deleted_expenses WHERE id = ?;', [del.id]).catch(() => {});
        }
      }

      const unsyncedExpenses = await db.getAllAsync<{
        id: number;
        tanggal: string;
        kategori: string;
        jumlah: number;
        keterangan: string;
        input_by: number;
        sumber_dana: string;
      }>('SELECT id, tanggal, kategori, jumlah, keterangan, input_by, sumber_dana FROM expenses WHERE is_synced = 0 OR is_synced IS NULL;');

      let count = 0;
      for (const exp of unsyncedExpenses) {
        const res = await this.pushExpenseToDesktop({
          id: exp.id,
          kategori: exp.kategori,
          jumlah: exp.jumlah,
          keterangan: exp.keterangan,
          input_by: exp.input_by,
          sumber_dana: exp.sumber_dana,
          tanggal: exp.tanggal,
        });
        if (res.success) {
          await db.runAsync('UPDATE expenses SET is_synced = 1 WHERE id = ?;', [exp.id]);
          count++;
        }
      }
      return { success: true, syncedCount: count };
    } catch (err) {
      console.warn('[Sync] Failed to sync pending expenses:', err);
      return { success: false, syncedCount: 0 };
    }
  },

  async syncPendingTransfers(): Promise<{ success: boolean; syncedCount: number }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, syncedCount: 0 };
    }

    try {
      const db = await getDatabase();
      const unsyncedTransfers = await db.getAllAsync<{
        id: string;
        tanggal: string;
        from_wallet: string;
        to_wallet: string;
        jumlah: number;
        catatan?: string;
        actor_id?: number;
      }>('SELECT id, tanggal, from_wallet, to_wallet, jumlah, keterangan as catatan, actor_id FROM wallet_transfers WHERE is_synced = 0 OR is_synced IS NULL;');

      let count = 0;
      for (const trf of unsyncedTransfers) {
        const res = await this.pushTransferToDesktop({
          id: trf.id,
          tanggal: trf.tanggal,
          from_wallet: trf.from_wallet,
          to_wallet: trf.to_wallet,
          jumlah: trf.jumlah,
          catatan: trf.catatan,
          actor_id: trf.actor_id,
        });
        if (res.success) {
          await db.runAsync('UPDATE wallet_transfers SET is_synced = 1 WHERE id = ?;', [trf.id]);
          count++;
        }
      }
      return { success: true, syncedCount: count };
    } catch (e) {
      console.warn('[Sync] Failed to push pending transfers:', e);
      return { success: false, syncedCount: 0 };
    }
  },

  async syncPendingAdjustments(): Promise<{ success: boolean; syncedCount: number }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, syncedCount: 0 };
    }

    try {
      const db = await getDatabase();
      const unsyncedAdjustments = await db.getAllAsync<{
        id: string;
        tanggal: string;
        dompet: string;
        nominal_sebelum: number;
        nominal_sesudah: number;
        selisih: number;
        alasan?: string;
        actor_id?: number;
      }>('SELECT id, tanggal, dompet, saldo_sebelum as nominal_sebelum, saldo_sesudah as nominal_sesudah, selisih, alasan, actor_id FROM balance_adjustments WHERE is_synced = 0 OR is_synced IS NULL;');

      let count = 0;
      for (const adj of unsyncedAdjustments) {
        const res = await this.pushAdjustmentToDesktop({
          id: adj.id,
          tanggal: adj.tanggal,
          dompet: adj.dompet,
          nominal_sebelum: adj.nominal_sebelum,
          nominal_sesudah: adj.nominal_sesudah,
          selisih: adj.selisih,
          alasan: adj.alasan,
          actor_id: adj.actor_id,
        });
        if (res.success) {
          await db.runAsync('UPDATE balance_adjustments SET is_synced = 1 WHERE id = ?;', [adj.id]);
          count++;
        }
      }
      return { success: true, syncedCount: count };
    } catch (e) {
      console.warn('[Sync] Failed to push pending adjustments:', e);
      return { success: false, syncedCount: 0 };
    }
  },

  // 8c. Auto-push all offline / pending stock adjustments & purchases to Desktop
  async syncPendingStockMovements(): Promise<{ success: boolean; syncedCount: number }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, syncedCount: 0 };
    }

    try {
      const db = await getDatabase();
      const unsyncedMovements = await db.getAllAsync<{
        id: number;
        ingredient_id: number;
        tipe: string;
        jumlah: number;
        tanggal: string;
        keterangan: string;
        sumber: string;
      }>('SELECT * FROM stock_movements WHERE is_synced = 0 ORDER BY id ASC;');

      if (!unsyncedMovements || unsyncedMovements.length === 0) {
        return { success: true, syncedCount: 0 };
      }

      let count = 0;
      for (const mov of unsyncedMovements) {
        const ing = await db.getFirstAsync<{ id: number; nama: string; stok_saat_ini: number; satuan: string }>(
          'SELECT id, nama, stok_saat_ini, satuan FROM ingredients WHERE id = ?;',
          [mov.ingredient_id]
        );
        const ingName = ing ? ing.nama : `Bahan #${mov.ingredient_id}`;

        if (mov.tipe === 'adjustment' || mov.tipe === 'opname') {
          const ok = await this.pushStockAdjustmentToDesktop({
            ingredient_id: mov.ingredient_id,
            nama: ingName,
            target_stock: ing ? ing.stok_saat_ini : Math.max(0, mov.jumlah),
            tipe: mov.tipe,
            selisih: mov.jumlah,
            alasan: mov.keterangan || 'Penyesuaian stok offline',
            actor_name: 'HP Kasir',
          });
          if (ok) {
            await db.runAsync('UPDATE stock_movements SET is_synced = 1 WHERE id = ?;', [mov.id]);
            count++;
          }
        } else if (mov.tipe === 'masuk') {
          const ok = await this.pushStockPurchaseToDesktop({
            ingredient_id: mov.ingredient_id,
            nama: ingName,
            jumlah_masuk: mov.jumlah,
            total_biaya: 0,
            keterangan: mov.keterangan || 'Belanja stok offline',
            actor_name: 'HP Kasir',
          });
          if (ok) {
            await db.runAsync('UPDATE stock_movements SET is_synced = 1 WHERE id = ?;', [mov.id]);
            count++;
          }
        } else {
          await db.runAsync('UPDATE stock_movements SET is_synced = 1 WHERE id = ?;', [mov.id]);
        }
      }
      return { success: true, syncedCount: count };
    } catch (err) {
      console.warn('[Sync] Failed to sync pending stock movements:', err);
      return { success: false, syncedCount: 0 };
    }
  },

  // 9. Push new or updated menu item to Desktop
  async pushMenuItemToDesktop(item: any): Promise<boolean> {
    if (item?.nama) {
      try {
        const db = await getDatabase();
        await db.runAsync(
          'DELETE FROM deleted_menu_items WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?));',
          [item.nama.trim()]
        ).catch(() => {});
      } catch {}
    }

    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/menu-item`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      if (response.ok) {
        if (item.id) {
          await menuService.markMenuSynced(item.id).catch(() => {});
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // 10. Delete menu item on Desktop
  async deleteMenuItemOnDesktop(id: number, nama: string): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/menu-item/delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, nama }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      return response.ok;
    } catch {
      return false;
    }
  },

  // 10a-2. Push master variant to Desktop
  async pushMasterVariantToDesktop(variant: {
    id?: number;
    nama_varian: string;
    harga_tambahan: number;
    harga_offline?: number;
    harga_gofood?: number;
    harga_shopeefood?: number;
    harga_grabfood?: number;
    kategori_varian?: string;
    ingredient_id?: number | null;
    jumlah_terpakai?: number;
    ingredient_nama?: string;
    ingredient_satuan?: string;
    ingredients_list?: any[];
  }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    // Set flag agar echo-back WS event tidak men-trigger sync ulang (mencegah duplikat)
    _suppressNextMasterVariantSync = true;
    // Auto-reset setelah 5 detik kalau event tidak datang
    setTimeout(() => { _suppressNextMasterVariantSync = false; }, 5000);

    try {
      const response = await fetch(`${serverUrl}/api/sync/master-variant`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...variant,
          is_mobile_created: true,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      return response.ok;
    } catch (e) {
      console.warn('[Sync] Failed to push master variant to desktop:', e);
      return false;
    }
  },

  // 10a-3. Delete master variant on Desktop
  async deleteMasterVariantOnDesktop(id?: number, nama_varian?: string): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/master-variant/delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, nama_varian }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      return response.ok;
    } catch (e) {
      console.warn('[Sync] Failed to delete master variant on desktop:', e);
      return false;
    }
  },

  // 10b. Push user / employee to Desktop
  async pushUserToDesktop(user: { id?: number; nama: string; pin_hash?: string; role?: string; status_aktif?: number; created_at?: string }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/users`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          nama: user.nama,
          pin_hash: user.pin_hash,
          role: user.role,
          status_aktif: user.status_aktif !== undefined ? Number(user.status_aktif) : 1,
          created_at: user.created_at || new Date().toISOString(),
          source: 'mobile_user',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      return response.ok;
    } catch {
      return false;
    }
  },

  // 10b-2. Push user delete to Desktop
  async pushDeleteUserToDesktop(id?: number, nama?: string): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/users/delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, nama }),
        signal: AbortSignal.timeout(4000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return false;
      }

      return response.ok;
    } catch {
      return false;
    }
  },

  // 10b-3. Handle incoming USER_DELETED from Desktop
  async handleIncomingUserDelete(id?: number, nama?: string) {
    try {
      await runWithDbLock(async () => {
        const db = await getDatabase();
        const match = await db.getFirstAsync<User>(
          'SELECT * FROM users WHERE (id = ? AND ? > 0) OR (nama IS NOT NULL AND LOWER(TRIM(nama)) = LOWER(TRIM(?)));',
          [id ?? -1, id ?? -1, nama || '']
        );
        if (match) {
          if (match.role === 'owner') {
            const ownerCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'owner';");
            if (ownerCount && ownerCount.count <= 1) return;
          }

          await db.runAsync(
            'INSERT OR REPLACE INTO deleted_users (id, nama, deleted_at) VALUES (?, ?, ?);',
            [match.id, match.nama, new Date().toISOString()]
          );
          await db.runAsync(
            `UPDATE transactions SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ?;`,
            [match.id, match.id]
          );
          await db.runAsync(
            `UPDATE shifts SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ? AND status = 'closed';`,
            [match.id, match.id]
          );
          await db.runAsync('DELETE FROM activity_logs WHERE user_id = ?;', [match.id]);
          await db.runAsync(
            `UPDATE expenses SET input_by = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE input_by = ?;`,
            [match.id, match.id]
          );
          await db.runAsync('DELETE FROM users WHERE id = ?;', [match.id]);
          console.log('[Sync] Safely removed deleted user from local DB:', match.nama);
        }
      });
    } catch (err) {
      console.warn('[Sync] Failed to handle incoming user delete:', err);
    }
  },

  // 10c. Push activity log to Desktop
  async pushLogToDesktop(log: { user_id?: number; user_name?: string; aksi: string; detail?: string; timestamp?: string }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/logs`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          user_id: log.user_id || 1,
          user_nama: log.user_name || 'HP Kasir',
          aksi: log.aksi,
          detail: log.detail || '',
          timestamp: log.timestamp || new Date().toISOString(),
          source: 'mobile',
        }),
        signal: AbortSignal.timeout(4000),
      });

      return response.ok;
    } catch {
      return false;
    }
  },

  // 10d. Pull activity logs from Desktop
  async syncLogsFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl) return { success: false, error: 'Server tidak terhubung' };

    try {
      const response = await fetch(`${serverUrl}/api/sync/logs`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const logs = data.logs || [];

      if (logs.length === 0) return { success: true, count: 0 };

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        let inserted = 0;

        for (const l of logs) {
          if (!l.aksi) continue;
          const exists = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM activity_logs WHERE (aksi = ? AND timestamp = ? AND detail = ?);',
            [l.aksi, l.timestamp || '', l.detail || '']
          );
          if (!exists) {
            let validUserId = l.user_id || 1;
            const userCheck = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [validUserId]);
            if (!userCheck) {
              const fb = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
              validUserId = fb ? fb.id : 1;
            }
            await db.runAsync(
              'INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, ?, ?, ?);',
              [validUserId, l.aksi, l.detail || '', l.timestamp || new Date().toISOString()]
            );
            inserted++;
          }
        }
        return { success: true, count: inserted };
      });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync logs:', err);
      return { success: false, error: err?.message };
    }
  },

  // 11. Pull orders from Desktop and cache into local SQLite
  async syncOrdersFromDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Server tidak terhubung' };
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/orders`, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 403) {
        this.handleForcedDisconnect('Koneksi perangkat telah diputuskan oleh komputer kasir utama.');
        return { success: false, error: 'Koneksi diputuskan oleh Desktop' };
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const orders = data.orders || [];

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        await db.execAsync('PRAGMA foreign_keys = OFF;').catch(() => {});
        try {
          let importedCount = 0;

        for (const order of orders) {
          const desktopOrderId = order.id ? String(order.id) : undefined;
          const mobileOrderId = order.mobile_order_id || order.localTransactionId;
          const orderUuid = order.uuid || (order as any).trx_uuid;

          // Check if this order already exists locally by UUID, mobile numeric id, or desktopOrderId
          let existing: { id: number; status: string } | null = null;
          if (orderUuid) {
            existing = await db.getFirstAsync<{ id: number; status: string }>(
              'SELECT id, status FROM transactions WHERE uuid = ?;',
              [orderUuid]
            );
          }
          if (!existing) {
            const numMobId = Number(mobileOrderId);
            if (mobileOrderId && !isNaN(numMobId)) {
              existing = await db.getFirstAsync<{ id: number; status: string }>(
                'SELECT id, status FROM transactions WHERE id = ? OR desktop_order_id = ?;',
                [numMobId, String(numMobId)]
              );
            }
          }
          if (!existing && desktopOrderId) {
            existing = await db.getFirstAsync<{ id: number; status: string }>(
              'SELECT id, status FROM transactions WHERE desktop_order_id = ?;',
              [desktopOrderId]
            );
          }

          const isVoid = order.status === 'void' || order.status === 'voided' || order.status === 'dibatalkan';
          const targetStatus = isVoid ? 'void' : 'selesai';
          const orderSumberDana = order.sumber_dana || ((order.channel && order.channel !== 'offline') || order.metode_bayar === 'qris' ? 'rekening_owner' : 'laci_kasir');

          if (existing) {
            // Backfill desktop_order_id, uuid, and sumber_dana on local transaction if not set
            if (desktopOrderId || orderUuid) {
              await db.runAsync(
                'UPDATE transactions SET desktop_order_id = COALESCE(desktop_order_id, ?), uuid = COALESCE(uuid, ?), sumber_dana = COALESCE(sumber_dana, ?) WHERE id = ?;',
                [desktopOrderId, orderUuid || null, orderSumberDana, existing.id]
              );
            }
            // If already exists, update sync status and status if voided
            if (existing.status !== targetStatus) {
              await db.runAsync(
                'UPDATE transactions SET status = ?, alasan_void = ?, void_at = ?, is_synced = 1 WHERE id = ?;',
                [targetStatus, order.alasan_void || 'Dibatalkan', order.void_at || new Date().toISOString(), existing.id]
              );
            } else {
              await db.runAsync('UPDATE transactions SET is_synced = 1 WHERE id = ?;', [existing.id]);
            }
            continue;
          }

          // New transaction from Desktop Kasir or another device!
          // Normalize timestamp to local time YYYY-MM-DD HH:mm:ss to prevent SQLite date() filter timezone bug
          const timestamp = normalizeDateToLocal(order.receivedAt || order.tanggal);
          await db.withTransactionAsync(async () => {
            let validKasirId = 1;
            const anyUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
            if (!anyUser) {
              await db.runAsync(
                "INSERT OR IGNORE INTO users (id, nama, pin_hash, role, status_aktif, created_at) VALUES (1, 'Admin / Kasir', 'system', 'owner', 1, datetime('now'));"
              ).catch(() => {});
              validKasirId = 1;
            } else {
              validKasirId = anyUser.id;
              if (order.kasir_id) {
                const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [order.kasir_id]);
                if (u) validKasirId = u.id;
              }
            }

            let validShiftId: string | null = null;
            if (order.shift_id && typeof order.shift_id === 'string' && order.shift_id.trim() !== '') {
              const s = await db.getFirstAsync<{ id: string }>('SELECT id FROM shifts WHERE id = ?;', [order.shift_id.trim()]);
              if (s) validShiftId = s.id;
            }

            const insertRes = await db.runAsync(
              `INSERT INTO transactions (
                uuid, tanggal, channel, metode_bayar, subtotal, tax_percentage, tax_amount,
                online_voucher_discount, total, uang_diterima, kembalian, status, kasir_id, shift_id, catatan,
                is_synced, desktop_order_id, source, alasan_void, void_at, sumber_dana
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?);`,
              [
                orderUuid || null,
                timestamp,
                order.channel || 'offline',
                order.metode_bayar === 'cash' ? 'tunai' : (order.metode_bayar || 'tunai'),
                Number(order.subtotal || order.total || 0),
                Number(order.tax_percentage || 0),
                Number(order.tax_amount || 0),
                Number(order.online_voucher_discount || 0),
                Number(order.total || 0),
                Number(order.cashPaid || order.uang_diterima || order.total || 0),
                Number(order.kembalian || 0),
                targetStatus,
                validKasirId,
                validShiftId,
                order.catatan || (order.source ? `Order via ${order.source}` : ''),
                desktopOrderId || null,
                order.source || 'Desktop Kasir',
                isVoid ? (order.alasan_void || 'Dibatalkan') : null,
                isVoid ? (order.void_at || new Date().toISOString()) : null,
                orderSumberDana,
              ]
            );

            const localId = insertRes.lastInsertRowId;
            const items = order.items || order.cartItems || [];
            if (Array.isArray(items)) {
              let fallbackCat = await db.getFirstAsync<{ id: number }>('SELECT id FROM menu_categories LIMIT 1;');
              if (!fallbackCat) {
                const res = await db.runAsync("INSERT OR IGNORE INTO menu_categories (id, nama) VALUES (1, 'Menu Utama');").catch(() => null);
                fallbackCat = { id: (res as any)?.lastInsertRowId || 1 };
              }

              for (const item of items) {
                let validMenuItemId = Number(item.menu_item_id || item.menuItem?.id || item.id || 0);
                const menuName = item.nama || item.menu_name || item.menu_item_nama || item.menuItem?.nama || 'Item';

                const mExists = await db.getFirstAsync<{ id: number }>('SELECT id FROM menu_items WHERE id = ?;', [validMenuItemId]);
                if (!mExists) {
                  const mByName = await db.getFirstAsync<{ id: number }>('SELECT id FROM menu_items WHERE nama = ?;', [menuName]);
                  if (mByName) {
                    validMenuItemId = mByName.id;
                  } else {
                    try {
                      const ins = await db.runAsync(
                        'INSERT INTO menu_items (category_id, nama, harga_offline, status_tersedia, is_synced) VALUES (?, ?, ?, 1, 1);',
                        [fallbackCat.id, menuName, Number(item.unitPrice || item.harga_satuan || 0)]
                      );
                      validMenuItemId = ins.lastInsertRowId;
                    } catch {
                      const anyItem = await db.getFirstAsync<{ id: number }>('SELECT id FROM menu_items LIMIT 1;');
                      if (anyItem) {
                        validMenuItemId = anyItem.id;
                      } else {
                        const ins2 = await db.runAsync(
                          "INSERT INTO menu_items (category_id, nama, harga_offline, status_tersedia, is_synced) VALUES (?, 'Item Penjualan', 0, 1, 1);",
                          [fallbackCat.id]
                        ).catch(() => null);
                        validMenuItemId = (ins2 as any)?.lastInsertRowId || 1;
                      }
                    }
                  }
                }

                let variantSummary = '';
                if (Array.isArray(item.selectedVariants)) {
                  variantSummary = item.selectedVariants.map((v: any) => v.nama_varian || v.name || String(v)).join(', ');
                } else if (item.variant_names && typeof item.variant_names === 'string' && item.variant_names.trim() !== '') {
                  variantSummary = item.variant_names.trim();
                } else if (item.variant_ids && typeof item.variant_ids === 'string' && item.variant_ids.trim() !== '' && item.variant_ids.trim() !== '[]') {
                  try {
                    const parsed = JSON.parse(item.variant_ids);
                    if (Array.isArray(parsed)) {
                      variantSummary = '';
                    } else {
                      variantSummary = String(item.variant_ids);
                    }
                  } catch {
                    variantSummary = String(item.variant_ids);
                  }
                }

                const qty = Number(item.qty || 1);
                const unitPrice = Number(item.unitPrice || item.harga_satuan || 0);
                const subtotal = Number(item.subtotal || unitPrice * qty);
                const customNotes = item.customNotes || item.custom_notes || '';

                await db.runAsync(
                  `INSERT INTO transaction_items (transaction_id, menu_item_id, menu_name, variant_ids, custom_notes, qty, harga_satuan, subtotal)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                  [localId, validMenuItemId, menuName, variantSummary, customNotes, qty, unitPrice, subtotal]
                ).catch((insErr) => {
                  console.warn('[Sync] Failed to insert transaction item:', insErr);
                });
              }
            }
          });
          importedCount++;
        }

        return { success: true, count: importedCount };
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;').catch(() => {});
      }
    });
    } catch (err: any) {
      console.warn('[Sync] Failed to sync orders from desktop:', err);
      return { success: false, error: err?.message || 'Gagal sinkronisasi order.' };
    }
  },

  // 12. Handle incoming VOID event from Desktop
  async handleIncomingVoid(data: any) {
    try {
      await runWithDbLock(async () => {
        const db = await getDatabase();
        const deskId = data.desktopOrderId ? String(data.desktopOrderId) : null;
        const ordId = data.orderId ? String(data.orderId) : null;
        const locId = data.localTransactionId ? Number(data.localTransactionId) : null;

        await db.runAsync(
          `UPDATE transactions
           SET status = 'void', alasan_void = ?, void_at = ?, is_synced = 1
           WHERE (desktop_order_id IS NOT NULL AND desktop_order_id != '' AND (desktop_order_id = ? OR desktop_order_id = ?))
              OR (id = ? AND ? > 0);`,
          [
            data.alasan || 'Dibatalkan',
            data.timestamp || new Date().toISOString(),
            deskId || '',
            ordId || '',
            locId ?? -1,
            locId ?? -1,
          ]
        );
      });
      // Auto refresh stock because voiding order restores ingredients on desktop
      await this.syncStockFromDesktop().catch(() => {});
    } catch (err) {
      console.warn('[Sync] Failed to handle incoming void:', err);
    }
  },

  // 13. Handle incoming SALES RESET event from Desktop
  async handleIncomingSalesReset() {
    try {
      await runWithDbLock(async () => {
        const db = await getDatabase();
        await db.execAsync('PRAGMA foreign_keys = OFF;');
        await db.runAsync('DELETE FROM transaction_items;');
        await db.runAsync('DELETE FROM transactions;');
        await db.runAsync('DELETE FROM expenses;');
        await db.runAsync("DELETE FROM stock_movements WHERE tipe IN ('penjualan', 'void');");
        await db.execAsync('PRAGMA foreign_keys = ON;');
      });
      console.log('[Sync] Sales history reset received and applied locally.');
    } catch (err) {
      console.warn('[Sync] Failed to apply sales reset:', err);
    }
  },

  // 14. Handle incoming DATABASE RESET TO DEFAULT event from Desktop
  async handleIncomingDatabaseReset() {
    try {
      await runWithDbLock(async () => {
        const db = await getDatabase();
        await db.execAsync('PRAGMA foreign_keys = OFF;');
        await db.runAsync('DELETE FROM transaction_items;');
        await db.runAsync('DELETE FROM transactions;');
        await db.runAsync('DELETE FROM shifts;');
        await db.runAsync('DELETE FROM expenses;');
        await db.runAsync('DELETE FROM stock_movements;');
        await db.runAsync('DELETE FROM recipes;');
        await db.runAsync('DELETE FROM menu_variants;');
        await db.runAsync('DELETE FROM menu_items;');
        await db.runAsync('DELETE FROM wallet_transfers;');
        await db.runAsync('DELETE FROM balance_adjustments;');
        await db.runAsync(
          'UPDATE app_settings SET saldo_awal_laci = 0, saldo_awal_manager = 0, saldo_awal_rekening = 0 WHERE id = 1;'
        );
        await db.runAsync("DELETE FROM users WHERE role != 'owner';");
        await db.runAsync('UPDATE ingredients SET stok_saat_ini = 0;');
        await db.execAsync('PRAGMA foreign_keys = ON;');
      });

      // Resync fresh catalog & stock from Desktop
      await this.catchUpAllFromDesktop().catch(() => {});
      notifySyncListeners('wallets');
      console.log('[Sync] Database reset to default applied locally.');
    } catch (err) {
      console.warn('[Sync] Failed to apply database reset:', err);
    }
  },

  // 15. Push stock adjustment / opname to Desktop
  async pushStockAdjustmentToDesktop(payload: {
    ingredient_id?: number;
    nama: string;
    target_stock: number;
    tipe: string;
    selisih: number;
    alasan: string;
    actor_name?: string;
  }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/stock/adjust`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 16. Push stock purchase to Desktop
  async pushStockPurchaseToDesktop(payload: {
    ingredient_id?: number;
    nama: string;
    jumlah_masuk: number;
    total_biaya: number;
    harga_beli_satuan?: number;
    keterangan?: string;
    actor_id?: number;
    actor_name?: string;
  }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/stock/purchase`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...payload, source: 'HP Kasir' }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 17. Push all local ingredients stock to Desktop
  async pushAllStockToDesktop(): Promise<{ success: boolean; count?: number; error?: string }> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) {
      return { success: false, error: 'Server PC belum terhubung' };
    }

    try {
      const db = await getDatabase();
      const localIngs = await db.getAllAsync<any>('SELECT * FROM ingredients;');
      if (!localIngs || localIngs.length === 0) {
        return { success: false, error: 'Tidak ada data bahan baku di HP' };
      }

      let pushed = 0;
      for (const ing of localIngs) {
        if (Number(ing.stok_saat_ini) > 0) {
          await this.pushStockAdjustmentToDesktop({
            ingredient_id: ing.id,
            nama: ing.nama,
            target_stock: Number(ing.stok_saat_ini),
            tipe: 'opname',
            selisih: 0,
            alasan: 'Sinkronisasi menyeluruh stok dari HP Kasir',
          }).catch(() => {});
          pushed++;
        }
      }

      return { success: true, count: pushed };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Gagal mengirim stok ke PC' };
    }
  },

  // 17. Push master ingredient to Desktop
  async pushIngredientToDesktop(ingredient: {
    id?: number;
    nama: string;
    satuan?: string;
    stok_saat_ini?: number;
    stok_minimum?: number;
    harga_beli_satuan?: number;
    urutan?: number;
  }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/ingredient`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(ingredient),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 18. Push void order to Desktop
  async pushVoidOrderToDesktop(payload: {
    orderId?: number | string;
    uuid?: string;
    localTransactionId?: number;
    desktopOrderId?: string;
    alasan?: string;
    actorName?: string;
  }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/order/void`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...payload,
          uuid: payload.uuid,
          orderId: payload.orderId !== undefined ? String(payload.orderId) : undefined,
          desktopOrderId: payload.desktopOrderId ? String(payload.desktopOrderId) : undefined,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const localId = payload.localTransactionId || (payload.orderId && !isNaN(Number(payload.orderId)) ? Number(payload.orderId) : null);
        if (localId) {
          const deskId = payload.desktopOrderId ? String(payload.desktopOrderId) : undefined;
          await transactionService.markAsSynced(localId, deskId).catch(() => {});
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // 18b. Push recipes for a menu item to Desktop
  async pushRecipesToDesktop(menuItemId: number, recipes: { ingredient_id: number; jumlah_terpakai: number }[]): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/recipes`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ menu_item_id: menuItemId, recipes }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 19. Push new category to Desktop
  async pushCategoryToDesktop(category: { id?: number; nama: string }): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/category`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(category),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 20. Push delete expense to Desktop
  async pushDeleteExpenseToDesktop(id: number): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/expense/delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 20b. Push delete transfer to Desktop
  async pushDeleteTransferToDesktop(id: string): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/transfer/delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 21. Reset sales data on Desktop
  async resetSalesOnDesktop(): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/reset-sales`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // 22. Reset all to default on Desktop
  async resetAllToDefaultOnDesktop(): Promise<boolean> {
    const serverUrl = useSyncStore.getState().serverUrl;
    if (!serverUrl || !useSyncStore.getState().isConnected) return false;

    try {
      const response = await fetch(`${serverUrl}/api/sync/reset-to-default`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
