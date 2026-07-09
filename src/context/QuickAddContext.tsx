import React, { createContext, useContext, useState } from 'react';
import { Field } from '@/types/farm';

export type QuickAddActivityType = 'plant' | 'spray' | 'customSpray' | 'fertilizer' | 'tillage' | 'harvest' | 'hay';

interface QuickAddContextType {
  isQuickAddOpen: boolean;
  preselectedType: QuickAddActivityType | null;
  activeModal: QuickAddActivityType | null;
  selectedField: Field | null;
  openQuickAdd: (defaultType?: QuickAddActivityType | null) => void;
  closeQuickAdd: () => void;
  setActiveModal: (type: QuickAddActivityType | null) => void;
  setSelectedField: (field: Field | null) => void;
  clearActiveModal: () => void;
}

const QuickAddContext = createContext<QuickAddContextType | undefined>(undefined);

export const QuickAddProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [preselectedType, setPreselectedType] = useState<QuickAddActivityType | null>(null);
  const [activeModal, setActiveModal] = useState<QuickAddActivityType | null>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);

  const openQuickAdd = (defaultType?: QuickAddActivityType | null) => {
    setPreselectedType(defaultType || null);
    setIsQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setIsQuickAddOpen(false);
    setPreselectedType(null);
  };

  const clearActiveModal = () => {
    setActiveModal(null);
    setSelectedField(null);
  };

  return (
    <QuickAddContext.Provider
      value={{
        isQuickAddOpen,
        preselectedType,
        activeModal,
        selectedField,
        openQuickAdd,
        closeQuickAdd,
        setActiveModal,
        setSelectedField,
        clearActiveModal,
      }}
    >
      {children}
    </QuickAddContext.Provider>
  );
};

export const useQuickAdd = () => {
  const context = useContext(QuickAddContext);
  if (!context) {
    throw new Error('useQuickAdd must be used within a QuickAddProvider');
  }
  return context;
};
