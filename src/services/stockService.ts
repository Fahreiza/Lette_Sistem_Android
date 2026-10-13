import { getDatabase, runWithDbLock } from '../database/db';
import { Ingredient, Recipe, StockMovement } from '../types';
import { formatCurrentTimestamp } from '../utils/formatters';

export const stockService = {
  async getAllIngredients(): Promise<Ingredient[]> {
    const db = await getDatabase();
    return await db.getAllAsync<Ingredient>(
      'SELECT id, nama, satuan, harga_beli_satuan, stok_saat_ini, stok_minimum, urutan FROM ingredients ORDER BY urutan ASC, nama ASC;'
    );
  },

  async getLowStockIngredients(): Promise<Ingredient[]> {
    const db = await getDatabase();
    return await db.getAllAsync<Ingredient>(
      'SELECT id, nama, satuan, harga_beli_satuan, stok_saat_ini, stok_minimum, urutan FROM ingredients WHERE stok_saat_ini <= stok_minimum ORDER BY (stok_saat_ini - stok_minimum) ASC;'
    );
  },

  async createIngredient(
    nama: string,
    satuan: string,
    stok_awal: number,
    stok_minimum: number
  ): Promise<Ingredient> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      const timestamp = formatCurrentTimestamp();
      let newId = 0;

      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          'INSERT INTO ingredients (nama, satuan, stok_saat_ini, stok_minimum) VALUES (?, ?, ?, ?);',
          [nama.trim(), satuan.trim(), stok_awal, stok_minimum]
        );
        newId = result.lastInsertRowId;

        if (stok_awal > 0) {
          await db.runAsync(
            'INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber) VALUES (?, ?, ?, ?, ?, ?);',
            [newId, 'masuk', stok_awal, timestamp, 'Stok Awal Pembuatan Bahan', 'Input Manual']
          );
        }
      });

      return {
        id: newId,
        nama: nama.trim(),
        satuan: satuan.trim(),
        stok_saat_ini: stok_awal,
        stok_minimum,
      };
    });
  },

  async updateIngredient(
    id: number,
    nama: string,
    satuan: string,
    stok_minimum: number
  ): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE ingredients SET nama = ?, satuan = ?, stok_minimum = ? WHERE id = ?;',
        [nama.trim(), satuan.trim(), stok_minimum, id]
      );
    });
  },

  async adjustStock(
    ingredient_id: number,
    tipe: 'adjustment' | 'opname',
    stok_baru: number,
    alasan: string,
    userId: number
  ): Promise<{ movementId: number }> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      const timestamp = formatCurrentTimestamp();
      let movementId = 0;

      await db.withTransactionAsync(async () => {
        const ing = await db.getFirstAsync<Ingredient>(
          'SELECT id, nama, stok_saat_ini, satuan FROM ingredients WHERE id = ?;',
          [ingredient_id]
        );
        if (!ing) throw new Error('Bahan baku tidak ditemukan.');

        const selisih = stok_baru - ing.stok_saat_ini;

        await db.runAsync('UPDATE ingredients SET stok_saat_ini = ? WHERE id = ?;', [
          stok_baru,
          ingredient_id,
        ]);

        const note = `Selisih: ${selisih > 0 ? '+' : ''}${selisih} ${ing.satuan}. Alasan: ${alasan}`;
        const movRes = await db.runAsync(
          'INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);',
          [ingredient_id, tipe, selisih, timestamp, note, tipe === 'opname' ? 'Stock Opname Fisik' : 'Manual Adjustment']
        );
        movementId = movRes.lastInsertRowId;

        // Activity log safely guarded
        try {
          let validUser = userId;
          const u = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [userId]);
          if (!u) {
            const fallback = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
            validUser = fallback ? fallback.id : 1;
          }
          await db.runAsync(
            'INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, ?, ?, ?);',
            [validUser, 'ADJUST_STOK', `Penyesuaian stok ${ing.nama}: ${ing.stok_saat_ini} -> ${stok_baru} (${note})`, timestamp]
          );
        } catch { }
      });

      return { movementId };
    });
  },

  async purchaseStock(
    ingredient_id: number,
    jumlah_masuk: number,
    total_biaya: number,
    keterangan: string,
    userId: number,
    sumber_dana: 'laci_kasir' | 'rekening_owner' = 'laci_kasir'
  ): Promise<{
    movementId: number;
    expenseId: number | null;
    sumberDana: 'laci_kasir' | 'rekening_owner';
    totalBiaya: number;
    expDesc: string;
    timestamp: string;
  }> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      const timestamp = formatCurrentTimestamp();
      let movementId = 0;
      let expenseId: number | null = null;
      let expDesc = '';

      await db.withTransactionAsync(async () => {
        const ing = await db.getFirstAsync<Ingredient>(
          'SELECT id, nama, stok_saat_ini, satuan, harga_beli_satuan FROM ingredients WHERE id = ?;',
          [ingredient_id]
        );
        if (!ing) throw new Error('Bahan baku tidak ditemukan.');

        const newStock = ing.stok_saat_ini + jumlah_masuk;
        const newUnitPrice = (total_biaya > 0 && jumlah_masuk > 0)
          ? Math.round((total_biaya / jumlah_masuk) * 100) / 100
          : (ing.harga_beli_satuan || 0);

        await db.runAsync('UPDATE ingredients SET stok_saat_ini = ?, harga_beli_satuan = ? WHERE id = ?;', [
          newStock,
          newUnitPrice,
          ingredient_id,
        ]);

        // 1. Catat stock movement (is_synced = 0)
        const movRes = await db.runAsync(
          'INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);',
          [ingredient_id, 'masuk', jumlah_masuk, timestamp, keterangan || 'Belanja Stok Bahan', 'Belanja Bahan Baku']
        );
        movementId = movRes.lastInsertRowId;

        // Validate userId for expenses & activity logs
        let validUserId = userId;
        const userRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [userId]);
        if (!userRow) {
          const fallbackUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
          validUserId = fallbackUser ? fallbackUser.id : 1;
        }

        // 2. Otomatis catat expense / pengeluaran (is_synced = 0)
        if (total_biaya > 0) {
          expDesc = `Beli ${ing.nama} (+${jumlah_masuk} ${ing.satuan})${keterangan ? ' - ' + keterangan : ''}`;
          const expRes = await db.runAsync(
            'INSERT INTO expenses (tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);',
            [timestamp, 'Belanja Bahan Baku', total_biaya, expDesc, validUserId, sumber_dana]
          );
          expenseId = expRes.lastInsertRowId;
        }
      });

      return { movementId, expenseId, sumberDana: sumber_dana, totalBiaya: total_biaya, expDesc, timestamp };
    });
  },

  async batchPurchaseStock(
    items: { ingredient_id: number; jumlah_masuk: number; harga_total: number }[],
    sumber_dana: 'laci_kasir' | 'rekening_owner',
    catatan: string,
    userId: number
  ): Promise<{
    movementIds: number[];
    expenseId: number | null;
    grandTotalCost: number;
    expDesc: string;
    sumberDana: 'laci_kasir' | 'rekening_owner';
    timestamp: string;
  }> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      const timestamp = formatCurrentTimestamp();
      const validItems = items.filter((i) => i.jumlah_masuk > 0);
      if (validItems.length === 0) {
        return { movementIds: [], expenseId: null, grandTotalCost: 0, expDesc: '', sumberDana: sumber_dana, timestamp };
      }

      let grandTotalCost = 0;
      let expenseId: number | null = null;
      let expDesc = '';
      const movementIds: number[] = [];

      await db.withTransactionAsync(async () => {
        const purchasedSummaryList: string[] = [];

        for (const item of validItems) {
          const ing = await db.getFirstAsync<Ingredient>(
            'SELECT id, nama, stok_saat_ini, satuan, harga_beli_satuan FROM ingredients WHERE id = ?;',
            [item.ingredient_id]
          );
          if (!ing) continue;

          const newStock = ing.stok_saat_ini + item.jumlah_masuk;
          const newUnitPrice = item.jumlah_masuk > 0 ? Math.round((item.harga_total / item.jumlah_masuk) * 100) / 100 : (ing.harga_beli_satuan || 0);

          await db.runAsync('UPDATE ingredients SET stok_saat_ini = ?, harga_beli_satuan = ? WHERE id = ?;', [
            newStock,
            newUnitPrice,
            item.ingredient_id,
          ]);

          const movRes = await db.runAsync(
            'INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);',
            [item.ingredient_id, 'masuk', item.jumlah_masuk, timestamp, catatan || 'Restock Belanja Harian', 'Belanja Massal']
          );
          movementIds.push(movRes.lastInsertRowId);

          grandTotalCost += item.harga_total;
          purchasedSummaryList.push(`${ing.nama} (+${item.jumlah_masuk} ${ing.satuan})`);
        }

        // Validate userId for expenses & activity logs
        let validUserId = userId;
        const userRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?;', [userId]);
        if (!userRow) {
          const fallbackUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
          validUserId = fallbackUser ? fallbackUser.id : 1;
        }

        if (grandTotalCost > 0 || purchasedSummaryList.length > 0) {
          expDesc = `Restock Harian (${validItems.length} bahan): ${purchasedSummaryList.join(', ')}${catatan ? ' - ' + catatan : ''}`;
          const expRes = await db.runAsync(
            'INSERT INTO expenses (tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);',
            [timestamp, 'Belanja Bahan Baku', grandTotalCost, expDesc, validUserId, sumber_dana]
          );
          expenseId = expRes.lastInsertRowId;

          try {
            await db.runAsync(
              'INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, ?, ?, ?);',
              [validUserId, 'BELANJA_MASSAL', `Restock ${validItems.length} bahan: Rp ${grandTotalCost.toLocaleString('id-ID')} (${sumber_dana})`, timestamp]
            );
          } catch { }
        }
      });

      return {
        movementIds,
        expenseId,
        grandTotalCost,
        expDesc,
        sumberDana: sumber_dana,
        timestamp,
      };
    });
  },

  async getRecipesForMenuItem(menu_item_id: number): Promise<Recipe[]> {
    const db = await getDatabase();
    return await db.getAllAsync<Recipe>(
      `SELECT r.id, r.menu_item_id, r.ingredient_id, i.nama as ingredient_name, i.satuan as ingredient_unit, r.jumlah_terpakai
       FROM recipes r
       JOIN ingredients i ON r.ingredient_id = i.id
       WHERE r.menu_item_id = ?;`,
      [menu_item_id]
    );
  },

  async saveRecipesForMenuItem(
    menu_item_id: number,
    recipes: { ingredient_id: number; jumlah_terpakai: number }[]
  ): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM recipes WHERE menu_item_id = ?;', [menu_item_id]);
        for (const r of recipes) {
          if (r.jumlah_terpakai > 0) {
            const ingExists = await db.getFirstAsync<{ id: number }>('SELECT id FROM ingredients WHERE id = ?;', [r.ingredient_id]);
            if (ingExists) {
              await db.runAsync(
                'INSERT INTO recipes (menu_item_id, ingredient_id, jumlah_terpakai) VALUES (?, ?, ?);',
                [menu_item_id, r.ingredient_id, r.jumlah_terpakai]
              );
            }
          }
        }
      });
    });
  },

  async getStockMovements(ingredient_id?: number, limit = 100): Promise<StockMovement[]> {
    const db = await getDatabase();
    let query = `
      SELECT sm.id, sm.ingredient_id, COALESCE(i.nama, 'Bahan #' || sm.ingredient_id) as ingredient_name, sm.tipe, sm.jumlah, sm.tanggal, sm.keterangan, sm.sumber
      FROM stock_movements sm
      LEFT JOIN ingredients i ON sm.ingredient_id = i.id
    `;
    const params: any[] = [];
    if (ingredient_id) {
      query += ' WHERE sm.ingredient_id = ?';
      params.push(ingredient_id);
    }
    query += ' ORDER BY sm.id DESC LIMIT ?;';
    params.push(limit);

    return await db.getAllAsync<StockMovement>(query, params);
  },
};
