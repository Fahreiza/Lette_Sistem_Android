import { getDatabase } from '../database/db';
import { MenuCategory, MenuItem, MenuVariant, MasterVariant, VariantIngredientEntry } from '../types';
import { formatCurrentTimestamp } from '../utils/formatters';

export const menuService = {
  async getCategories(): Promise<MenuCategory[]> {
    const db = await getDatabase();
    return await db.getAllAsync<MenuCategory>('SELECT id, nama FROM menu_categories ORDER BY id ASC;');
  },

  async addCategory(nama: string): Promise<MenuCategory> {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO menu_categories (nama) VALUES (?);', [nama.trim()]);
    return { id: result.lastInsertRowId, nama: nama.trim() };
  },

  async updateCategory(id: number, nama: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE menu_categories SET nama = ? WHERE id = ?;', [nama.trim(), id]);
  },

  async deleteCategory(id: number): Promise<void> {
    const db = await getDatabase();
    // check if menu items exist in this category
    const count = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?;',
      [id]
    );
    if (count && count.count > 0) {
      throw new Error('Kategori ini masih memiliki menu. Hapus atau pindahkan menu terlebih dahulu.');
    }
    await db.runAsync('DELETE FROM menu_categories WHERE id = ?;', [id]);
  },

  async getMenuItems(categoryId?: number | null, availableOnly = false): Promise<MenuItem[]> {
    const db = await getDatabase();
    let query = `
      SELECT m.id, m.category_id, c.nama as category_name, m.nama,
             m.harga_offline, m.harga_gofood, m.harga_shopeefood, m.harga_grabfood,
             m.status_tersedia
      FROM menu_items m
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (categoryId !== null && categoryId !== undefined) {
      query += ' AND m.category_id = ?';
      params.push(categoryId);
    }
    if (availableOnly) {
      query += ' AND m.status_tersedia = 1';
    }

    query += ' ORDER BY m.nama ASC;';
    const items = await db.getAllAsync<MenuItem>(query, params);

    // Fetch variants for all items
    for (const item of items) {
      const variants = await db.getAllAsync<any>(
        `SELECT mv.id, mv.menu_item_id, mv.nama_varian, mv.harga_tambahan,
                COALESCE(mv.harga_offline, mv.harga_tambahan, 0) as harga_offline,
                COALESCE(mv.harga_gofood, mv.harga_offline, mv.harga_tambahan, 0) as harga_gofood,
                COALESCE(mv.harga_shopeefood, mv.harga_offline, mv.harga_tambahan, 0) as harga_shopeefood,
                COALESCE(mv.harga_grabfood, mv.harga_offline, mv.harga_tambahan, 0) as harga_grabfood,
                mv.master_variant_id, mv.ingredient_id, mv.jumlah_terpakai,
                mv.ingredients_list, mv.kategori_varian,
                i.nama as ingredient_nama, i.satuan as ingredient_satuan
         FROM menu_variants mv
         LEFT JOIN ingredients i ON mv.ingredient_id = i.id
         WHERE mv.menu_item_id = ? ORDER BY mv.id ASC;`,
        [item.id]
      );
      item.variants = (variants || []).map((v: any) => {
        let pList: VariantIngredientEntry[] = [];
        if (v.ingredients_list) {
          try { pList = typeof v.ingredients_list === 'string' ? JSON.parse(v.ingredients_list) : v.ingredients_list; } catch {}
        }
        if ((!pList || pList.length === 0) && v.ingredient_id) {
          pList = [{ ingredient_id: Number(v.ingredient_id), jumlah_terpakai: Number(v.jumlah_terpakai) || 0 }];
        }
        return { ...v, ingredients_list: pList };
      });
    }

    return items;
  },

  async getMenuItemById(id: number): Promise<MenuItem | null> {
    const db = await getDatabase();
    const item = await db.getFirstAsync<MenuItem>(
      `SELECT m.id, m.category_id, c.nama as category_name, m.nama,
              m.harga_offline, m.harga_gofood, m.harga_shopeefood, m.harga_grabfood,
              m.status_tersedia
       FROM menu_items m
       LEFT JOIN menu_categories c ON m.category_id = c.id
       WHERE m.id = ?;`,
      [id]
    );
    if (!item) return null;

    const variants = await db.getAllAsync<any>(
      `SELECT mv.id, mv.menu_item_id, mv.nama_varian, mv.harga_tambahan,
              COALESCE(mv.harga_offline, mv.harga_tambahan, 0) as harga_offline,
              COALESCE(mv.harga_gofood, mv.harga_offline, mv.harga_tambahan, 0) as harga_gofood,
              COALESCE(mv.harga_shopeefood, mv.harga_offline, mv.harga_tambahan, 0) as harga_shopeefood,
              COALESCE(mv.harga_grabfood, mv.harga_offline, mv.harga_tambahan, 0) as harga_grabfood,
              mv.master_variant_id, mv.ingredient_id, mv.jumlah_terpakai,
              mv.ingredients_list, mv.kategori_varian,
              i.nama as ingredient_nama, i.satuan as ingredient_satuan
       FROM menu_variants mv
       LEFT JOIN ingredients i ON mv.ingredient_id = i.id
       WHERE mv.menu_item_id = ?;`,
      [id]
    );
    item.variants = (variants || []).map((v: any) => {
      let pList: VariantIngredientEntry[] = [];
      if (v.ingredients_list) {
        try { pList = typeof v.ingredients_list === 'string' ? JSON.parse(v.ingredients_list) : v.ingredients_list; } catch {}
      }
      if ((!pList || pList.length === 0) && v.ingredient_id) {
        pList = [{ ingredient_id: Number(v.ingredient_id), jumlah_terpakai: Number(v.jumlah_terpakai) || 0 }];
      }
      return { ...v, ingredients_list: pList };
    });
    return item;
  },

  async createMenuItem(
    item: Omit<MenuItem, 'id'>,
    variants: Omit<MenuVariant, 'id' | 'menu_item_id'>[]
  ): Promise<number> {
    const db = await getDatabase();
    let newItemId = 0;

    // Remove any previous tombstone in deleted_menu_items so it's not blocked or re-deleted by sync
    await db.runAsync(
      'DELETE FROM deleted_menu_items WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?));',
      [item.nama.trim()]
    ).catch(() => {});

    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        `INSERT INTO menu_items (category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, is_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          item.category_id,
          item.nama.trim(),
          item.harga_offline,
          item.harga_gofood,
          item.harga_shopeefood,
          item.harga_grabfood,
          item.status_tersedia ?? 1,
        ]
      );
      newItemId = result.lastInsertRowId;

      for (const v of variants) {
        if (v.nama_varian.trim()) {
          const offPrice = Number(v.harga_offline ?? v.harga_tambahan ?? 0);
          const goPrice = v.harga_gofood !== undefined ? Number(v.harga_gofood) : offPrice;
          const shopeePrice = v.harga_shopeefood !== undefined ? Number(v.harga_shopeefood) : offPrice;
          const grabPrice = v.harga_grabfood !== undefined ? Number(v.harga_grabfood) : offPrice;

          const normalizedList = (v.ingredients_list || []).filter(e => e.ingredient_id && e.jumlah_terpakai > 0);
          const finalIngredientsList = normalizedList.length > 0
            ? normalizedList
            : (v.ingredient_id
              ? [{ ingredient_id: Number(v.ingredient_id), jumlah_terpakai: Number(v.jumlah_terpakai) || 0 }]
              : []);
          const legacyIngId = finalIngredientsList.length > 0 ? finalIngredientsList[0].ingredient_id : null;
          const legacyUsage = finalIngredientsList.length > 0 ? finalIngredientsList[0].jumlah_terpakai : 0;
          const jsonList = finalIngredientsList.length > 0 ? JSON.stringify(finalIngredientsList) : null;

          await db.runAsync(
            `INSERT INTO menu_variants (menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [newItemId, v.nama_varian.trim(), offPrice, offPrice, goPrice, shopeePrice, grabPrice, v.master_variant_id || null, legacyIngId, legacyUsage, jsonList, v.kategori_varian || null]
          );
        }
      }
    });

    return newItemId;
  },

  async markMenuSynced(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE menu_items SET is_synced = 1 WHERE id = ?;', [id]);
  },

  async getUnsyncedMenuItems(): Promise<MenuItem[]> {
    const db = await getDatabase();
    const items = await db.getAllAsync<MenuItem>(
      'SELECT * FROM menu_items WHERE is_synced = 0;'
    );
    for (const item of items) {
      const variants = await db.getAllAsync<any>(
        `SELECT mv.id, mv.menu_item_id, mv.nama_varian, mv.harga_tambahan,
                COALESCE(mv.harga_offline, mv.harga_tambahan, 0) as harga_offline,
                COALESCE(mv.harga_gofood, mv.harga_offline, mv.harga_tambahan, 0) as harga_gofood,
                COALESCE(mv.harga_shopeefood, mv.harga_offline, mv.harga_tambahan, 0) as harga_shopeefood,
                COALESCE(mv.harga_grabfood, mv.harga_offline, mv.harga_tambahan, 0) as harga_grabfood,
                mv.master_variant_id, mv.ingredient_id, mv.jumlah_terpakai,
                mv.ingredients_list, mv.kategori_varian,
                i.nama as ingredient_nama, i.satuan as ingredient_satuan
         FROM menu_variants mv
         LEFT JOIN ingredients i ON mv.ingredient_id = i.id
         WHERE mv.menu_item_id = ?;`,
        [item.id]
      );
      item.variants = (variants || []).map((v: any) => {
        let pList: VariantIngredientEntry[] = [];
        if (v.ingredients_list) {
          try { pList = typeof v.ingredients_list === 'string' ? JSON.parse(v.ingredients_list) : v.ingredients_list; } catch {}
        }
        if ((!pList || pList.length === 0) && v.ingredient_id) {
          pList = [{ ingredient_id: Number(v.ingredient_id), jumlah_terpakai: Number(v.jumlah_terpakai) || 0 }];
        }
        return { ...v, ingredients_list: pList };
      });
    }
    return items;
  },

  async updateMenuItem(
    id: number,
    item: Omit<MenuItem, 'id'>,
    variants: Omit<MenuVariant, 'id' | 'menu_item_id'>[]
  ): Promise<void> {
    const db = await getDatabase();

    // Remove any previous tombstone in deleted_menu_items
    await db.runAsync(
      'DELETE FROM deleted_menu_items WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?));',
      [item.nama.trim()]
    ).catch(() => {});

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE menu_items
         SET category_id = ?, nama = ?, harga_offline = ?, harga_gofood = ?, harga_shopeefood = ?, harga_grabfood = ?, status_tersedia = ?, is_synced = 0
         WHERE id = ?;`,
        [
          item.category_id,
          item.nama.trim(),
          item.harga_offline,
          item.harga_gofood,
          item.harga_shopeefood,
          item.harga_grabfood,
          item.status_tersedia,
          id,
        ]
      );

      // Recreate variants
      await db.runAsync('DELETE FROM menu_variants WHERE menu_item_id = ?;', [id]);
      for (const v of variants) {
        if (v.nama_varian.trim()) {
          const offPrice = Number(v.harga_offline ?? v.harga_tambahan ?? 0);
          const goPrice = v.harga_gofood !== undefined ? Number(v.harga_gofood) : offPrice;
          const shopeePrice = v.harga_shopeefood !== undefined ? Number(v.harga_shopeefood) : offPrice;
          const grabPrice = v.harga_grabfood !== undefined ? Number(v.harga_grabfood) : offPrice;

          const normalizedList = (v.ingredients_list || []).filter(e => e.ingredient_id && e.jumlah_terpakai > 0);
          const finalIngredientsList = normalizedList.length > 0
            ? normalizedList
            : (v.ingredient_id
              ? [{ ingredient_id: Number(v.ingredient_id), jumlah_terpakai: Number(v.jumlah_terpakai) || 0 }]
              : []);
          const legacyIngId = finalIngredientsList.length > 0 ? finalIngredientsList[0].ingredient_id : null;
          const legacyUsage = finalIngredientsList.length > 0 ? finalIngredientsList[0].jumlah_terpakai : 0;
          const jsonList = finalIngredientsList.length > 0 ? JSON.stringify(finalIngredientsList) : null;

          await db.runAsync(
            `INSERT INTO menu_variants (menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [id, v.nama_varian.trim(), offPrice, offPrice, goPrice, shopeePrice, grabPrice, v.master_variant_id || null, legacyIngId, legacyUsage, jsonList, v.kategori_varian || null]
          );
        }
      }
    });
  },

  async toggleAvailability(id: number, status_tersedia: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE menu_items SET status_tersedia = ?, is_synced = 0 WHERE id = ?;', [status_tersedia, id]);
  },

  async deleteMenuItem(id: number): Promise<void> {
    const db = await getDatabase();
    const timestamp = formatCurrentTimestamp();
    let itemName = '';

    // 1. Fetch name and preserve in transaction_items if historical orders exist
    try {
      const item = await db.getFirstAsync<{ nama: string }>('SELECT nama FROM menu_items WHERE id = ?;', [id]);
      if (item?.nama) {
        itemName = item.nama;
        await db.runAsync(
          'UPDATE transaction_items SET menu_name = ? WHERE menu_item_id = ? AND (menu_name IS NULL OR menu_name = "");',
          [item.nama, id]
        ).catch(() => {});
      }
    } catch {
      // Ignore if column does not exist
    }

    // 2. Disable foreign keys BEFORE deletion to safely handle historical transaction_items
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    try {
      await db.runAsync('DELETE FROM recipes WHERE menu_item_id = ?;', [id]);
      await db.runAsync('DELETE FROM menu_variants WHERE menu_item_id = ?;', [id]);
      await db.runAsync('DELETE FROM menu_items WHERE id = ?;', [id]);
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON;');
    }

    // 3. Record in deleted_menu_items only after deletion succeeds
    await db.runAsync(
      'INSERT OR REPLACE INTO deleted_menu_items (id, nama, deleted_at) VALUES (?, ?, ?);',
      [id, itemName, timestamp]
    ).catch(() => {});

    // 4. Immediately push delete to Desktop if connected; on success, clean up deleted_menu_items
    try {
      const { desktopSyncService } = require('./desktopSyncService');
      desktopSyncService.deleteMenuItemOnDesktop(id, itemName).then(async (ok: boolean) => {
        if (ok) {
          await db.runAsync('DELETE FROM deleted_menu_items WHERE id = ?;', [id]).catch(() => {});
        }
      }).catch(() => {});
    } catch {}
  },

  async getMasterVariants(): Promise<MasterVariant[]> {
    const db = await getDatabase();
    let rows = await db.getAllAsync<any>(
      `SELECT mv.id, mv.nama_varian, mv.harga_tambahan,
              COALESCE(mv.harga_offline, mv.harga_tambahan, 0) as harga_offline,
              COALESCE(mv.harga_gofood, mv.harga_offline, mv.harga_tambahan, 0) as harga_gofood,
              COALESCE(mv.harga_shopeefood, mv.harga_offline, mv.harga_tambahan, 0) as harga_shopeefood,
              COALESCE(mv.harga_grabfood, mv.harga_offline, mv.harga_tambahan, 0) as harga_grabfood,
              mv.kategori_varian,
              mv.ingredient_id, mv.jumlah_terpakai,
              mv.ingredients_list,
              i.nama as ingredient_nama, i.satuan as ingredient_satuan
       FROM master_variants mv
       LEFT JOIN ingredients i ON mv.ingredient_id = i.id
       ORDER BY mv.id ASC;`
    );

    // Auto-seed from existing distinct variants if master_variants is completely empty
    if (!rows || rows.length === 0) {
      try {
        const distinctVariants = await db.getAllAsync<{ nama_varian: string; harga_tambahan: number }>(
          `SELECT DISTINCT nama_varian, harga_tambahan
           FROM menu_variants
           WHERE nama_varian IS NOT NULL AND TRIM(nama_varian) != ''
           ORDER BY nama_varian ASC;`
        );
        if (distinctVariants && distinctVariants.length > 0) {
          for (const dv of distinctVariants) {
            const res = await db.runAsync(
              'INSERT INTO master_variants (nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood) VALUES (?, ?, ?, ?, ?, ?);',
              [dv.nama_varian.trim(), dv.harga_tambahan || 0, dv.harga_tambahan || 0, dv.harga_tambahan || 0, dv.harga_tambahan || 0, dv.harga_tambahan || 0]
            );
            // Link existing menu_variants with same name
            await db.runAsync(
              'UPDATE menu_variants SET master_variant_id = ? WHERE LOWER(TRIM(nama_varian)) = LOWER(TRIM(?));',
              [res.lastInsertRowId, dv.nama_varian]
            );
          }
          rows = await db.getAllAsync<any>(
            `SELECT mv.id, mv.nama_varian, mv.harga_tambahan,
                    COALESCE(mv.harga_offline, mv.harga_tambahan, 0) as harga_offline,
                    COALESCE(mv.harga_gofood, mv.harga_offline, mv.harga_tambahan, 0) as harga_gofood,
                    COALESCE(mv.harga_shopeefood, mv.harga_offline, mv.harga_tambahan, 0) as harga_shopeefood,
                    COALESCE(mv.harga_grabfood, mv.harga_offline, mv.harga_tambahan, 0) as harga_grabfood,
                    mv.kategori_varian,
                    mv.ingredient_id, mv.jumlah_terpakai,
                    mv.ingredients_list,
                    i.nama as ingredient_nama, i.satuan as ingredient_satuan
             FROM master_variants mv
             LEFT JOIN ingredients i ON mv.ingredient_id = i.id
             ORDER BY mv.id ASC;`
          );
        }
      } catch (err) {
        console.warn('[menuService] Error auto-seeding master variants:', err);
      }
    }

    return (rows || []).map((row: any) => {
      let parsedList: VariantIngredientEntry[] = [];
      if (row.ingredients_list) {
        try {
          parsedList = typeof row.ingredients_list === 'string' ? JSON.parse(row.ingredients_list) : row.ingredients_list;
        } catch {}
      }
      if ((!parsedList || parsedList.length === 0) && row.ingredient_id) {
        parsedList = [{ ingredient_id: Number(row.ingredient_id), jumlah_terpakai: Number(row.jumlah_terpakai) || 0 }];
      }

      return {
        ...row,
        ingredients_list: parsedList,
      };
    });
  },

  async addMasterVariant(
    nama_varian: string,
    harga_tambahan: number,
    kategori_varian?: string,
    ingredient_id?: number | null,
    jumlah_terpakai?: number,
    harga_offline?: number,
    harga_gofood?: number,
    harga_shopeefood?: number,
    harga_grabfood?: number,
    ingredients_list?: VariantIngredientEntry[]
  ): Promise<MasterVariant> {
    const db = await getDatabase();
    const cleanName = nama_varian.trim();
    const price = Number(harga_offline ?? harga_tambahan ?? 0);
    const offPrice = price;
    const goPrice = harga_gofood !== undefined ? Number(harga_gofood) : offPrice;
    const shopeePrice = harga_shopeefood !== undefined ? Number(harga_shopeefood) : offPrice;
    const grabPrice = harga_grabfood !== undefined ? Number(harga_grabfood) : offPrice;

    // Normalisasi multi-ingredients
    const normalizedList = (ingredients_list || []).filter(e => e.ingredient_id && e.jumlah_terpakai > 0);
    const finalIngredientsList = normalizedList.length > 0
      ? normalizedList
      : (ingredient_id
        ? [{ ingredient_id: Number(ingredient_id), jumlah_terpakai: Number(jumlah_terpakai) || 0 }]
        : []);
    const legacyIngId = finalIngredientsList.length > 0 ? finalIngredientsList[0].ingredient_id : null;
    const legacyUsage = finalIngredientsList.length > 0 ? finalIngredientsList[0].jumlah_terpakai : 0;
    const jsonList = finalIngredientsList.length > 0 ? JSON.stringify(finalIngredientsList) : null;

    const res = await db.runAsync(
      'INSERT INTO master_variants (nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, kategori_varian, ingredient_id, jumlah_terpakai, ingredients_list) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [cleanName, price, offPrice, goPrice, shopeePrice, grabPrice, kategori_varian || null, legacyIngId, legacyUsage, jsonList]
    );
    const newId = res.lastInsertRowId;

    // Link any existing menu_variants that match this name but don't have master_variant_id
    await db.runAsync(
      `UPDATE menu_variants
       SET master_variant_id = ?,
           harga_offline = COALESCE(harga_offline, ?),
           harga_gofood = COALESCE(harga_gofood, ?),
           harga_shopeefood = COALESCE(harga_shopeefood, ?),
           harga_grabfood = COALESCE(harga_grabfood, ?),
           ingredient_id = COALESCE(ingredient_id, ?),
           jumlah_terpakai = CASE WHEN jumlah_terpakai IS NULL OR jumlah_terpakai = 0 THEN ? ELSE jumlah_terpakai END,
           ingredients_list = ?,
           kategori_varian = COALESCE(kategori_varian, ?)
       WHERE LOWER(TRIM(nama_varian)) = LOWER(TRIM(?)) AND (master_variant_id IS NULL OR master_variant_id = 0);`,
      [newId, offPrice, goPrice, shopeePrice, grabPrice, legacyIngId, legacyUsage, jsonList, kategori_varian || null, cleanName]
    ).catch(() => {});

    // Get ingredient details if assigned
    let ingName: string | undefined;
    let ingSatuan: string | undefined;
    if (legacyIngId) {
      const ingRow = await db.getFirstAsync<{ nama: string; satuan: string }>(
        'SELECT nama, satuan FROM ingredients WHERE id = ?;',
        [legacyIngId]
      );
      if (ingRow) {
        ingName = ingRow.nama;
        ingSatuan = ingRow.satuan;
      }
    }

    return {
      id: newId,
      nama_varian: cleanName,
      harga_tambahan: price,
      harga_offline: offPrice,
      harga_gofood: goPrice,
      harga_shopeefood: shopeePrice,
      harga_grabfood: grabPrice,
      kategori_varian,
      ingredient_id: legacyIngId,
      jumlah_terpakai: legacyUsage,
      ingredient_nama: ingName,
      ingredient_satuan: ingSatuan,
      ingredients_list: finalIngredientsList,
    };
  },

  async updateMasterVariant(
    id: number,
    nama_varian: string,
    harga_tambahan: number,
    kategori_varian?: string,
    ingredient_id?: number | null,
    jumlah_terpakai?: number,
    harga_offline?: number,
    harga_gofood?: number,
    harga_shopeefood?: number,
    harga_grabfood?: number,
    ingredients_list?: VariantIngredientEntry[]
  ): Promise<void> {
    const db = await getDatabase();
    const cleanName = nama_varian.trim();
    const price = Number(harga_offline ?? harga_tambahan ?? 0);
    const offPrice = price;
    const goPrice = harga_gofood !== undefined ? Number(harga_gofood) : offPrice;
    const shopeePrice = harga_shopeefood !== undefined ? Number(harga_shopeefood) : offPrice;
    const grabPrice = harga_grabfood !== undefined ? Number(harga_grabfood) : offPrice;

    // Normalisasi multi-ingredients
    const normalizedList = (ingredients_list || []).filter(e => e.ingredient_id && e.jumlah_terpakai > 0);
    const finalIngredientsList = normalizedList.length > 0
      ? normalizedList
      : (ingredient_id
        ? [{ ingredient_id: Number(ingredient_id), jumlah_terpakai: Number(jumlah_terpakai) || 0 }]
        : []);
    const legacyIngId = finalIngredientsList.length > 0 ? finalIngredientsList[0].ingredient_id : null;
    const legacyUsage = finalIngredientsList.length > 0 ? finalIngredientsList[0].jumlah_terpakai : 0;
    const jsonList = finalIngredientsList.length > 0 ? JSON.stringify(finalIngredientsList) : null;

    await db.withTransactionAsync(async () => {
      // 1. Update master variant definition
      await db.runAsync(
        'UPDATE master_variants SET nama_varian = ?, harga_tambahan = ?, harga_offline = ?, harga_gofood = ?, harga_shopeefood = ?, harga_grabfood = ?, kategori_varian = ?, ingredient_id = ?, jumlah_terpakai = ?, ingredients_list = ? WHERE id = ?;',
        [cleanName, price, offPrice, goPrice, shopeePrice, grabPrice, kategori_varian || null, legacyIngId, legacyUsage, jsonList, id]
      );

      // 2. Cascade update to all menu_variants linked to this master_variant_id
      await db.runAsync(
        'UPDATE menu_variants SET nama_varian = ?, harga_tambahan = ?, harga_offline = ?, harga_gofood = ?, harga_shopeefood = ?, harga_grabfood = ?, ingredient_id = ?, jumlah_terpakai = ?, ingredients_list = ?, kategori_varian = COALESCE(?, kategori_varian) WHERE master_variant_id = ?;',
        [cleanName, price, offPrice, goPrice, shopeePrice, grabPrice, legacyIngId, legacyUsage, jsonList, kategori_varian || null, id]
      );
    });
  },

  async deleteMasterVariant(id: number): Promise<void> {
    const db = await getDatabase();
    let varName = '';
    try {
      const v = await db.getFirstAsync<{ nama_varian: string }>('SELECT nama_varian FROM master_variants WHERE id = ?;', [id]);
      if (v?.nama_varian) varName = v.nama_varian;
    } catch {}

    await db.withTransactionAsync(async () => {
      // Hapus semua varian di menu yang terhubung ke master varian ini (by ID atau by nama yang sama)
      await db.runAsync('DELETE FROM menu_variants WHERE master_variant_id = ?;', [id]);
      if (varName) {
        await db.runAsync(
          'DELETE FROM menu_variants WHERE LOWER(TRIM(nama_varian)) = LOWER(TRIM(?));',
          [varName]
        ).catch(() => {});
      }
      // Delete master variant
      await db.runAsync('DELETE FROM master_variants WHERE id = ?;', [id]);
    });

    try {
      const { desktopSyncService } = require('./desktopSyncService');
      desktopSyncService.deleteMasterVariantOnDesktop?.(id, varName)?.catch(() => {});
    } catch {}
  },
};
