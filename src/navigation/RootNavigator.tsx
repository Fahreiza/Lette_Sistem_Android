import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { PosScreen } from '../screens/pos/PosScreen';
import { TransactionHistoryScreen } from '../screens/transactions/TransactionHistoryScreen';
import { StockManagementScreen } from '../screens/inventory/StockManagementScreen';
import { ExpenseScreen } from '../screens/expenses/ExpenseScreen';
import { AdminHubScreen } from '../screens/admin/AdminHubScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { MenuManagementScreen } from '../screens/menu/MenuManagementScreen';
import { BestSellerScreen } from '../screens/reports/BestSellerScreen';

// Icons
import {
  ShoppingBag,
  Receipt,
  Package,
  DollarSign,
  LayoutGrid,
  LayoutDashboard,
  UtensilsCrossed,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs: React.FC = () => {
  const { isAdmin } = useAuthStore();
  const insets = useSafeAreaInsets();

  const bottomPadding = Math.max(insets.bottom, 8);
  const tabHeight = 60 + bottomPadding;

  return (
    <Tab.Navigator
      initialRouteName={isAdmin ? 'DashboardTab' : 'PosTab'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#D97706',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabHeight,
            paddingBottom: bottomPadding,
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {isAdmin ? (
        <>
          {/* Admin Tab 1: Dashboard */}
          <Tab.Screen
            name="DashboardTab"
            component={DashboardScreen}
            options={{
              tabBarLabel: 'Dashboard',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <LayoutDashboard size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Admin Tab 2: Menu (Menggantikan Kasir) */}
          <Tab.Screen
            name="MenuTab"
            component={MenuManagementScreen}
            options={{
              tabBarLabel: 'Menu',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <UtensilsCrossed size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Admin Tab 3: Riwayat Transaksi */}
          <Tab.Screen
            name="RiwayatTab"
            component={TransactionHistoryScreen}
            options={{
              tabBarLabel: 'Riwayat',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <Receipt size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Admin Tab 4: Stok Bahan */}
          <Tab.Screen
            name="StokTab"
            component={StockManagementScreen}
            options={{
              tabBarLabel: 'Stok',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <Package size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Admin Tab 5: Kelola */}
          <Tab.Screen
            name="KelolaTab"
            component={AdminHubScreen}
            options={{
              tabBarLabel: 'Kelola',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <LayoutGrid size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />
        </>
      ) : (
        <>
          {/* Kasir Tab 1: Kasir POS */}
          <Tab.Screen
            name="PosTab"
            component={PosScreen}
            options={{
              tabBarLabel: 'Kasir',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <ShoppingBag size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Kasir Tab 2: Riwayat Transaksi */}
          <Tab.Screen
            name="RiwayatTab"
            component={TransactionHistoryScreen}
            options={{
              tabBarLabel: 'Riwayat',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <Receipt size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Kasir Tab 3: Pengeluaran Kas */}
          <Tab.Screen
            name="PengeluaranTab"
            component={ExpenseScreen}
            options={{
              tabBarLabel: 'Pengeluaran',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <DollarSign size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Kasir Tab 4: Stok Bahan */}
          <Tab.Screen
            name="StokTab"
            component={StockManagementScreen}
            options={{
              tabBarLabel: 'Stok',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <Package size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />

          {/* Kasir Tab 5: Shift & Akun */}
          <Tab.Screen
            name="KelolaTab"
            component={AdminHubScreen}
            options={{
              tabBarLabel: 'Shift & Akun',
              tabBarIcon: ({ color, focused }) => (
                <View style={[styles.iconWrapper, focused && styles.iconActiveWrapper]}>
                  <LayoutGrid size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
                </View>
              ),
            }}
          />
        </>
      )}
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="PosScreen"
          component={PosScreen}
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="BestSellerScreen"
          component={BestSellerScreen}
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabItem: {
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  iconWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActiveWrapper: {
    backgroundColor: '#FEF3C7',
  },
});
