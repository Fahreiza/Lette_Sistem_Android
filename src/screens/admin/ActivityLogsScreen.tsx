import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ActivityLog } from '../../types';
import { activityService } from '../../services/activityService';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';
import { formatDateIndo } from '../../utils/formatters';
import { Header } from '../../components/common/Header';
import {
  Search,
  X,
  AlertOctagon,
  Package,
  ShoppingCart,
  Clock,
  User,
  ShieldCheck,
  Activity,
  Trash2,
  RefreshCw,
  FileText,
} from 'lucide-react-native';

type FilterCategory = 'all' | 'void' | 'stock' | 'shift' | 'expense';

export const ActivityLogsScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  const loadLogs = useCallback(async (syncFromDesktop = true, showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      if (syncFromDesktop) {
        await desktopSyncService.syncLogsFromDesktop().catch(() => {});
      }
      const data = await activityService.getActivityLogs(200);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadLogs(true, true);
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'logs') {
        loadLogs(false, false);
      }
    });
    return unsub;
  }, [loadLogs]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await activityService.getActivityLogs(200);
      setLogs(data);
    } catch (err) {
      console.error('Refresh logs error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by Category
    if (activeCategory === 'void') {
      result = result.filter((l) => l.aksi.toUpperCase().includes('VOID'));
    } else if (activeCategory === 'stock') {
      result = result.filter(
        (l) =>
          l.aksi.toUpperCase().includes('STOK') ||
          l.aksi.toUpperCase().includes('BELANJA') ||
          l.aksi.toUpperCase().includes('STOCK')
      );
    } else if (activeCategory === 'shift') {
      result = result.filter((l) => l.aksi.toUpperCase().includes('SHIFT'));
    } else if (activeCategory === 'expense') {
      result = result.filter(
        (l) =>
          l.aksi.toUpperCase().includes('EXPENSE') ||
          l.aksi.toUpperCase().includes('PENGELUARAN')
      );
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          (l.aksi && l.aksi.toLowerCase().includes(q)) ||
          (l.detail && l.detail.toLowerCase().includes(q)) ||
          (l.user_name && l.user_name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, activeCategory, searchQuery]);

  const getActionBadge = (aksi: string) => {
    const a = aksi.toUpperCase();
    if (a.includes('VOID')) {
      return {
        label: 'VOID TRANSAKSI',
        bgColor: '#FEF2F2',
        textColor: '#DC2626',
        borderColor: '#FECACA',
        icon: <AlertOctagon size={12} color="#DC2626" />,
      };
    }
    if (a.includes('BELANJA')) {
      return {
        label: 'BELANJA STOK',
        bgColor: '#EEF2FF',
        textColor: '#4F46E5',
        borderColor: '#C7D2FE',
        icon: <ShoppingCart size={12} color="#4F46E5" />,
      };
    }
    if (a.includes('STOK') || a.includes('STOCK')) {
      return {
        label: 'ADJUST STOK',
        bgColor: '#FFFBEB',
        textColor: '#D97706',
        borderColor: '#FDE68A',
        icon: <Package size={12} color="#D97706" />,
      };
    }
    if (a.includes('SHIFT_OPEN')) {
      return {
        label: 'BUKA SHIFT',
        bgColor: '#ECFDF5',
        textColor: '#059669',
        borderColor: '#A7F3D0',
        icon: <Clock size={12} color="#059669" />,
      };
    }
    if (a.includes('SHIFT_CLOSE')) {
      return {
        label: 'TUTUP SHIFT',
        bgColor: '#F1F5F9',
        textColor: '#475569',
        borderColor: '#CBD5E1',
        icon: <Clock size={12} color="#475569" />,
      };
    }
    if (a.includes('EXPENSE')) {
      return {
        label: 'PENGELUARAN',
        bgColor: '#FFF1F2',
        textColor: '#E11D48',
        borderColor: '#FECDD3',
        icon: <Trash2 size={12} color="#E11D48" />,
      };
    }
    return {
      label: aksi,
      bgColor: '#F8FAFC',
      textColor: '#64748B',
      borderColor: '#E2E8F0',
      icon: <Activity size={12} color="#64748B" />,
    };
  };

  const renderLogItem = ({ item }: { item: ActivityLog }) => {
    const badge = getActionBadge(item.aksi);

    return (
      <View style={styles.logCard}>
        {/* Card Header: Action Badge + Timestamp */}
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.actionBadge,
              {
                backgroundColor: badge.bgColor,
                borderColor: badge.borderColor,
              },
            ]}
          >
            {badge.icon}
            <Text style={[styles.actionBadgeText, { color: badge.textColor }]}>
              {badge.label}
            </Text>
          </View>
          <View style={styles.timePill}>
            <Clock size={10} color="#64748B" />
            <Text style={styles.timestampText}>{formatDateIndo(item.timestamp)}</Text>
          </View>
        </View>

        {/* Card Body: Details */}
        <Text style={styles.detailText}>{item.detail}</Text>

        {/* Card Footer: User attribution */}
        <View style={styles.cardFooter}>
          <View style={styles.userBadge}>
            <View style={styles.userAvatarSmall}>
              <User size={10} color="#D97706" />
            </View>
            <Text style={styles.userNameText}>{item.user_name || 'Kasir / Sistem'}</Text>
          </View>
          <Text style={styles.logIdText}>ID: #{item.id}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Log Aktivitas & Audit" onBack={onBack} />

      {/* Search & Filter Header */}
      <View style={styles.headerSection}>
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Search size={15} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari aksi, detail, atau nama kasir..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <X size={14} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Chips */}
        <View style={styles.categoryRow}>
          {[
            { key: 'all', label: 'Semua' },
            { key: 'void', label: 'Void Struk' },
            { key: 'stock', label: 'Stok & Belanja' },
            { key: 'shift', label: 'Shift' },
            { key: 'expense', label: 'Kas Keluar' },
          ].map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                onPress={() => setActiveCategory(cat.key as FilterCategory)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color="#D97706" />
          <Text style={styles.loadingText}>Memuat log audit...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#D97706']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FileText size={36} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Tidak ada log aktivitas</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || activeCategory !== 'all'
                  ? 'Tidak ditemukan riwayat log sesuai filter.'
                  : 'Belum ada catatan aktivitas sensitif.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  listContainer: {
    padding: 12,
    gap: 10,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timestampText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  detailText: {
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  userAvatarSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userNameText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  logIdText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 240,
  },
});
