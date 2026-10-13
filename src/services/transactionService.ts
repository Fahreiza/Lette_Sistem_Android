import * as Crypto from 'expo-crypto';
import { getDatabase, runWithDbLock } from '../database/db';
import {
  Transaction,
  TransactionItem,
  CartItem,
  OrderChannel,
  PaymentMethod,
} from '../types';
import { formatCurrentTimestamp } from '../utils/formatters';

export const transactionService = {
  async createTransaction(
    channel: OrderChannel,
    metode_bayar: PaymentMethod,
    total: number,
    kasir_id: number,
    cartItems: CartItem[],
    catatan?: string,
    options?: {
      cashPaid?: number;
      kembalian?: number;
      shiftId?: string;
      subtotal?: number;
      taxPercentage?: number;
      taxAmount?: number;
      onlineVoucherDiscount?: number;
    }
  ): Promise<Transaction> {
    return runWithDbLock(async () => {
      let retries = 3;
      while (retries > 0) {
        try {
          const db = await getDatabase();
          const timestamp = formatCurrentTimestamp();
          const trxUuid = Crypto.randomUUID();
          let transactionId = 0;

          const subtotal = options?.subtotal ?? total;
          const taxPercentage = options?.taxPercentage ?? 0;
          const taxAmount = options?.taxAmount ?? 0;
          const cashPaid = options?.cashPaid ?? total;
          const kembalian = options?.kembalian ?? 0;
          const rawShiftId = options?.shiftId ?? null;
          const onlineVoucherDiscount = options?.onlineVoucherDiscount ?? 0;

          await db.withTransactionAsync(async () => {
            // 1a. Validate kasir_id in users table to prevent Foreign Key failure
            let validKasirId = kasir_id;
            const userRow = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM users WHERE id = ?;',
              [kasir_id]
            );
            if (!userRow) {
              const fallbackUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
              validKasirId = fallbackUser ? fallbackUser.id : 1;
            }

            // 1b. Validate shift_id in shifts table to prevent Foreign Key failure
            let validShiftId: string | null = null;
            if (rawShiftId && typeof rawShiftId === 'string' && rawShiftId.trim() !== '') {
              const shiftRow = await db.getFirstAsync<{ id: string }>(
                'SELECT id FROM shifts WHERE id = ?;',
                [rawShiftId.trim()]
              );
              if (shiftRow) {
                validShiftId = shiftRow.id;
              }
            }
            if (!validShiftId) {
              const activeShiftRow = await db.getFirstAsync<{ id: string }>(
                "SELECT id FROM shifts WHERE status = 'open' ORDER BY waktu_buka DESC LIMIT 1;"
              );
              if (activeShiftRow) {
                validShiftId = activeShiftRow.id;
              }
            }

            // 1c. Calculate Online Commission & Net
            let onlineCommissionAmount = 0;
            let onlineNetAmount = total;

            if (channel !== 'offline') {
              const settingsRow = await db.getFirstAsync<{
                commission_shopee?: number;
                commission_grab?: number;
                commission_gofood?: number;
                fee_gofood?: number;
              }>('SELECT commission_shopee, commission_grab, commission_gofood, fee_gofood FROM app_settings WHERE id = 1 LIMIT 1;');

              const basis = Math.max(0, total - onlineVoucherDiscount);
              if (channel === 'shopeefood') {
                const rate = settingsRow?.commission_shopee ?? 27.78;
                onlineCommissionAmount = Math.round(basis * (rate / 100));
                onlineNetAmount = Math.max(0, total - onlineVoucherDiscount - onlineCommissionAmount);
              } else if (channel === 'grabfood') {
                const rate = settingsRow?.commission_grab ?? 25;
                onlineCommissionAmount = Math.round(basis * (rate / 100));
                onlineNetAmount = Math.max(0, total - onlineVoucherDiscount - onlineCommissionAmount);
              } else if (channel === 'gofood') {
                const rate = settingsRow?.commission_gofood ?? 20;
                const fee = settingsRow?.fee_gofood ?? 1000;
                onlineCommissionAmount = Math.round(basis * (rate / 100)) + fee;
                onlineNetAmount = Math.max(0, total - onlineVoucherDiscount - onlineCommissionAmount);
              }
            }

            // 1d. Insert Transaction Header
            const sumberDana: 'laci_kasir' | 'rekening_owner' =
              (channel !== 'offline' || metode_bayar === 'qris') ? 'rekening_owner' : 'laci_kasir';

            const trxResult = await db.runAsync(
              `INSERT INTO transactions (
                uuid, tanggal, channel, metode_bayar, subtotal, tax_percentage, tax_amount,
                total, online_voucher_discount, online_commission_amount, online_net_amount, uang_diterima, kembalian, status, kasir_id, shift_id, catatan, is_synced, sumber_dana
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'selesai', ?, ?, ?, 0, ?);`,
              [
                trxUuid,
                timestamp,
                channel,
                metode_bayar,
                subtotal,
                taxPercentage,
                taxAmount,
                total,
                onlineVoucherDiscount,
                onlineCommissionAmount,
                onlineNetAmount,
                cashPaid,
                kembalian,
                validKasirId,
                validShiftId,
                catatan || '',
                sumberDana,
              ]
            );
            transactionId = trxResult.lastInsertRowId;

            // 2. Insert Transaction Items & Auto Deduct Ingredients
            for (const item of cartItems) {
              const variantSummary = item.selectedVariants
                .map((v) => `${v.nama_varian} (+${v.harga_tambahan})`)
                .join(', ');

              // Validate menu_item_id in menu_items table
              let validMenuItemId = item.menuItem.id;
              const menuExists = await db.getFirstAsync<{ id: number }>(
                'SELECT id FROM menu_items WHERE id = ?;',
                [validMenuItemId]
              );

              if (!menuExists) {
                // Check by name
                const menuByName = await db.getFirstAsync<{ id: number }>(
                  'SELECT id FROM menu_items WHERE nama = ?;',
                  [item.menuItem.nama]
                );
                if (menuByName) {
                  validMenuItemId = menuByName.id;
                } else {
                  // Re-insert menu item into menu_items so Foreign Key constraint never fails
                  const cat = await db.getFirstAsync<{ id: number }>('SELECT id FROM menu_categories LIMIT 1;');
                  const fallbackCatId = cat ? cat.id : 1;
                  try {
                    const insRes = await db.runAsync(
                      `INSERT INTO menu_items (id, category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, is_synced)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1);`,
                      [
                        item.menuItem.id || Date.now(),
                        item.menuItem.category_id || fallbackCatId,
                        item.menuItem.nama,
                        item.menuItem.harga_offline ?? item.unitPrice ?? 0,
                        item.menuItem.harga_gofood ?? item.unitPrice ?? 0,
                        item.menuItem.harga_shopeefood ?? item.unitPrice ?? 0,
                        item.menuItem.harga_grabfood ?? item.unitPrice ?? 0,
                      ]
                    );
                    validMenuItemId = insRes.lastInsertRowId;
                  } catch {
                    const fallbackIns = await db.runAsync(
                      `INSERT INTO menu_items (category_id, nama, harga_offline, status_tersedia, is_synced)
                       VALUES (?, ?, ?, 1, 1);`,
                      [fallbackCatId, item.menuItem.nama, item.unitPrice || 0]
                    );
                    validMenuItemId = fallbackIns.lastInsertRowId;
                  }
                }
              }

              await db.runAsync(
                `INSERT INTO transaction_items (transaction_id, menu_item_id, menu_name, variant_ids, custom_notes, qty, harga_satuan, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                  transactionId,
                  validMenuItemId,
                  item.menuItem.nama,
                  variantSummary,
                  item.customNotes || '',
                  item.qty,
                  item.unitPrice,
                  item.subtotal,
                ]
              );

              // 3. Deduct Ingredients based on Recipe (safely checking existence)
              try {
                const recipes = await db.getAllAsync<{ ingredient_id: number; jumlah_terpakai: number }>(
                  'SELECT ingredient_id, jumlah_terpakai FROM recipes WHERE menu_item_id = ?;',
                  [validMenuItemId]
                );

                for (const recipe of recipes) {
                  const ingRow = await db.getFirstAsync<{ id: number }>(
                    'SELECT id FROM ingredients WHERE id = ?;',
                    [recipe.ingredient_id]
                  );
                  if (ingRow) {
                    const totalUsed = recipe.jumlah_terpakai * item.qty;
                    await db.runAsync(
                      'UPDATE ingredients SET stok_saat_ini = MAX(0, stok_saat_ini - ?) WHERE id = ?;',
                      [totalUsed, recipe.ingredient_id]
                    );

                    await db.runAsync(
                      `INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber)
                       VALUES (?, 'keluar', ?, ?, ?, ?);`,
                      [
                        recipe.ingredient_id,
                        totalUsed,
                        timestamp,
                        `Penggunaan menu: ${item.menuItem.nama} (x${item.qty})`,
                        `Transaksi #${transactionId}`,
                      ]
                    );
                  }
                }
              } catch (recipeErr) {
                console.warn('[Transaction] Recipe stock deduction skipped:', recipeErr);
              }

              // 3b. Deduct Ingredients based on Selected Variants
              try {
                if (item.selectedVariants && Array.isArray(item.selectedVariants)) {
                  for (const v of item.selectedVariants) {
                    let entries: Array<{ ingredient_id: number; jumlah_terpakai: number }> = [];

                    // Check if variant object in cart already has ingredients_list
                    if ((v as any).ingredients_list && Array.isArray((v as any).ingredients_list) && (v as any).ingredients_list.length > 0) {
                      entries = (v as any).ingredients_list.filter((e: any) => e.ingredient_id && Number(e.jumlah_terpakai) > 0);
                    } else if (typeof (v as any).ingredients_list === 'string') {
                      try {
                        const parsed = JSON.parse((v as any).ingredients_list);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                          entries = parsed.filter((e: any) => e.ingredient_id && Number(e.jumlah_terpakai) > 0);
                        }
                      } catch {}
                    }

                    // Check single legacy ingredient on v
                    if (entries.length === 0 && (v as any).ingredient_id && Number((v as any).jumlah_terpakai) > 0) {
                      entries = [{ ingredient_id: Number((v as any).ingredient_id), jumlah_terpakai: Number((v as any).jumlah_terpakai) }];
                    }

                    // If not found on cart object, lookup DB master_variants and menu_variants
                    if (entries.length === 0) {
                      const vId = (v as any).id || (v as any).master_variant_id;
                      let matchedRow: { ingredient_id?: number; jumlah_terpakai?: number; ingredients_list?: string } | null = null;
                      if (vId) {
                        matchedRow = await db.getFirstAsync(
                          'SELECT ingredient_id, jumlah_terpakai, ingredients_list FROM master_variants WHERE id = ?;',
                          [vId]
                        );
                      }
                      if (!matchedRow && v.nama_varian) {
                        matchedRow = await db.getFirstAsync(
                          'SELECT ingredient_id, jumlah_terpakai, ingredients_list FROM master_variants WHERE LOWER(TRIM(nama_varian)) = LOWER(TRIM(?));',
                          [v.nama_varian]
                        );
                      }
                      if (!matchedRow && vId) {
                        matchedRow = await db.getFirstAsync(
                          'SELECT ingredient_id, jumlah_terpakai, ingredients_list FROM menu_variants WHERE id = ?;',
                          [vId]
                        );
                      }

                      if (matchedRow) {
                        if (matchedRow.ingredients_list) {
                          try {
                            const parsed = typeof matchedRow.ingredients_list === 'string' ? JSON.parse(matchedRow.ingredients_list) : matchedRow.ingredients_list;
                            if (Array.isArray(parsed) && parsed.length > 0) {
                              entries = parsed.filter((e: any) => e.ingredient_id && Number(e.jumlah_terpakai) > 0);
                            }
                          } catch {}
                        }
                        if (entries.length === 0 && matchedRow.ingredient_id && Number(matchedRow.jumlah_terpakai) > 0) {
                          entries = [{ ingredient_id: Number(matchedRow.ingredient_id), jumlah_terpakai: Number(matchedRow.jumlah_terpakai) }];
                        }
                      }
                    }

                    // Deduct each ingredient
                    for (const entry of entries) {
                      const ingId = entry.ingredient_id;
                      const usage = entry.jumlah_terpakai;
                      if (ingId && usage > 0) {
                        const ingRow = await db.getFirstAsync<{ id: number; nama: string }>(
                          'SELECT id, nama FROM ingredients WHERE id = ?;',
                          [ingId]
                        );
                        if (ingRow) {
                          const totalVarUsed = usage * item.qty;
                          await db.runAsync(
                            'UPDATE ingredients SET stok_saat_ini = MAX(0, stok_saat_ini - ?) WHERE id = ?;',
                            [totalVarUsed, ingId]
                          );
                          await db.runAsync(
                            `INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber)
                             VALUES (?, 'keluar', ?, ?, ?, ?);`,
                            [
                              ingId,
                              totalVarUsed,
                              timestamp,
                              `Varian: ${v.nama_varian} (${ingRow.nama}) pada ${item.menuItem.nama} (x${item.qty})`,
                              `Transaksi #${transactionId}`,
                            ]
                          );
                        }
                      }
                    }
                  }
                }
              } catch (varErr) {
                console.warn('[Transaction] Variant stock deduction skipped:', varErr);
              }
            }
          });

          const createdTrx = await this.getTransactionById(transactionId);
          if (!createdTrx) {
            throw new Error('Gagal mengambil data transaksi yang baru dibuat.');
          }
          return createdTrx;
        } catch (err: any) {
          retries--;
          const isBusy = err?.message && (
            err.message.includes('locked') ||
            err.message.includes('busy') ||
            err.message.includes('transaction')
          );
          if (isBusy && retries > 0) {
            console.warn(`[Transaction] SQLite locked/busy, retrying (${retries} attempts left)...`);
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }
          throw err;
        }
      }
      throw new Error('Gagal memproses transaksi setelah beberapa kali mencoba.');
    });
  },

  async getTransactionById(id: number): Promise<Transaction | null> {
    const db = await getDatabase();
    const trx = await db.getFirstAsync<Transaction>(
      `SELECT t.id, t.uuid, t.tanggal, t.channel, t.metode_bayar, t.subtotal, t.tax_percentage, t.tax_amount,
              t.total, t.online_voucher_discount, t.online_commission_amount, t.online_net_amount, t.uang_diterima, t.kembalian, t.status, t.kasir_id, u.nama as kasir_name,
              t.shift_id, t.catatan, t.alasan_void, t.void_at, t.is_synced, t.desktop_order_id, t.source, t.sumber_dana
       FROM transactions t
       LEFT JOIN users u ON t.kasir_id = u.id
       WHERE t.id = ?;`,
      [id]
    );

    if (!trx) return null;

    const items = await db.getAllAsync<TransactionItem>(
      `SELECT ti.id, ti.transaction_id, ti.menu_item_id, COALESCE(ti.menu_name, m.nama, 'Menu') as menu_name, ti.variant_ids, ti.custom_notes, ti.qty, ti.harga_satuan, ti.subtotal
       FROM transaction_items ti
       LEFT JOIN menu_items m ON ti.menu_item_id = m.id
       WHERE ti.transaction_id = ?;`,
      [id]
    );

    trx.items = items;
    return trx;
  },

  async getTransactions(options?: {
    startDate?: string;
    endDate?: string;
    channel?: OrderChannel | 'all';
    status?: 'all' | 'selesai' | 'void';
    shiftId?: string;
    limit?: number;
  }): Promise<Transaction[]> {
    const db = await getDatabase();
    let query = `
      SELECT t.id, t.uuid, t.tanggal, t.channel, t.metode_bayar, t.subtotal, t.tax_percentage, t.tax_amount,
             t.total, t.online_voucher_discount, t.online_commission_amount, t.online_net_amount, t.uang_diterima, t.kembalian, t.status, t.kasir_id, u.nama as kasir_name,
             t.shift_id, t.catatan, t.alasan_void, t.void_at, t.is_synced, t.desktop_order_id, t.source, t.sumber_dana
      FROM transactions t
      LEFT JOIN users u ON t.kasir_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.startDate) {
      query += ' AND date(t.tanggal) >= date(?)';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      query += ' AND date(t.tanggal) <= date(?)';
      params.push(options.endDate);
    }
    if (options?.channel && options.channel !== 'all') {
      query += ' AND t.channel = ?';
      params.push(options.channel);
    }
    if (options?.status && options.status !== 'all') {
      query += ' AND t.status = ?';
      params.push(options.status);
    }
    if (options?.shiftId) {
      query += ' AND t.shift_id = ?';
      params.push(options.shiftId);
    }

    query += ' ORDER BY t.id DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    } else {
      query += ' LIMIT 100';
    }

    const trxs = await db.getAllAsync<Transaction>(query, params);

    for (const trx of trxs) {
      const items = await db.getAllAsync<TransactionItem>(
        `SELECT ti.id, ti.transaction_id, ti.menu_item_id, COALESCE(ti.menu_name, m.nama, 'Menu') as menu_name, ti.variant_ids, ti.custom_notes, ti.qty, ti.harga_satuan, ti.subtotal
         FROM transaction_items ti
         LEFT JOIN menu_items m ON ti.menu_item_id = m.id
         WHERE ti.transaction_id = ?;`,
        [trx.id]
      );
      trx.items = items;
    }

    return trxs;
  },

  async voidTransaction(transactionId: number, alasan: string, userId: number): Promise<void> {
    const db = await getDatabase();
    const timestamp = formatCurrentTimestamp();

    await db.withTransactionAsync(async () => {
      // Query transaction directly inside the same transaction (avoid deadlock from separate db call)
      const trx = await db.getFirstAsync<{
        id: number; total: number; status: string; catatan: string | null;
      }>(
        'SELECT id, total, status, catatan FROM transactions WHERE id = ?;',
        [transactionId]
      );
      if (!trx) throw new Error('Transaksi tidak ditemukan.');
      if (trx.status === 'void') throw new Error('Transaksi ini sudah berstatus VOID.');

      // 1. Update Transaction status and void reason, mark is_synced = 0 for offline push
      const updatedCatatan = trx.catatan ? `${trx.catatan} | [VOID: ${alasan}]` : `[VOID: ${alasan}]`;
      await db.runAsync(
        "UPDATE transactions SET status = 'void', catatan = ?, alasan_void = ?, void_at = ?, is_synced = 0 WHERE id = ?;",
        [updatedCatatan, alasan, timestamp, transactionId]
      );

      // 2. Reverse Ingredient Stock: check actual deducted stock movements first to prevent phantom stock
      const recordedMovements = await db.getAllAsync<{ ingredient_id: number; totalDeducted: number }>(
        `SELECT ingredient_id, SUM(jumlah) as totalDeducted 
         FROM stock_movements 
         WHERE sumber = ? AND tipe = 'keluar' 
         GROUP BY ingredient_id;`,
        [`Transaksi #${transactionId}`]
      );

      if (recordedMovements && recordedMovements.length > 0) {
        for (const mov of recordedMovements) {
          const returnedAmount = Math.abs(mov.totalDeducted);
          if (returnedAmount > 0) {
            await db.runAsync(
              'UPDATE ingredients SET stok_saat_ini = stok_saat_ini + ? WHERE id = ?;',
              [returnedAmount, mov.ingredient_id]
            );

            await db.runAsync(
              `INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber)
               VALUES (?, 'masuk', ?, ?, ?, ?);`,
              [
                mov.ingredient_id,
                returnedAmount,
                timestamp,
                `Pengembalian stok riil dari Void Transaksi #${transactionId}. Alasan: ${alasan}`,
                `Void Transaksi #${transactionId}`,
              ]
            );
          }
        }
      } else {
        // Fallback for transactions without specific recorded movements
        const items = await db.getAllAsync<{ menu_item_id: number; qty: number }>(
          'SELECT menu_item_id, qty FROM transaction_items WHERE transaction_id = ?;',
          [transactionId]
        );

        for (const item of items) {
          const recipes = await db.getAllAsync<{ ingredient_id: number; jumlah_terpakai: number }>(
            'SELECT ingredient_id, jumlah_terpakai FROM recipes WHERE menu_item_id = ?;',
            [item.menu_item_id]
          );

          for (const recipe of recipes) {
            const returnedAmount = recipe.jumlah_terpakai * item.qty;
            await db.runAsync(
              'UPDATE ingredients SET stok_saat_ini = stok_saat_ini + ? WHERE id = ?;',
              [returnedAmount, recipe.ingredient_id]
            );

            await db.runAsync(
              `INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber)
               VALUES (?, 'masuk', ?, ?, ?, ?);`,
              [
                recipe.ingredient_id,
                returnedAmount,
                timestamp,
                `Pengembalian stok dari Void Transaksi #${transactionId}. Alasan: ${alasan}`,
                `Void Transaksi #${transactionId}`,
              ]
            );
          }
        }
      }

      // 3. Log Activity
      await db.runAsync(
        `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'VOID_TRANSAKSI', ?, ?);`,
        [
          userId,
          `Void Transaksi #${transactionId} (${trx.total}). Alasan: ${alasan}`,
          timestamp,
        ]
      );
    });
  },

  async getUnsyncedTransactions(): Promise<Transaction[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Transaction>(
      `SELECT t.id, t.uuid, t.tanggal, t.channel, t.metode_bayar, t.subtotal, t.tax_percentage, t.tax_amount,
              t.total, t.online_voucher_discount, t.online_commission_amount, t.online_net_amount, t.uang_diterima, t.kembalian, t.status, t.kasir_id, u.nama as kasir_name,
              t.shift_id, t.catatan, t.alasan_void, t.void_at, t.is_synced, t.desktop_order_id, t.source, t.sumber_dana
       FROM transactions t
       LEFT JOIN users u ON t.kasir_id = u.id
       WHERE (t.is_synced = 0 OR t.is_synced IS NULL)
       ORDER BY t.id ASC;`
    );

    for (const trx of rows) {
      trx.items = await db.getAllAsync<TransactionItem>(
        `SELECT ti.id, ti.transaction_id, ti.menu_item_id, COALESCE(ti.menu_name, m.nama, 'Item') as menu_name, ti.variant_ids, ti.custom_notes, ti.qty, ti.harga_satuan, ti.subtotal
         FROM transaction_items ti
         LEFT JOIN menu_items m ON ti.menu_item_id = m.id
         WHERE ti.transaction_id = ?;`,
        [trx.id]
      );
    }
    return rows;
  },

  async markAsSynced(id: number, desktopOrderId?: string): Promise<void> {
    const db = await getDatabase();
    if (desktopOrderId) {
      await db.runAsync('UPDATE transactions SET is_synced = 1, desktop_order_id = ? WHERE id = ?;', [desktopOrderId, id]);
    } else {
      await db.runAsync('UPDATE transactions SET is_synced = 1 WHERE id = ?;', [id]);
    }
  },
};
