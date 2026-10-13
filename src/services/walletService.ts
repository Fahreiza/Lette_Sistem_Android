import { getDatabase, runWithDbLock } from '../database/db';
import { WalletType, WalletTransfer, BalanceAdjustmentLog } from '../types';
import { reportService } from './reportService';
import { shiftService } from './shiftService';
import { formatOnlyDate } from '../utils/formatters';
import { desktopSyncService } from './desktopSyncService';

export const walletService = {
  /**
   * Get all wallet transfers from local SQLite
   */
  async getWalletTransfers(limit = 100): Promise<WalletTransfer[]> {
    const db = await getDatabase();
    return await db.getAllAsync<WalletTransfer>(
      'SELECT * FROM wallet_transfers ORDER BY datetime(tanggal) DESC LIMIT ?;',
      [limit]
    );
  },

  /**
   * Get all balance adjustments from local SQLite
   */
  async getBalanceAdjustments(limit = 100): Promise<BalanceAdjustmentLog[]> {
    const db = await getDatabase();
    return await db.getAllAsync<BalanceAdjustmentLog>(
      'SELECT * FROM balance_adjustments ORDER BY datetime(tanggal) DESC LIMIT ?;',
      [limit]
    );
  },

  /**
   * Perform wallet transfer (TF) between funding sources
   */
  async transferWallet(params: {
    from_wallet: WalletType;
    to_wallet: WalletType;
    jumlah: number;
    keterangan?: string;
    actor_id: number;
    actor_nama?: string;
  }): Promise<{ success: boolean; transfer?: WalletTransfer; error?: string }> {
    if (params.from_wallet === params.to_wallet) {
      return { success: false, error: 'Dompet asal dan tujuan tidak boleh sama.' };
    }
    if (params.jumlah <= 0) {
      return { success: false, error: 'Jumlah transfer harus lebih dari 0.' };
    }

    // Validasi ketersediaan saldo di dompet asal
    const currentBalances = await reportService.getCurrentBalances();
    let sourceBalance = 0;
    if (params.from_wallet === 'laci_kasir') {
      sourceBalance = currentBalances.saldoLaciKasir || 0;
    } else if (params.from_wallet === 'saldo_manager') {
      sourceBalance = currentBalances.saldoManager || 0;
    } else {
      sourceBalance = currentBalances.saldoRekeningOwner || 0;
    }

    if (sourceBalance <= 0) {
      return { success: false, error: 'Saldo dompet asal Rp 0. Tidak dapat melakukan transfer.' };
    }
    if (params.jumlah > sourceBalance) {
      return { success: false, error: `Saldo tidak mencukupi (Tersedia: Rp ${sourceBalance.toLocaleString('id-ID')}, Diminta: Rp ${params.jumlah.toLocaleString('id-ID')}).` };
    }

    // Validasi otorisasi: hanya Owner/Admin yang berhak melakukan transfer kas
    const dbCheck = await getDatabase();
    const actor = await dbCheck.getFirstAsync<{ role: string }>('SELECT role FROM users WHERE id = ?;', [params.actor_id]);
    if (actor && actor.role !== 'owner') {
      return { success: false, error: 'Akses ditolak: Kasir tidak memiliki izin untuk melakukan transfer saldo.' };
    }

    const now = new Date();
    const dateStr = formatOnlyDate(now).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const id = `TRF-${dateStr}-${randomSuffix}`;
    const isoDate = now.toISOString();

    const transfer: WalletTransfer = {
      id,
      tanggal: isoDate,
      from_wallet: params.from_wallet,
      to_wallet: params.to_wallet,
      jumlah: params.jumlah,
      keterangan: params.keterangan || 'Transfer antar dompet kas toko',
      actor_id: params.actor_id,
      actor_nama: params.actor_nama || 'Kasir',
      created_at: isoDate,
      is_synced: 0,
    };

    return await runWithDbLock(async () => {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO wallet_transfers (id, tanggal, from_wallet, to_wallet, jumlah, keterangan, actor_id, actor_nama, created_at, is_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          transfer.id,
          transfer.tanggal,
          transfer.from_wallet,
          transfer.to_wallet,
          transfer.jumlah,
          transfer.keterangan || '',
          transfer.actor_id,
          transfer.actor_nama || '',
          transfer.created_at,
        ]
      );
      // Push to desktop immediately if connected
      desktopSyncService.pushTransferToDesktop({
        id: transfer.id,
        tanggal: transfer.tanggal,
        from_wallet: transfer.from_wallet,
        to_wallet: transfer.to_wallet,
        jumlah: transfer.jumlah,
        catatan: transfer.keterangan,
        actor_id: transfer.actor_id,
      }).then(async (res) => {
        if (res.success) {
          const dbInstance = await getDatabase();
          await dbInstance.runAsync('UPDATE wallet_transfers SET is_synced = 1 WHERE id = ?;', [transfer.id]).catch(() => {});
        }
      }).catch(() => {});

      return { success: true, transfer };
    });
  },

  /**
   * Hapus catatan mutasi transfer (Khusus Owner)
   */
  async deleteWalletTransfer(id: string, actorId: number): Promise<{ success: boolean; error?: string }> {
    const dbCheck = await getDatabase();
    const actor = await dbCheck.getFirstAsync<{ role: string }>('SELECT role FROM users WHERE id = ?;', [actorId]);
    if (actor && actor.role !== 'owner') {
      return { success: false, error: 'Akses ditolak: Hanya Owner yang dapat menghapus mutasi transfer.' };
    }

    return await runWithDbLock(async () => {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM wallet_transfers WHERE id = ?;', [id]);
      desktopSyncService.pushDeleteTransferToDesktop(id).catch(() => {});
      return { success: true };
    });
  },

  /**
   * Hapus catatan penyesuaian/koreksi saldo (Khusus Owner)
   */
  async deleteBalanceAdjustment(id: string, actorId: number): Promise<{ success: boolean; error?: string }> {
    const dbCheck = await getDatabase();
    const actor = await dbCheck.getFirstAsync<{ role: string }>('SELECT role FROM users WHERE id = ?;', [actorId]);
    if (actor && actor.role !== 'owner') {
      return { success: false, error: 'Akses ditolak: Hanya Owner yang dapat menghapus catatan koreksi saldo.' };
    }

    return await runWithDbLock(async () => {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM balance_adjustments WHERE id = ?;', [id]);
      return { success: true };
    });
  },

  /**
   * Adjust physical balance (Koreksi Saldo) for a wallet
   */
  async adjustWalletBalance(params: {
    dompet: WalletType;
    saldo_baru: number;
    alasan: string;
    actor_id: number;
    actor_nama?: string;
  }): Promise<{ success: boolean; log?: BalanceAdjustmentLog; selisih: number; error?: string }> {
    if (params.saldo_baru < 0) {
      return { success: false, selisih: 0, error: 'Saldo baru tidak boleh bernilai negatif.' };
    }

    // Validasi otorisasi: hanya Owner/Admin yang berhak melakukan penyesuaian/koreksi saldo
    const dbCheck = await getDatabase();
    const actor = await dbCheck.getFirstAsync<{ role: string }>('SELECT role FROM users WHERE id = ?;', [params.actor_id]);
    if (actor && actor.role !== 'owner') {
      return { success: false, selisih: 0, error: 'Akses ditolak: Kasir tidak memiliki izin untuk mengelola atau mengoreksi saldo.' };
    }

    const balances = await reportService.getCurrentBalances();
    let currentBalance = 0;
    if (params.dompet === 'laci_kasir') {
      currentBalance = balances.saldoLaciKasir;
    } else if (params.dompet === 'saldo_manager') {
      currentBalance = balances.saldoManager;
    } else {
      currentBalance = balances.saldoRekeningOwner;
    }

    const selisih = params.saldo_baru - currentBalance;
    const now = new Date();
    const dateStr = formatOnlyDate(now).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const id = `ADJ-${dateStr}-${randomSuffix}`;
    const isoDate = now.toISOString();

    const log: BalanceAdjustmentLog = {
      id,
      tanggal: isoDate,
      dompet: params.dompet,
      saldo_sebelum: currentBalance,
      saldo_sesudah: params.saldo_baru,
      selisih,
      alasan: params.alasan || 'Penyesuaian saldo riil toko',
      actor_id: params.actor_id,
      actor_nama: params.actor_nama || 'Owner',
      created_at: isoDate,
      is_synced: 0,
    };

    return await runWithDbLock(async () => {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO balance_adjustments (id, tanggal, dompet, saldo_sebelum, saldo_sesudah, selisih, alasan, actor_id, actor_nama, created_at, is_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          log.id,
          log.tanggal,
          log.dompet,
          log.saldo_sebelum,
          log.saldo_sesudah,
          log.selisih,
          log.alasan,
          log.actor_id,
          log.actor_nama || '',
          log.created_at,
        ]
      );

      // Sinkronkan catatan saldo awal di app_settings lokal agar serasi dengan Desktop
      try {
        if (params.dompet === 'laci_kasir') {
          await db.runAsync('UPDATE app_settings SET saldo_awal_laci = ? WHERE id = 1;', [params.saldo_baru]);
        } else if (params.dompet === 'saldo_manager') {
          await db.runAsync('UPDATE app_settings SET saldo_awal_manager = ? WHERE id = 1;', [params.saldo_baru]);
        } else {
          await db.runAsync('UPDATE app_settings SET saldo_awal_rekening = ? WHERE id = 1;', [params.saldo_baru]);
        }
      } catch (e) {
        console.warn('[WalletService] Could not update app_settings balance metadata:', e);
      }

      // Jika koreksi dilakukan pada laci kasir saat ada shift kasir yang sedang aktif,
      // sesuaikan modal_awal shift aktif agar kasir tidak terindikasi selisih kas saat closing
      if (params.dompet === 'laci_kasir') {
        try {
          const activeShift = await shiftService.getActiveShift();
          if (activeShift) {
            const adjustedModal = Math.max(0, activeShift.modal_awal + selisih);
            await db.runAsync('UPDATE shifts SET modal_awal = ? WHERE id = ?;', [
              adjustedModal,
              activeShift.id,
            ]);
          }
        } catch (e) {
          console.warn('[WalletService] Could not auto-adjust active shift modal:', e);
        }
      }

      // Push to desktop immediately if connected
      desktopSyncService.pushAdjustmentToDesktop({
        id: log.id,
        tanggal: log.tanggal,
        dompet: log.dompet,
        nominal_sebelum: log.saldo_sebelum,
        nominal_sesudah: log.saldo_sesudah,
        selisih: log.selisih,
        alasan: log.alasan,
        actor_id: log.actor_id,
      }).then(async (res) => {
        if (res.success) {
          const dbInstance = await getDatabase();
          await dbInstance.runAsync('UPDATE balance_adjustments SET is_synced = 1 WHERE id = ?;', [log.id]).catch(() => {});
        }
      }).catch(() => {});

      return { success: true, log, selisih };
    });
  },
};
