import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { User, UserRole, ActivityLog } from '../../types';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';
import { Header } from '../../components/common/Header';
import { formatDateIndo } from '../../utils/formatters';
import { showToast } from '../../stores/toastStore';
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  UserX,
  Trash2,
  AlertTriangle,
  Edit2,
  KeyRound,
  FileClock,
  X,
  Lock,
  Search,
  AlertOctagon,
  Package,
  Clock,
  Wallet,
  Activity,
  User as UserIcon,
  RefreshCw,
} from 'lucide-react-native';
import { desktopSyncService, subscribeToSyncEvents } from '../../services/desktopSyncService';

type LogCategory = 'all' | 'void' | 'stock' | 'shift' | 'expense';

export const EmployeeManagementScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<'employees' | 'logs'>('employees');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Employee search state
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Log filter state
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logCategory, setLogCategory] = useState<LogCategory>('all');

  // Form Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('kasir');
  const [formPin, setFormPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Confirmation Modals State
  const [statusConfirmUser, setStatusConfirmUser] = useState<{ user: User; nextStatus: number } | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);

  const { currentUser } = useAuthStore();

  const loadData = async () => {
    try {
      setLoading(true);
      const [uList, logList] = await Promise.all([
        authService.getAllUsers(),
        authService.getActivityLogs(150),
      ]);
      setUsers(uList);
      setLogs(logList);
    } catch (e) {
      console.error('Failed to load employee data:', e);
      showToast({ type: 'error', title: 'Error', message: 'Gagal memuat data karyawan.' });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToSyncEvents((event) => {
      if (event === 'users') {
        console.log('[EmployeeManagement] Live employee update received from Desktop, reloading...');
        loadData();
      }
    });
    return unsub;
  }, []);

  const handleSyncFromDesktop = async () => {
    try {
      setIsSyncing(true);
      const res = await desktopSyncService.syncUsersFromDesktop();
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Sinkron Sukses',
          message: `Berhasil menyinkronkan ${res.count || 0} akun karyawan dari PC Desktop.`,
        });
        await loadData();
      } else {
        showToast({
          type: 'error',
          title: 'Gagal Sinkron',
          message: res.error || 'Pastikan PC Desktop aktif dan terhubung.',
        });
      }
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal terhubung ke Desktop.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (logCategory === 'void') {
      result = result.filter((l) => l.aksi.toUpperCase().includes('VOID'));
    } else if (logCategory === 'stock') {
      result = result.filter(
        (l) =>
          l.aksi.toUpperCase().includes('STOK') ||
          l.aksi.toUpperCase().includes('BELANJA') ||
          l.aksi.toUpperCase().includes('STOCK')
      );
    } else if (logCategory === 'shift') {
      result = result.filter((l) => l.aksi.toUpperCase().includes('SHIFT'));
    } else if (logCategory === 'expense') {
      result = result.filter(
        (l) =>
          l.aksi.toUpperCase().includes('EXPENSE') ||
          l.aksi.toUpperCase().includes('PENGELUARAN')
      );
    }

    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.aksi.toLowerCase().includes(q) ||
          l.detail.toLowerCase().includes(q) ||
          (l.user_name && l.user_name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, logCategory, logSearchQuery]);

  const filteredUsers = useMemo(() => {
    if (!employeeSearch.trim()) return users;
    const q = employeeSearch.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.nama.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, employeeSearch]);

  const totalEmployees = users.length;
  const activeKasirCount = users.filter((u) => u.role === 'kasir' && u.status_aktif === 1).length;
  const adminCount = users.filter((u) => u.role === 'owner').length;

  const getLogBadge = (aksi: string) => {
    const a = aksi.toUpperCase();
    if (a.includes('VOID')) {
      return {
        label: 'VOID STRUK',
        bgColor: '#FEF2F2',
        textColor: '#DC2626',
        borderColor: '#FECACA',
        icon: <AlertOctagon size={11} color="#DC2626" />,
      };
    }
    if (a.includes('BELANJA') || a.includes('STOK')) {
      return {
        label: 'STOK / BELANJA',
        bgColor: '#EEF2FF',
        textColor: '#4F46E5',
        borderColor: '#C7D2FE',
        icon: <Package size={11} color="#4F46E5" />,
      };
    }
    if (a.includes('SHIFT')) {
      return {
        label: 'SHIFT KASIR',
        bgColor: '#ECFDF5',
        textColor: '#059669',
        borderColor: '#A7F3D0',
        icon: <Clock size={11} color="#059669" />,
      };
    }
    if (a.includes('PENGELUARAN') || a.includes('EXPENSE')) {
      return {
        label: 'KAS KELUAR',
        bgColor: '#FFF7ED',
        textColor: '#EA580C',
        borderColor: '#FFEDD5',
        icon: <Wallet size={11} color="#EA580C" />,
      };
    }
    return {
      label: aksi,
      bgColor: '#F1F5F9',
      textColor: '#475569',
      borderColor: '#E2E8F0',
      icon: <Activity size={11} color="#475569" />,
    };
  };

  const openAdd = () => {
    setEditingUser(null);
    setFormName('');
    setFormRole('kasir');
    setFormPin('');
    setModalVisible(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setFormName(u.nama);
    setFormRole(u.role);
    setFormPin('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    if (!formName.trim()) {
      showToast({ type: 'warning', title: 'Form Belum Lengkap', message: 'Nama karyawan wajib diisi.' });
      return;
    }

    if (!editingUser && (!formPin || formPin.trim().length < 4)) {
      showToast({ type: 'warning', title: 'PIN Wajib', message: 'PIN minimal 4 digit.' });
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingUser) {
        await authService.updateUser(
          editingUser.id,
          formName.trim(),
          formRole,
          formPin.trim().length >= 4 ? formPin.trim() : null,
          currentUser.id
        );
        showToast({ type: 'success', title: 'Sukses', message: 'Data karyawan berhasil diperbarui.' });
      } else {
        await authService.createUser(
          formName.trim(),
          formPin.trim(),
          formRole,
          currentUser.id
        );
        showToast({ type: 'success', title: 'Sukses', message: 'Karyawan baru berhasil didaftarkan.' });
      }

      setModalVisible(false);
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal', message: e?.message || 'Terjadi kesalahan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = (u: User) => {
    if (!currentUser) return;
    if (u.id === currentUser.id) {
      showToast({ type: 'warning', title: 'Perhatian', message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
      return;
    }

    const nextStatus = u.status_aktif === 1 ? 0 : 1;
    setStatusConfirmUser({ user: u, nextStatus });
  };

  const handleConfirmToggleStatus = async () => {
    if (!currentUser || !statusConfirmUser) return;
    const { user, nextStatus } = statusConfirmUser;
    try {
      setIsSubmitting(true);
      await authService.toggleUserActive(user.id, nextStatus, currentUser.id);
      showToast({
        type: 'info',
        title: 'Status Diperbarui',
        message: `Akun ${user.nama} berhasil ${nextStatus === 1 ? 'diaktifkan' : 'dinonaktifkan'}.`,
      });
      setStatusConfirmUser(null);
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Error', message: e?.message || 'Gagal mengubah status.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!currentUser || !deleteConfirmUser) return;
    try {
      setIsSubmitting(true);
      await authService.deleteUser(deleteConfirmUser.id, currentUser.id);
      showToast({
        type: 'success',
        title: 'Karyawan Dihapus',
        message: `Akun ${deleteConfirmUser.nama} berhasil dihapus dari sistem.`,
      });
      setDeleteConfirmUser(null);
      loadData();
    } catch (e: any) {
      showToast({ type: 'error', title: 'Gagal Menghapus', message: e?.message || 'Gagal menghapus karyawan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Kelola Karyawan" onBack={onBack} />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'employees' && styles.tabBtnActive]}
          onPress={() => setActiveTab('employees')}
        >
          <Users size={16} color={activeTab === 'employees' ? '#D97706' : '#64748B'} />
          <Text style={[styles.tabBtnText, activeTab === 'employees' && styles.tabBtnTextActive]}>
            Daftar Karyawan ({users.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'logs' && styles.tabBtnActive]}
          onPress={() => setActiveTab('logs')}
        >
          <FileClock size={16} color={activeTab === 'logs' ? '#D97706' : '#64748B'} />
          <Text style={[styles.tabBtnText, activeTab === 'logs' && styles.tabBtnTextActive]}>
            Log Aktivitas Sensitif
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 40 }} />
      ) : activeTab === 'employees' ? (
        <ScrollView
          contentContainerStyle={styles.scrollList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
          }
        >
          {/* Top Quick Stats KPI */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Users size={16} color="#475569" />
              </View>
              <Text style={styles.kpiValue}>{totalEmployees}</Text>
              <Text style={styles.kpiLabel}>Total Akun</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#DCFCE7' }]}>
                <UserCheck size={16} color="#16A34A" />
              </View>
              <Text style={[styles.kpiValue, { color: '#15803D' }]}>{activeKasirCount}</Text>
              <Text style={styles.kpiLabel}>Kasir Aktif</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Shield size={16} color="#DC2626" />
              </View>
              <Text style={[styles.kpiValue, { color: '#B91C1C' }]}>{adminCount}</Text>
              <Text style={styles.kpiLabel}>Owner / Admin</Text>
            </View>
          </View>

          {/* Search Box & Action Controls */}
          <View style={styles.actionBar}>
            <View style={styles.searchBox}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama karyawan..."
                placeholderTextColor="#94A3B8"
                value={employeeSearch}
                onChangeText={setEmployeeSearch}
              />
              {employeeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setEmployeeSearch('')} style={{ padding: 4 }}>
                  <X size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={handleSyncFromDesktop}
                disabled={isSyncing}
                activeOpacity={0.7}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#0284C7" />
                ) : (
                  <RefreshCw size={13} color="#0284C7" />
                )}
                <Text style={styles.syncBtnText}>Sinkron PC</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.7}>
                <UserPlus size={14} color="#FFFFFF" />
                <Text style={styles.addBtnText}>+ Karyawan</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Employee Cards List */}
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyUserState}>
              <Users size={40} color="#CBD5E1" />
              <Text style={styles.emptyUserTitle}>Tidak ada data karyawan</Text>
              <Text style={styles.emptyUserSub}>
                {employeeSearch
                  ? 'Tidak ditemukan karyawan yang sesuai kata kunci pencarian.'
                  : 'Belum ada akun karyawan yang terdaftar.'}
              </Text>
            </View>
          ) : (
            filteredUsers.map((u) => {
              const isOwner = u.role === 'owner';
              const isActive = u.status_aktif === 1;

              return (
                <View
                  key={`user-${u.id}`}
                  style={[styles.userCard, !isActive && styles.userCardInactive]}
                >
                  <View style={styles.userMain}>
                    <View style={[styles.userAvatar, isOwner ? styles.avatarOwner : styles.avatarKasir]}>
                      {isOwner ? (
                        <Shield size={22} color="#DC2626" />
                      ) : (
                        <UserCheck size={22} color="#D97706" />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.userName, !isActive && styles.textMuted]}>
                          {u.nama}
                        </Text>
                        <View style={[styles.roleBadge, isOwner ? styles.ownerBadge : styles.kasirBadge]}>
                          <Text style={[styles.roleText, isOwner ? styles.ownerRoleText : styles.kasirRoleText]}>
                            {isOwner ? 'OWNER / ADMIN' : 'KASIR POS'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.metaRow}>
                        <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotInactive]} />
                        <Text style={styles.userMeta}>
                          {isActive ? 'Aktif' : 'Nonaktif (Dilarang Login)'} • Didaftarkan: {formatDateIndo(u.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.userActionRow}>
                    <View style={styles.userButtonsGroup}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => openEdit(u)}
                        activeOpacity={0.7}
                      >
                        <Edit2 size={12} color="#0369A1" />
                        <Text style={styles.editBtnText}>Edit PIN & Role</Text>
                      </TouchableOpacity>

                      {u.id !== currentUser?.id && (
                        <TouchableOpacity
                          style={styles.deleteUserBtn}
                          onPress={() => setDeleteConfirmUser(u)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={12} color="#DC2626" />
                          <Text style={styles.deleteUserBtnText}>Hapus</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Status:</Text>
                      <Switch
                        value={isActive}
                        onValueChange={() => handleToggleStatus(u)}
                        thumbColor={isActive ? '#16A34A' : '#94A3B8'}
                        trackColor={{ true: '#BBF7D0', false: '#E2E8F0' }}
                        disabled={u.id === currentUser?.id}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        /* Activity Logs View */
        <View style={{ flex: 1 }}>
          {/* Search Box */}
          <View style={styles.logSearchContainer}>
            <View style={styles.logSearchBox}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                style={styles.logSearchInput}
                placeholder="Cari aksi, detail, atau eksekutor..."
                placeholderTextColor="#94A3B8"
                value={logSearchQuery}
                onChangeText={setLogSearchQuery}
              />
              {logSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setLogSearchQuery('')} style={{ padding: 4 }}>
                  <X size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category Chips */}
          <View style={styles.logCategoryContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.logCategoryScroll}
            >
              {[
                { key: 'all', label: 'Semua' },
                { key: 'void', label: 'Void Struk' },
                { key: 'stock', label: 'Stok & Belanja' },
                { key: 'shift', label: 'Shift Kasir' },
                { key: 'expense', label: 'Kas Keluar' },
              ].map((cat) => {
                const isActive = logCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.logChip, isActive && styles.logChipActive]}
                    onPress={() => setLogCategory(cat.key as LogCategory)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.logChipText, isActive && styles.logChipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Log List */}
          <ScrollView
            contentContainerStyle={styles.scrollList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
            }
          >
            {filteredLogs.length === 0 ? (
              <View style={styles.emptyLogState}>
                <FileClock size={40} color="#CBD5E1" />
                <Text style={styles.emptyLogTitle}>Tidak ada log aktivitas</Text>
                <Text style={styles.emptyLogSub}>
                  {logSearchQuery
                    ? 'Tidak ditemukan catatan yang sesuai pencarian.'
                    : 'Belum ada aktivitas sensitif tercatat.'}
                </Text>
              </View>
            ) : (
              filteredLogs.map((l) => {
                const badge = getLogBadge(l.aksi);
                return (
                  <View key={`log-${l.id}`} style={styles.logCardEnhanced}>
                    <View style={styles.logHeaderEnhanced}>
                      <View
                        style={[
                          styles.badgePill,
                          { backgroundColor: badge.bgColor, borderColor: badge.borderColor },
                        ]}
                      >
                        {badge.icon}
                        <Text style={[styles.badgePillText, { color: badge.textColor }]}>
                          {badge.label}
                        </Text>
                      </View>
                      <Text style={styles.logTimeEnhanced}>{formatDateIndo(l.timestamp)}</Text>
                    </View>

                    <Text style={styles.logDetailEnhanced}>{l.detail}</Text>

                    <View style={styles.logFooterEnhanced}>
                      <UserIcon size={12} color="#64748B" />
                      <Text style={styles.logUserEnhanced}>
                        Eksekutor:{' '}
                        <Text style={{ fontWeight: '700', color: '#1E293B' }}>
                          {l.user_name || 'System'}
                        </Text>
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* Add / Edit Employee Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.modalHeaderIcon, editingUser?.role === 'owner' ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#FEF3C7' }]}>
                  {editingUser?.role === 'owner' ? (
                    <Shield size={18} color="#DC2626" />
                  ) : (
                    <UserPlus size={18} color="#D97706" />
                  )}
                </View>
                <Text style={styles.modalTitle}>
                  {editingUser ? `Edit: ${editingUser.nama}` : 'Tambah Karyawan Baru'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={styles.label}>Nama Lengkap Karyawan</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Rian Anggara"
                placeholderTextColor="#94A3B8"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.label}>Pilih Hak Akses / Role Karyawan</Text>
              <View style={styles.roleOptionsGrid}>
                {/* Kasir Card */}
                <TouchableOpacity
                  style={[
                    styles.roleCard,
                    formRole === 'kasir' && styles.roleCardActiveKasir,
                  ]}
                  onPress={() => setFormRole('kasir')}
                  activeOpacity={0.8}
                >
                  <View style={styles.roleCardTop}>
                    <View
                      style={[
                        styles.roleIconBadge,
                        formRole === 'kasir' ? styles.roleIconBadgeKasir : styles.roleIconBadgeInactive,
                      ]}
                    >
                      <UserCheck size={18} color={formRole === 'kasir' ? '#D97706' : '#64748B'} />
                    </View>
                    <View
                      style={[
                        styles.roleRadioCircle,
                        formRole === 'kasir' && styles.roleRadioCircleActiveKasir,
                      ]}
                    >
                      {formRole === 'kasir' && <View style={styles.roleRadioInnerKasir} />}
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.roleCardTitle,
                      formRole === 'kasir' && styles.roleCardTitleActiveKasir,
                    ]}
                  >
                    Kasir
                  </Text>
                  <Text style={styles.roleCardDesc}>
                    Akses penjualan POS, transaksi & cetak struk
                  </Text>

                  <View style={[styles.roleTag, formRole === 'kasir' && styles.roleTagActiveKasir]}>
                    <Text style={[styles.roleTagText, formRole === 'kasir' && styles.roleTagTextKasir]}>
                      POS Kasir
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Admin / Owner Card */}
                <TouchableOpacity
                  style={[
                    styles.roleCard,
                    formRole === 'owner' && styles.roleCardActiveOwner,
                  ]}
                  onPress={() => setFormRole('owner')}
                  activeOpacity={0.8}
                >
                  <View style={styles.roleCardTop}>
                    <View
                      style={[
                        styles.roleIconBadge,
                        formRole === 'owner' ? styles.roleIconBadgeOwner : styles.roleIconBadgeInactive,
                      ]}
                    >
                      <Shield size={18} color={formRole === 'owner' ? '#DC2626' : '#64748B'} />
                    </View>
                    <View
                      style={[
                        styles.roleRadioCircle,
                        formRole === 'owner' && styles.roleRadioCircleActiveOwner,
                      ]}
                    >
                      {formRole === 'owner' && <View style={styles.roleRadioInnerOwner} />}
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.roleCardTitle,
                      formRole === 'owner' && styles.roleCardTitleActiveOwner,
                    ]}
                  >
                    Admin / Owner
                  </Text>
                  <Text style={styles.roleCardDesc}>
                    Akses penuh menu, stok, laporan & karyawan
                  </Text>

                  <View style={[styles.roleTag, formRole === 'owner' && styles.roleTagActiveOwner]}>
                    <Text style={[styles.roleTagText, formRole === 'owner' && styles.roleTagTextOwner]}>
                      Semua Akses
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                {editingUser ? 'Reset PIN (Kosongkan jika tidak diganti)' : 'Set PIN Awal (4-6 Digit Angka)'}
              </Text>
              <TextInput
                style={[styles.input, { letterSpacing: 4, fontWeight: '700' }]}
                placeholder="••••"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                secureTextEntry
                maxLength={6}
                value={formPin}
                onChangeText={setFormPin}
              />
              <Text style={styles.pinHint}>
                {editingUser
                  ? 'Ketik 4-6 digit angka baru jika ingin mengubah PIN login kasir ini.'
                  : 'PIN ini digunakan oleh karyawan saat login di aplikasi kasir.'}
              </Text>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSave}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingUser ? 'Perbarui Karyawan' : 'Simpan Karyawan'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Status Toggle Modal */}
      <Modal visible={!!statusConfirmUser} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View
              style={[
                styles.confirmIconContainer,
                statusConfirmUser?.nextStatus === 1 ? styles.confirmIconSuccess : styles.confirmIconWarning,
              ]}
            >
              {statusConfirmUser?.nextStatus === 1 ? (
                <UserCheck size={28} color="#16A34A" />
              ) : (
                <UserX size={28} color="#D97706" />
              )}
            </View>

            <Text style={styles.confirmTitle}>
              {statusConfirmUser?.nextStatus === 1 ? 'Aktifkan Akun?' : 'Nonaktifkan Akun?'}
            </Text>

            <Text style={styles.confirmMessage}>
              {statusConfirmUser?.nextStatus === 1
                ? `Akun ${statusConfirmUser?.user.nama} akan diaktifkan kembali dan dapat masuk ke aplikasi kasir.`
                : `Akun ${statusConfirmUser?.user.nama} akan dinonaktifkan sementara dan tidak dapat masuk ke aplikasi kasir.`}
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setStatusConfirmUser(null)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmSubmitBtn,
                  statusConfirmUser?.nextStatus === 1 ? styles.confirmSubmitSuccess : styles.confirmSubmitWarning,
                ]}
                onPress={handleConfirmToggleStatus}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmSubmitText}>
                    {statusConfirmUser?.nextStatus === 1 ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Delete Confirmation Modal */}
      <Modal visible={!!deleteConfirmUser} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View style={[styles.confirmIconContainer, styles.confirmIconDanger]}>
              <Trash2 size={28} color="#DC2626" />
            </View>

            <Text style={styles.confirmTitle}>Hapus Akun Karyawan?</Text>

            <Text style={styles.confirmMessage}>
              Apakah Anda yakin ingin menghapus akun{' '}
              <Text style={{ fontWeight: '700', color: '#0F172A' }}>{deleteConfirmUser?.nama}</Text>{' '}
              secara permanen?
            </Text>

            <View style={styles.warningPill}>
              <AlertTriangle size={14} color="#DC2626" />
              <Text style={styles.warningPillText}>
                Riwayat transaksi masa lalu tetap aman, namun akun tidak dapat dipulihkan lagi.
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setDeleteConfirmUser(null)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmSubmitBtn, styles.confirmSubmitDanger]}
                onPress={handleConfirmDeleteUser}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmSubmitText}>Hapus Permanen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBtnActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  scrollList: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  syncBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyUserState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyUserTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptyUserSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  userCardInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.7,
  },
  userMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarKasir: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  avatarOwner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  textMuted: {
    color: '#64748B',
  },
  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kasirBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ownerBadge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  roleText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  kasirRoleText: {
    color: '#B45309',
  },
  ownerRoleText: {
    color: '#B91C1C',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: '#16A34A',
  },
  statusDotInactive: {
    backgroundColor: '#94A3B8',
  },
  userMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  userActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  logTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  logDetail: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
    marginTop: 2,
  },
  logUser: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    paddingTop: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  roleOptionsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  roleCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roleCardActiveKasir: {
    borderColor: '#D97706',
    backgroundColor: '#FFFDF7',
  },
  roleCardActiveOwner: {
    borderColor: '#DC2626',
    backgroundColor: '#FFF8F8',
  },
  roleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleIconBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  roleIconBadgeKasir: {
    backgroundColor: '#FEF3C7',
  },
  roleIconBadgeOwner: {
    backgroundColor: '#FEE2E2',
  },
  roleRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleRadioCircleActiveKasir: {
    borderColor: '#D97706',
  },
  roleRadioCircleActiveOwner: {
    borderColor: '#DC2626',
  },
  roleRadioInnerKasir: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  roleRadioInnerOwner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  roleCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 2,
  },
  roleCardTitleActiveKasir: {
    color: '#92400E',
  },
  roleCardTitleActiveOwner: {
    color: '#991B1B',
  },
  roleCardDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
    marginBottom: 8,
    minHeight: 28,
  },
  roleTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  roleTagActiveKasir: {
    backgroundColor: '#FEF3C7',
  },
  roleTagActiveOwner: {
    backgroundColor: '#FEE2E2',
  },
  roleTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  roleTagTextKasir: {
    color: '#B45309',
  },
  roleTagTextOwner: {
    color: '#DC2626',
  },
  submitBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHint: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginBottom: 16,
  },

  // Enhanced Logs UI styles
  logSearchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  logSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  logSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  logCategoryContainer: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  logCategoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  logChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  logChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  logChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyLogState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyLogTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptyLogSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  logCardEnhanced: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  logHeaderEnhanced: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logTimeEnhanced: {
    fontSize: 11,
    color: '#94A3B8',
  },
  logDetailEnhanced: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 18,
    fontWeight: '500',
  },
  logFooterEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  logUserEnhanced: {
    fontSize: 11,
    color: '#64748B',
  },

  // User Actions Buttons
  userButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  deleteUserBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Custom Confirmation Modals
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmIconSuccess: {
    backgroundColor: '#DCFCE7',
  },
  confirmIconWarning: {
    backgroundColor: '#FEF3C7',
  },
  confirmIconDanger: {
    backgroundColor: '#FEE2E2',
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 18,
    width: '100%',
  },
  warningPillText: {
    flex: 1,
    fontSize: 11.5,
    color: '#991B1B',
    lineHeight: 16,
    fontWeight: '500',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmSubmitBtn: {
    flex: 1.3,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSubmitSuccess: {
    backgroundColor: '#16A34A',
  },
  confirmSubmitWarning: {
    backgroundColor: '#D97706',
  },
  confirmSubmitDanger: {
    backgroundColor: '#DC2626',
  },
  confirmSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
