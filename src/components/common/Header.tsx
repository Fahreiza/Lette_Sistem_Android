import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { shiftService } from '../../services/shiftService';
import { LogOut, User, ShieldCheck, ArrowLeft, AlertTriangle } from 'lucide-react-native';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showUserInfo?: boolean;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Kasir',
  subtitle,
  showUserInfo = true,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, logout, isAdmin } = useAuthStore();

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [shiftWarningVisible, setShiftWarningVisible] = useState(false);
  const [shiftOwnerName, setShiftOwnerName] = useState('');

  const handleLogoutPress = async () => {
    if (currentUser?.role === 'kasir') {
      try {
        const activeShift = await shiftService.getActiveShift(currentUser.id);
        if (activeShift) {
          setShiftOwnerName(activeShift.kasir_nama || '');
          setShiftWarningVisible(true);
          return;
        }
      } catch (e) {
        console.warn('Shift check error:', e);
      }
    }
    setLogoutModalVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
      <View style={styles.titleContainer}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={18} color="#0F172A" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {showUserInfo && currentUser && (
        <View style={styles.rightContainer}>
          <View style={[styles.userBadge, isAdmin ? styles.userBadgeAdmin : styles.userBadgeKasir]}>
            <View style={[styles.avatarCircle, isAdmin ? styles.avatarAdmin : styles.avatarKasir]}>
              {isAdmin ? (
                <ShieldCheck size={13} color="#DC2626" />
              ) : (
                <User size={13} color="#D97706" />
              )}
            </View>
            <Text style={styles.userName} numberOfLines={1}>
              {currentUser.nama.split(' ')[0]}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogoutPress}
            activeOpacity={0.7}
            accessibilityLabel="Keluar"
          >
            <LogOut size={15} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Logout Confirm Modal */}
      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.logoutIconWrap}>
              <LogOut size={28} color="#7C3AED" />
            </View>
            <Text style={styles.confirmTitle}>Keluar Akun?</Text>
            <Text style={styles.confirmMsg}>
              Apakah Anda yakin ingin keluar{'\n'}dari akun ini?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setLogoutModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={() => { setLogoutModalVisible(false); logout(); }}
                activeOpacity={0.85}
              >
                <LogOut size={14} color="#fff" />
                <Text style={styles.logoutConfirmText}>Keluar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Shift Warning Modal */}
      <Modal visible={shiftWarningVisible} transparent animationType="fade" onRequestClose={() => setShiftWarningVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.warnIconWrap}>
              <AlertTriangle size={28} color="#D97706" />
            </View>
            <Text style={styles.confirmTitle}>Shift Masih Aktif</Text>
            <Text style={styles.confirmMsg}>
              Shift kasir <Text style={{ fontWeight: '800', color: '#1E293B' }}>({shiftOwnerName})</Text> masih aktif!{'\n'}
              Kasir wajib melakukan tutup shift sebelum logout.
            </Text>
            <TouchableOpacity
              style={[styles.logoutConfirmBtn, { backgroundColor: '#D97706', width: '100%' }]}
              onPress={() => setShiftWarningVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.logoutConfirmText}>Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  userBadgeKasir: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  userBadgeAdmin: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  avatarCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarKasir: {
    backgroundColor: '#FEF3C7',
  },
  avatarAdmin: {
    backgroundColor: '#FEE2E2',
  },
  userName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    maxWidth: 70,
  },
  logoutButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // --- Modal styles ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    marginHorizontal: 32,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  logoutIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    borderWidth: 2,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  warnIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmMsg: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  logoutConfirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
