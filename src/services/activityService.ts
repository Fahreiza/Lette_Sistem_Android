import { getDatabase } from '../database/db';
import { ActivityLog } from '../types';

export const activityService = {
  /**
   * Mengambil riwayat log aktivitas pengguna dan audit sensitif
   */
  async getActivityLogs(limit = 150): Promise<ActivityLog[]> {
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
