import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, ToastItem } from '../../stores/toastStore';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react-native';

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getTheme = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: '#15803D',
          border: '#166534',
          iconBg: '#14532D',
          badgeText: 'BERHASIL',
          titleColor: '#FFFFFF',
          msgColor: '#DCFCE7',
          closeColor: '#BBF7D0',
          icon: <CheckCircle2 size={24} color="#FFFFFF" strokeWidth={2.5} />,
        };
      case 'error':
        return {
          bg: '#B91C1C',
          border: '#991B1B',
          iconBg: '#7F1D1D',
          badgeText: 'PERHATIKAN',
          titleColor: '#FFFFFF',
          msgColor: '#FEE2E2',
          closeColor: '#FECACA',
          icon: <AlertCircle size={24} color="#FFFFFF" strokeWidth={2.5} />,
        };
      case 'warning':
        return {
          bg: '#D97706',
          border: '#B45309',
          iconBg: '#92400E',
          badgeText: 'PERINGATAN',
          titleColor: '#FFFFFF',
          msgColor: '#FEF3C7',
          closeColor: '#FDE68A',
          icon: <AlertTriangle size={24} color="#FFFFFF" strokeWidth={2.5} />,
        };
      case 'info':
      default:
        return {
          bg: '#1D4ED8',
          border: '#1E40AF',
          iconBg: '#1E3A8A',
          badgeText: 'INFORMASI',
          titleColor: '#FFFFFF',
          msgColor: '#DBEAFE',
          closeColor: '#BFDBFE',
          icon: <Info size={24} color="#FFFFFF" strokeWidth={2.5} />,
        };
    }
  };

  const theme = getTheme();

  return (
    <Animated.View
      style={[
        styles.animatedWrapper,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.toastCard,
          {
            backgroundColor: theme.bg,
            borderColor: theme.border,
          },
        ]}
        onPress={() => onDismiss(toast.id)}
        activeOpacity={0.92}
      >
        <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
          {theme.icon}
        </View>

        <View style={styles.contentBox}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.titleColor }]}>
              {toast.title}
            </Text>
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>{theme.badgeText}</Text>
            </View>
          </View>
          {toast.message ? (
            <Text style={[styles.message, { color: theme.msgColor }]}>
              {toast.message}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => onDismiss(toast.id)}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={18} color={theme.closeColor} strokeWidth={2.5} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ToastContainer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { toasts, removeToast, clearAll } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <Modal
      visible={toasts.length > 0}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={clearAll}
    >
      <View
        style={[
          styles.modalOverlay,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 12) + 8,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.toastList} pointerEvents="box-none">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={removeToast} />
          ))}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toastList: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 10,
  },
  animatedWrapper: {
    width: '100%',
  },
  toastCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 25,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  contentBox: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
    flex: 1,
  },
  badgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 14,
  },
});
