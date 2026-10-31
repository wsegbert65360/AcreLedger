import React, { createContext, useContext, useState } from 'react';

import { isAskBookEnabled } from '@/lib/askBookAccess';
import { useFarm } from '@/store/farmStore';

interface AskAcreLedgerContextType {
  isAskOpen: boolean;
  openAsk: () => void;
  closeAsk: () => void;
}

const AskAcreLedgerContext = createContext<AskAcreLedgerContextType | undefined>(undefined);

export const AskAcreLedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { farm_id } = useFarm();
  const enabled = isAskBookEnabled(farm_id);
  const [openFarmId, setOpenFarmId] = useState<string | null>(null);
  const isAskOpen = enabled && openFarmId === farm_id;

  const openAsk = () => {
    if (enabled) setOpenFarmId(farm_id);
  };
  const closeAsk = () => setOpenFarmId(null);

  return (
    <AskAcreLedgerContext.Provider value={{ isAskOpen, openAsk, closeAsk }}>
      {children}
    </AskAcreLedgerContext.Provider>
  );
};

export const useAskAcreLedger = () => {
  const context = useContext(AskAcreLedgerContext);
  if (!context) {
    throw new Error('useAskAcreLedger must be used within an AskAcreLedgerProvider');
  }
  return context;
};
