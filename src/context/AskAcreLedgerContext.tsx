import React, { createContext, useContext, useState } from 'react';

interface AskAcreLedgerContextType {
  isAskOpen: boolean;
  openAsk: () => void;
  closeAsk: () => void;
}

const AskAcreLedgerContext = createContext<AskAcreLedgerContextType | undefined>(undefined);

export const AskAcreLedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAskOpen, setIsAskOpen] = useState(false);

  const openAsk = () => setIsAskOpen(true);
  const closeAsk = () => setIsAskOpen(false);

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
