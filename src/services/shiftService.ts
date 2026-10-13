import { getDatabase, runWithDbLock } from '../database/db';
import { CashierShift, Transaction, Expense } from '../types';
import { formatCurrentTimestamp } from '../utils/formatters';

export const shiftService = {
  // 1. Get currently active shift for a cashier
  async getActiveShift(kasirId?: number): Promise<CashierShift | null> {
    const db = await getDatabase();
    if (kasirId) {
      const shift = await db.getFirstAsync<CashierShift>(
        `SELECT * FROM shifts WHERE kasir_id = ? AND status = 'open' ORDER BY waktu_buka DESC LIMIT 1;`,
        [kasirId]
      );
      return shift || null;
    }
    const shift = await db.getFirstAsync<CashierShift>(
      `SELECT * FROM shifts WHERE status = 'open' ORDER BY waktu_buka DESC LIMIT 1;`
    );
    return shift || null;
  },

  // 2. Get the last closed shift for cash handover check
  async getLastClosedShift(): Promise<CashierShift | null> {
    const db = await getDatabase();
    const shift = await db.getFirstAsync<CashierShift>(
      `SELECT * FROM shifts WHERE status = 'closed' ORDER BY waktu_tutup DESC LIMIT 1;`
    );
    return shift || null;
  },

  // 3. Open a new cashier shift
  async openShift(
    kasirId: number,
    kasirNama: string,
    modalAwal: number,
    catatanSerahTerima = ''
  ): Promise<CashierShift> {
    const db = await getDatabase();
    const timestamp = formatCurrentTimestamp();
    const now = new Date();
    const dateCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const shiftId = `SFT-${dateCode}-${randCode}`;

    // Check last closed shift to determine handover discrepancy
    const lastShift = await this.getLastClosedShift();
    const saldoLalu = lastShift?.uang_fisik_aktual ?? lastShift?.total_sistem_tunai;
    let selisihHandover = 0;
    if (saldoLalu !== undefined && saldoLalu !== null) {
      selisihHandover = modalAwal - saldoLalu;
    }

    // Validate kasirId in users table to prevent Foreign Key failure
    let validKasirId = kasirId;
    const userRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [kasirId]);
    if (!userRow) {
      const fallbackUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
      validKasirId = fallbackUser ? fallbackUser.id : 1;
    }

    await runWithDbLock(async () => {
      await db.runAsync(
        `INSERT INTO shifts (
          id, kasir_id, kasir_nama, waktu_buka, modal_awal,
          saldo_shift_sebelumnya, selisih_serah_terima, catatan_serah_terima,
          shift_sebelumnya_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open');`,
        [
          shiftId,
          validKasirId,
          kasirNama,
          timestamp,
          modalAwal,
          saldoLalu ?? 0,
          selisihHandover,
          catatanSerahTerima,
          lastShift?.id ?? null,
        ]
      );

      // Record activity log (safely guarded)
      try {
        await db.runAsync(
          `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'SHIFT_OPEN', ?, ?);`,
          [
            validKasirId,
            `Kasir ${kasirNama} membuka shift. Modal awal: Rp ${modalAwal.toLocaleString('id-ID')}`,
            timestamp,
          ]
        );
      } catch {}
    });

    const created = await this.getActiveShift(validKasirId);
    if (!created) {
      throw new Error('Gagal membuka shift kasir.');
    }
    return created;
  },

  // 4. Calculate live shift summary & reconciliation numbers
  async getShiftSummary(shiftId: string): Promise<{
    shift: CashierShift | null;
    totalTunai: number;
    countTunai: number;
    totalQris: number;
    countQris: number;
    totalOnline: number;
    countOnline: number;
    breakdownOnline: {
      gofood: { total: number; count: number };
      shopeefood: { total: number; count: number };
      grabfood: { total: number; count: number };
    };
    totalOmset: number;
    totalTransaksi: number;
    totalPengeluaran: number;
    totalExpectedCash: number;
    talanganKas?: number;
    rawExpectedCash?: number;
  }> {
    const db = await getDatabase();
    const shift = await db.getFirstAsync<CashierShift>(
      `SELECT * FROM shifts WHERE id = ?;`,
      [shiftId]
    );

    if (!shift) {
      return {
        shift: null,
        totalTunai: 0,
        countTunai: 0,
        totalQris: 0,
        countQris: 0,
        totalOnline: 0,
        countOnline: 0,
        breakdownOnline: {
          gofood: { total: 0, count: 0 },
          shopeefood: { total: 0, count: 0 },
          grabfood: { total: 0, count: 0 },
        },
        totalOmset: 0,
        totalTransaksi: 0,
        totalPengeluaran: 0,
        totalExpectedCash: 0,
        talanganKas: 0,
        rawExpectedCash: 0,
      };
    }

    const endTime = shift.waktu_tutup || formatCurrentTimestamp();

    // Get transactions linked to this shift (with fallback for transactions within shift timeframe if shift_id was unlinked)
    const txs = await db.getAllAsync<Transaction>(
      `SELECT * FROM transactions 
       WHERE (shift_id = ? OR ((shift_id IS NULL OR shift_id = '') AND tanggal >= ? AND tanggal <= ?)) 
         AND status NOT IN ('void', 'voided', 'dibatalkan');`,
      [shiftId, shift.waktu_buka, endTime]
    );

    let totalTunai = 0;
    let countTunai = 0;
    let totalQris = 0;
    let countQris = 0;
    let totalOnline = 0;
    let countOnline = 0;

    const breakdownOnline = {
      gofood: { total: 0, count: 0 },
      shopeefood: { total: 0, count: 0 },
      grabfood: { total: 0, count: 0 },
    };

    for (const t of txs) {
      if (t.channel === 'offline') {
        if (t.metode_bayar === 'tunai' || (t.metode_bayar as string) === 'cash') {
          totalTunai += t.total;
          countTunai += 1;
        } else {
          totalQris += t.total;
          countQris += 1;
        }
      } else {
        totalOnline += t.total;
        countOnline += 1;
        if (t.channel === 'gofood') {
          breakdownOnline.gofood.total += t.total;
          breakdownOnline.gofood.count += 1;
        } else if (t.channel === 'shopeefood') {
          breakdownOnline.shopeefood.total += t.total;
          breakdownOnline.shopeefood.count += 1;
        } else if (t.channel === 'grabfood') {
          breakdownOnline.grabfood.total += t.total;
          breakdownOnline.grabfood.count += 1;
        }
      }
    }

    // Get cash expenses taken from drawer during this shift
    const expenses = await db.getAllAsync<Expense>(
      `SELECT * FROM expenses 
       WHERE (sumber_dana = 'laci_kasir' OR sumber_dana IS NULL)
         AND (shift_id = ? OR ((shift_id IS NULL OR shift_id = '') AND tanggal >= ? AND tanggal <= ?));`,
      [shift.id, shift.waktu_buka, endTime]
    );

    const totalPengeluaran = expenses.reduce((sum, e) => sum + e.jumlah, 0);

    // Transfers affecting laci kasir during this shift
    let netTransferLaci = 0;
    try {
      const shiftTransfers = await db.getAllAsync<{ from_wallet: string; to_wallet: string; total: number }>(
        `SELECT from_wallet, to_wallet, COALESCE(SUM(jumlah), 0) as total FROM wallet_transfers 
         WHERE datetime(tanggal) >= datetime(?) AND datetime(tanggal) <= datetime(?)
         GROUP BY from_wallet, to_wallet;`,
        [shift.waktu_buka, endTime]
      );
      for (const tr of shiftTransfers) {
        if (tr.to_wallet === 'laci_kasir') netTransferLaci += tr.total;
        if (tr.from_wallet === 'laci_kasir') netTransferLaci -= tr.total;
      }
    } catch {}

    const rawExpectedCash = shift.modal_awal + totalTunai - totalPengeluaran + netTransferLaci;
    const totalExpectedCash = Math.max(0, rawExpectedCash);
    const talanganKas = rawExpectedCash < 0 ? Math.abs(rawExpectedCash) : 0;
    const totalOmset = totalTunai + totalQris + totalOnline;

    return {
      shift,
      totalTunai,
      countTunai,
      totalQris,
      countQris,
      totalOnline,
      countOnline,
      breakdownOnline,
      totalOmset,
      totalTransaksi: txs.length,
      totalPengeluaran,
      totalExpectedCash,
      talanganKas,
      rawExpectedCash,
    };
  },

  // 5. Close cashier shift & reconcile cash drawer
  async closeShift(
    shiftId: string,
    uangFisikAktual: number,
    catatan = '',
    actorId?: number
  ): Promise<CashierShift | null> {
    const db = await getDatabase();
    const summary = await this.getShiftSummary(shiftId);
    if (!summary.shift || summary.shift.status === 'closed') {
      return null;
    }

    const timestamp = formatCurrentTimestamp();
    const selisih = uangFisikAktual - summary.totalExpectedCash;

    await runWithDbLock(async () => {
      await db.runAsync(
        `UPDATE shifts SET
          waktu_tutup = ?,
          total_penjualan_tunai = ?,
          total_penjualan_qris = ?,
          total_penjualan_online = ?,
          total_pengeluaran_kas = ?,
          total_sistem_tunai = ?,
          uang_fisik_aktual = ?,
          selisih = ?,
          catatan_closing = ?,
          status = 'closed'
         WHERE id = ?;`,
        [
          timestamp,
          summary.totalTunai,
          summary.totalQris,
          summary.totalOnline,
          summary.totalPengeluaran,
          summary.totalExpectedCash,
          uangFisikAktual,
          selisih,
          catatan,
          shiftId,
        ]
      );

      // Record activity log (safely guarded)
      try {
        const diffDesc = selisih === 0
          ? 'Seimbang (Pas)'
          : selisih > 0
          ? `Lebih Rp ${selisih.toLocaleString('id-ID')}`
          : `Kurang Rp ${Math.abs(selisih).toLocaleString('id-ID')}`;

        let actor = actorId ?? summary.shift!.kasir_id;
        const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [actor]);
        if (!u) {
          const fallback = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
          actor = fallback ? fallback.id : 1;
        }
        await db.runAsync(
          `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'SHIFT_CLOSE', ?, ?);`,
          [
            actor,
            `Kasir ${summary.shift!.kasir_nama} menutup shift ${shiftId}. Fisik: Rp ${uangFisikAktual.toLocaleString('id-ID')}, Sistem: Rp ${summary.totalExpectedCash.toLocaleString('id-ID')} (${diffDesc})`,
            timestamp,
          ]
        );
      } catch {}
    });

    return await db.getFirstAsync<CashierShift>(`SELECT * FROM shifts WHERE id = ?;`, [shiftId]);
  },

  // 6. Get all shifts history
  async getAllShifts(limit = 50): Promise<CashierShift[]> {
    const db = await getDatabase();
    return await db.getAllAsync<CashierShift>(
      `SELECT * FROM shifts ORDER BY waktu_buka DESC LIMIT ?;`,
      [limit]
    );
  },
};
