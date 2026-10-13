import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Delete } from 'lucide-react-native';

interface KeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  showClear?: boolean;
  showCashKeys?: boolean;
}

export const Keypad: React.FC<KeypadProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  showClear = true,
  showCashKeys = false,
}) => {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ...(showCashKeys
      ? [
          ['00', '0', '000'],
          [showClear ? 'C' : '', '', 'DEL'],
        ]
      : [
          [showClear ? 'C' : '', '0', 'DEL'],
        ]),
  ];

  return (
    <View style={styles.container}>
      {keys.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((k, colIndex) => {
            if (k === '') {
              return <View key={`empty-${rowIndex}-${colIndex}`} style={styles.emptyKey} />;
            }

            if (k === 'DEL') {
              return (
                <TouchableOpacity
                  key="del"
                  style={[styles.key, styles.specialKey]}
                  onPress={onBackspace}
                  activeOpacity={0.6}
                >
                  <Delete size={24} color="#64748B" />
                </TouchableOpacity>
              );
            }

            if (k === 'C') {
              return (
                <TouchableOpacity
                  key="clear"
                  style={[styles.key, styles.specialKey]}
                  onPress={onClear || onBackspace}
                  activeOpacity={0.6}
                >
                  <Text style={styles.clearKeyText}>C</Text>
                </TouchableOpacity>
              );
            }

            // Handle multi-digit keys (00, 000)
            if (k === '00' || k === '000') {
              return (
                <TouchableOpacity
                  key={`key-${k}`}
                  style={[styles.key, styles.multiDigitKey]}
                  onPress={() => onKeyPress(k)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.multiDigitKeyText}>{k}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={`key-${k}`}
                style={styles.key}
                onPress={() => onKeyPress(k)}
                activeOpacity={0.6}
              >
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    paddingVertical: 10,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  key: {
    flex: 1,
    minWidth: 0,
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyKey: {
    flex: 1,
    minWidth: 0,
    height: 58,
  },
  specialKey: {
    backgroundColor: '#F8FAFC',
  },
  multiDigitKey: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  multiDigitKeyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  clearKeyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
  },
});

