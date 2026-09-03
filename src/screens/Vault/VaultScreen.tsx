// src/screens/Vault/VaultScreen.tsx
import React from 'react';
import { useVaultStore } from '../../store/vaultStore';
import { VaultPinScreen } from './VaultPinScreen';
import { VaultDashboardScreen } from './VaultDashboardScreen';

export const VaultScreen = ({ route, navigation }: any) => {
  const { isUnlocked } = useVaultStore();

  // Bramka bezpieczeństwa - jeśli nie odblokowano, rzucamy ekranem PIN
  if (!isUnlocked) {
    return <VaultPinScreen />;
  }

  // Jeśli odblokowano, wpuszczamy do Dashboardu
  return <VaultDashboardScreen route={route} navigation={navigation} />;
};