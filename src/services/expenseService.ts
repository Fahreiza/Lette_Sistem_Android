import { getDatabase } from '../database/db';
import { Expense, ExpenseCategory, WalletType } from '../types';
import { formatCurrentTimestamp } from '../utils/formatters';
import { desktopSyncService } from './desktopSyncService';

export const expenseService = {
  async getAllExpenses(options?: {
    startDate?: string;
    endDate?: string;
    kategori?: ExpenseCategory | 'all';
    sumberDana?: WalletType | 'all';
    limit?: number;
  }): Promise<Expense[]> {
    const db = await getDatabase();
    let query = `
      SELECT e.id, e.tanggal, e.kategori, e.jumlah, e.keterangan, e.input_by,
             e.sumber_dana, e.shift_id, u.nama as input_by_name
      FROM expenses e
      LEFT JOIN users u ON e.input_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.startDate) {
      query += ' AND date(e.tanggal) >= date(?)';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      query += ' AND date(e.tanggal) <= date(?)';
      params.push(options.endDate);
    }
    if (options?.kategori && options.kategori !== 'all') {
      query += ' AND e.kategori = ?';
      params.push(options.kategori);
    }
    if (options?.sumberDana && options.sumberDana !== 'all') {
      query += ' AND e.sumber_dana = ?';
      params.push(options.sumberDana);
    }

    query += ' ORDER BY e.id DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    } else {
      query += ' LIMIT 100';
    }

    return await db.getAllAsync<Expense>(query, params);
  },

  async createExpense(
    kategori: ExpenseCategory,
    jumlah: number,
    keterangan: string,
    input_by: number,
    sumber_dana: WalletType = 'laci_kasir',
    tanggalCustom?: string,
    shiftId?: string
  ): Promise<Expense> {
    const db = await getDatabase();
    const timestamp = tanggalCustom || formatCurrentTimestamp();

    // Determine shift_id if not explicitly provided
    let resolvedShiftId = shiftId;
    if (!resolvedShiftId && sumber_dana === 'laci_kasir') {
      try {
        const activeShift = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM shifts WHERE status = 'open' ORDER BY waktu_buka DESC LIMIT 1;"
        );
        if (activeShift) {
          resolvedShiftId = activeShift.id;
        }
      } catch {
        // Fallback gracefully
      }
    }

    // Validate input_by in users table to prevent Foreign Key constraint failure
    let validUserId = input_by;
    const userRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [input_by]);
    if (!userRow) {
      const fallbackUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
      validUserId = fallbackUser ? fallbackUser.id : 1;
    }

    const result = await db.runAsync(
      `INSERT INTO expenses (tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, shift_id, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [timestamp, kategori, jumlah, keterangan.trim(), validUserId, sumber_dana, resolvedShiftId || null]
    );

    const newExpense: Expense = {
      id: result.lastInsertRowId,
      tanggal: timestamp,
      kategori,
      jumlah,
      keterangan: keterangan.trim(),
      input_by: validUserId,
      sumber_dana,
      shift_id: resolvedShiftId || undefined,
    };

    // Auto push expense to desktop bridge if connected
    desktopSyncService.pushExpenseToDesktop({
      id: newExpense.id,
      kategori: newExpense.kategori,
      jumlah: newExpense.jumlah,
      keterangan: newExpense.keterangan,
      input_by: newExpense.input_by,
      sumber_dana: newExpense.sumber_dana,
      tanggal: newExpense.tanggal,
    }).then(async (res) => {
      if (res && res.success) {
        await db.runAsync('UPDATE expenses SET is_synced = 1 WHERE id = ?;', [newExpense.id]).catch(() => {});
      }
    }).catch(() => {});

    return newExpense;
  },

  async deleteExpense(id: number, userId: number): Promise<void> {
    const db = await getDatabase();
    const timestamp = formatCurrentTimestamp();

    // 1. Record in deleted_expenses to guarantee no resurrection on sync catch-up
    await db.runAsync(
      'INSERT OR REPLACE INTO deleted_expenses (id, deleted_at) VALUES (?, ?);',
      [id, timestamp]
    ).catch(() => {});

    await db.withTransactionAsync(async () => {
      const exp = await db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id = ?;', [id]);
      if (!exp) return;
      await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);

      // Guard activity log against FK failure
      try {
        let validUserId = userId;
        const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [userId]);
        if (!u) {
          const fallback = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
          validUserId = fallback ? fallback.id : 1;
        }
        await db.runAsync(
          `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'DELETE_EXPENSE', ?, ?);`,
          [validUserId, `Hapus pengeluaran #${id} (${exp.kategori}: ${exp.jumlah})`, timestamp]
        );
      } catch (logErr) {
        console.warn('Activity log skipped for deleteExpense:', logErr);
      }
    });

    // 2. Immediately push delete to Desktop if connected; on success, clean up deleted_expenses
    desktopSyncService.pushDeleteExpenseToDesktop(id).then(async (ok) => {
      if (ok) {
        await db.runAsync('DELETE FROM deleted_expenses WHERE id = ?;', [id]).catch(() => {});
      }
    }).catch(() => {});
  },

  async getTotalExpenses(startDate?: string, endDate?: string, sumberDana?: 'laci_kasir' | 'rekening_owner'): Promise<number> {
    const db = await getDatabase();
    let query = 'SELECT SUM(jumlah) as total FROM expenses WHERE 1=1';
    const params: any[] = [];
    if (startDate) {
      query += ' AND date(tanggal) >= date(?)';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date(tanggal) <= date(?)';
      params.push(endDate);
    }
    if (sumberDana) {
      query += ' AND sumber_dana = ?';
      params.push(sumberDana);
    }
    const res = await db.getFirstAsync<{ total: number }>(query, params);
    return res?.total || 0;
  },

  // Category Management
  async getExpenseCategories(): Promise<string[]> {
    const db = await getDatabase();
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'expense_categories';"
      );
      let list: string[] = [];
      if (row && row.value) {
        try {
          list = JSON.parse(row.value);
        } catch {
          list = [];
        }
      }
      if (!list || list.length === 0) {
        list = [...DEFAULT_EXPENSE_CATEGORIES];
        await db.runAsync(
          "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
          [JSON.stringify(list)]
        ).catch(() => {});
      }
      // Pick up any custom categories from existing expense records
      const distinctRows = await db.getAllAsync<{ kategori: string }>(
        "SELECT DISTINCT kategori FROM expenses WHERE kategori IS NOT NULL AND kategori != '';"
      ).catch(() => []);
      let updated = false;
      for (const r of distinctRows) {
        if (r.kategori && !list.some((c) => c.toLowerCase() === r.kategori.toLowerCase())) {
          list.push(r.kategori);
          updated = true;
        }
      }
      if (updated) {
        await db.runAsync(
          "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
          [JSON.stringify(list)]
        ).catch(() => {});
      }
      return list;
    } catch (e) {
      console.warn('Failed to load expense categories from DB:', e);
      return [...DEFAULT_EXPENSE_CATEGORIES];
    }
  },

  async addExpenseCategory(
    catName: string,
    actorId?: number
  ): Promise<{ success: boolean; categories: string[]; error?: string }> {
    const trimmed = catName.trim();
    if (!trimmed) {
      return { success: false, categories: [], error: 'Nama kategori tidak boleh kosong.' };
    }
    const db = await getDatabase();
    const current = await this.getExpenseCategories();
    if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, categories: current, error: 'Kategori sudah terdaftar.' };
    }
    const updated = [...current, trimmed];
    await db.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
      [JSON.stringify(updated)]
    );
    if (actorId) {
      const timestamp = formatCurrentTimestamp();
      await db.runAsync(
        "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'ADD_EXPENSE_CAT', ?, ?);",
        [actorId, `Tambah kategori pengeluaran baru: "${trimmed}"`, timestamp]
      ).catch(() => {});
    }
    return { success: true, categories: updated };
  },

  async deleteExpenseCategory(
    catName: string,
    actorId?: number
  ): Promise<{ success: boolean; categories: string[]; error?: string }> {
    const trimmed = catName.trim();
    const db = await getDatabase();
    const current = await this.getExpenseCategories();
    const filtered = current.filter((c) => c.toLowerCase() !== trimmed.toLowerCase());
    await db.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
      [JSON.stringify(filtered)]
    );
    if (actorId) {
      const timestamp = formatCurrentTimestamp();
      await db.runAsync(
        "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'DELETE_EXPENSE_CAT', ?, ?);",
        [actorId, `Hapus kategori pengeluaran: "${trimmed}"`, timestamp]
      ).catch(() => {});
    }
    return { success: true, categories: filtered };
  },

  async mergeCategoriesFromDesktop(incomingCats: string[]): Promise<string[]> {
    if (!incomingCats || !Array.isArray(incomingCats) || incomingCats.length === 0) {
      return await this.getExpenseCategories();
    }
    const db = await getDatabase();
    const current = await this.getExpenseCategories();
    let changed = false;
    const merged = [...current];
    for (const cat of incomingCats) {
      const trimmed = typeof cat === 'string' ? cat.trim() : '';
      if (trimmed && !merged.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        merged.push(trimmed);
        changed = true;
      }
    }
    if (changed) {
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('expense_categories', ?);",
        [JSON.stringify(merged)]
      ).catch(() => {});
    }
    return merged;
  },
};

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'Kasbon Karyawan',
  'Lembur',
  'Belanja Bahan Baku',
  'Operasional Lain',
  'Listrik & Gas',
  'Sewa & Kebersihan',
];
