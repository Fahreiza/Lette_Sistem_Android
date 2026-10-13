import { getDatabase, runWithDbLock } from '../database/db';
import { User, UserRole, ActivityLog } from '../types';
import { hashPin, verifyPin } from '../utils/crypto';
import { formatCurrentTimestamp } from '../utils/formatters';
import { desktopSyncService } from './desktopSyncService';

export const authService = {
  async getAllUsers(): Promise<User[]> {
    const db = await getDatabase();
    return await db.getAllAsync<User>(
      'SELECT id, nama, pin_hash, role, status_aktif, created_at FROM users ORDER BY status_aktif DESC, nama ASC;'
    );
  },

  async getActiveCashiers(): Promise<User[]> {
    const db = await getDatabase();
    return await db.getAllAsync<User>(
      "SELECT id, nama, pin_hash, role, status_aktif, created_at FROM users WHERE role = 'kasir' AND status_aktif = 1 ORDER BY nama ASC;"
    );
  },

  async loginCashier(userId: number, pin: string): Promise<User | null> {
    const db = await getDatabase();
    const user = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE id = ? AND status_aktif = 1;',
      [userId]
    );
    if (!user) return null;

    const isValid = await verifyPin(pin, user.pin_hash);
    if (isValid) {
      await this.logActivity(user.id, 'LOGIN_KASIR', `Kasir ${user.nama} berhasil login`);
      return user;
    }
    return null;
  },

  async loginAdmin(pin: string): Promise<User | null> {
    const db = await getDatabase();
    const adminUsers = await db.getAllAsync<User>(
      "SELECT * FROM users WHERE role = 'owner' AND status_aktif = 1;"
    );

    for (const admin of adminUsers) {
      const isValid = await verifyPin(pin, admin.pin_hash);
      if (isValid) {
        await this.logActivity(admin.id, 'LOGIN_ADMIN', `Admin/Owner ${admin.nama} berhasil login`);
        return admin;
      }
    }
    return null;
  },

  async isPinTaken(pin: string, excludeUserId?: number): Promise<boolean> {
    const db = await getDatabase();
    const targetHash = await hashPin(pin);
    let query = 'SELECT id FROM users WHERE pin_hash = ?';
    const params: any[] = [targetHash];

    if (excludeUserId) {
      query += ' AND id != ?';
      params.push(excludeUserId);
    }

    const row = await db.getFirstAsync<{ id: number }>(query, params);
    return !!row;
  },

  async createUser(nama: string, pin: string, role: UserRole, adminId: number): Promise<User> {
    const db = await getDatabase();
    const pinTaken = await this.isPinTaken(pin);
    if (pinTaken) {
      throw new Error('PIN ini sudah digunakan oleh karyawan lain. Harap gunakan PIN berbeda.');
    }

    const pin_hash = await hashPin(pin);
    const timestamp = formatCurrentTimestamp();
    const result = await db.runAsync(
      `INSERT INTO users (nama, pin_hash, role, status_aktif, created_at) VALUES (?, ?, ?, 1, ?);`,
      [nama.trim(), pin_hash, role, timestamp]
    );

    await this.logActivity(adminId, 'CREATE_USER', `Menambahkan user baru: ${nama} (${role})`);
    const newUser: User = {
      id: result.lastInsertRowId,
      nama: nama.trim(),
      pin_hash,
      role,
      status_aktif: 1,
      created_at: timestamp,
    };
    desktopSyncService.pushUserToDesktop(newUser).catch(() => {});
    return newUser;
  },

  async updateUser(
    id: number,
    nama: string,
    role: UserRole,
    newPin: string | null,
    adminId: number
  ): Promise<void> {
    const db = await getDatabase();

    if (newPin && newPin.trim().length >= 4) {
      const pinTaken = await this.isPinTaken(newPin, id);
      if (pinTaken) {
        throw new Error('PIN ini sudah digunakan oleh user lain. Harap pilih PIN yang unik.');
      }
      const pin_hash = await hashPin(newPin);
      await db.runAsync(
        `UPDATE users SET nama = ?, role = ?, pin_hash = ? WHERE id = ?;`,
        [nama.trim(), role, pin_hash, id]
      );
      await this.logActivity(adminId, 'UPDATE_USER', `Update user id ${id}: nama=${nama}, role=${role}, reset PIN`);
    } else {
      await db.runAsync(
        `UPDATE users SET nama = ?, role = ? WHERE id = ?;`,
        [nama.trim(), role, id]
      );
      await this.logActivity(adminId, 'UPDATE_USER', `Update user id ${id}: nama=${nama}, role=${role}`);
    }

    const updated = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?;', [id]);
    if (updated) {
      desktopSyncService.pushUserToDesktop(updated).catch(() => {});
    }
  },

  async toggleUserActive(id: number, status_aktif: number, adminId: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE users SET status_aktif = ? WHERE id = ?;', [status_aktif, id]);
    const updated = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?;', [id]);
    if (updated) {
      desktopSyncService.pushUserToDesktop(updated).catch(() => {});
    }
  },

  async deleteUser(id: number, adminId: number): Promise<void> {
    const db = await getDatabase();

    if (id === adminId) {
      throw new Error('Anda tidak dapat menghapus akun Anda sendiri.');
    }

    const target = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?;', [id]);
    if (!target) {
      throw new Error('Karyawan tidak ditemukan.');
    }

    if (target.role === 'owner') {
      const ownerCount = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'owner';"
      );
      if (ownerCount && ownerCount.count <= 1) {
        throw new Error('Tidak dapat menghapus satu-satunya akun Owner / Admin sistem.');
      }
    }

    // Check if user has an active/open shift
    const openShift = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM shifts WHERE kasir_id = ? AND status = 'open' LIMIT 1;",
      [id]
    );
    if (openShift) {
      throw new Error('Karyawan ini masih memiliki shift kasir aktif yang belum ditutup. Harap tutup shift terlebih dahulu.');
    }

    // Hapus referensi di tabel lain sebelum menghapus user.
    // PRAGMA foreign_keys tidak bisa diubah di dalam withTransactionAsync,
    // sehingga kita membersihkan data dependen terlebih dahulu.
    await runWithDbLock(async () => {
      // 1. Pindahkan kasir_id transaksi ke owner lain agar riwayat tetap ada
      await db.runAsync(
        `UPDATE transactions SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ?;`,
        [id, id]
      );

      // 2. Pindahkan kasir_id shifts yang sudah closed ke owner lain
      await db.runAsync(
        `UPDATE shifts SET kasir_id = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE kasir_id = ? AND status = 'closed';`,
        [id, id]
      );

      // 3. Hapus activity_logs milik user ini
      await db.runAsync('DELETE FROM activity_logs WHERE user_id = ?;', [id]);

      // 4. Pindahkan expenses ke owner lain agar tidak orphan
      await db.runAsync(
        `UPDATE expenses SET input_by = (SELECT id FROM users WHERE role = 'owner' AND id != ? LIMIT 1) WHERE input_by = ?;`,
        [id, id]
      );

      // 5. Simpan tombstone ke deleted_users agar tidak dibangkitkan lagi saat sync dari desktop
      await db.runAsync(
        'INSERT OR REPLACE INTO deleted_users (id, nama, deleted_at) VALUES (?, ?, ?);',
        [id, target.nama, new Date().toISOString()]
      );

      // 6. Baru hapus user
      await db.runAsync('DELETE FROM users WHERE id = ?;', [id]);
    });

    // Beritahu Desktop secara real-time / background bahwa karyawan ini telah dihapus
    desktopSyncService.pushDeleteUserToDesktop(id, target.nama).catch((err) => {
      console.warn('[authService] Gagal push hapus user ke desktop:', err);
    });

    await this.logActivity(
      adminId,
      'DELETE_USER',
      `Menghapus karyawan: ${target.nama} (ID: ${id}, Role: ${target.role})`
    );
  },

  async logActivity(userId: number, aksi: string, detail: string): Promise<void> {
    try {
      const db = await getDatabase();
      const timestamp = formatCurrentTimestamp();
      await db.runAsync(
        `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, ?, ?, ?);`,
        [userId, aksi, detail, timestamp]
      );
      desktopSyncService.pushLogToDesktop({
        user_id: userId,
        aksi,
        detail,
        timestamp,
      }).catch(() => {});
    } catch (e) {
      console.warn('Failed to record activity log:', e);
    }
  },

  async getActivityLogs(limit = 100): Promise<ActivityLog[]> {
    const db = await getDatabase();
    return await db.getAllAsync<ActivityLog>(
      `SELECT a.id, a.user_id, u.nama as user_name, a.aksi, a.detail, a.timestamp
       FROM activity_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.id DESC LIMIT ?;`,
      [limit]
    );
  },
};
