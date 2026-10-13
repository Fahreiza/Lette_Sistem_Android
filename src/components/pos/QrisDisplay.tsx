import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Path, G } from 'react-native-svg';
import { formatIDR } from '../../utils/formatters';
import { ShieldCheck, Smartphone } from 'lucide-react-native';

interface QrisDisplayProps {
  total: number;
  storeName?: string;
  isCompact?: boolean;
}

/**
 * Deterministic generator for realistic QR matrix pattern
 */
function generateQrMatrix(size: number, seedStr: string): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  // Helper to draw Finder Pattern (7x7)
  const drawFinderPattern = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[r0 + r][c0 + c] = true;
        } else {
          matrix[r0 + r][c0 + c] = false;
        }
      }
    }
  };

  // 3 Finder patterns
  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Pseudo-random data filling based on seedStr hash
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) & 0xffffffff;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder zones & timing lines
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      const inTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        matrix[r][c] = hash % 3 === 0 || (r + c) % 3 === 0;
      }
    }
  }

  return matrix;
}

export const QrisDisplay: React.FC<QrisDisplayProps> = ({
  total,
  storeName = 'LETTE ROTI BAKAR',
  isCompact = false,
}) => {
  const matrixSize = 25;
  const matrix = React.useMemo(
    () => generateQrMatrix(matrixSize, `${storeName}-${total}-QRIS-ID`),
    [storeName, total]
  );

  const qrPixelSize = isCompact ? 130 : 160;
  const cellSize = qrPixelSize / matrixSize;

  return (
    <View style={[styles.card, isCompact && styles.cardCompact]}>
      {/* Top QRIS Official Header */}
      <View style={styles.qrisHeader}>
        <View style={styles.qrisLogoBadge}>
          <Text style={styles.qrisLogoText}>QRIS</Text>
        </View>
        <Text style={styles.qrisHeaderSub}>PEMBAYARAN DIGITAL NASIONAL</Text>
      </View>

      {/* Merchant Details */}
      <View style={styles.merchantSection}>
        <Text style={styles.merchantName} numberOfLines={1}>
          {storeName.toUpperCase()}
        </Text>
        <Text style={styles.merchantNmid}>NMID: ID1024395820491 • A01</Text>
      </View>

      {/* QR Code Container */}
      <View style={styles.qrWrapper}>
        <Svg width={qrPixelSize} height={qrPixelSize} viewBox={`0 0 ${qrPixelSize} ${qrPixelSize}`}>
          {/* Background white */}
          <Rect width={qrPixelSize} height={qrPixelSize} fill="#FFFFFF" />
          {/* Black QR Cells */}
          {matrix.map((row, r) =>
            row.map((active, c) => {
              if (!active) return null;
              return (
                <Rect
                  key={`cell-${r}-${c}`}
                  x={c * cellSize}
                  y={r * cellSize}
                  width={cellSize + 0.3}
                  height={cellSize + 0.3}
                  fill="#0F172A"
                />
              );
            })
          )}
        </Svg>
      </View>

      {/* Amount Callout */}
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>NOMINAL TRANSAKSI</Text>
        <Text style={styles.amountValue}>{formatIDR(total)}</Text>
      </View>

      {/* Supported Payment Logos / Notice */}
      <View style={styles.appsRow}>
        <Smartphone size={13} color="#64748B" />
        <Text style={styles.appsText}>
          BCA • Mandiri • BRI • BNI • GoPay • OVO • Dana • ShopeePay
        </Text>
      </View>

      <View style={styles.securityNote}>
        <ShieldCheck size={13} color="#16A34A" />
        <Text style={styles.securityText}>Verifikasi otomatis & aman berstandar Bank Indonesia</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    paddingBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardCompact: {
    paddingBottom: 10,
  },
  qrisHeader: {
    width: '100%',
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  qrisLogoBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  qrisLogoText: {
    color: '#DC2626',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  qrisHeaderSub: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  merchantSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  merchantNmid: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  qrWrapper: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  amountBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginVertical: 8,
    width: '88%',
  },
  amountLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.4,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 1,
  },
  appsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  appsText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  securityText: {
    fontSize: 9.5,
    color: '#16A34A',
    fontWeight: '600',
  },
});
