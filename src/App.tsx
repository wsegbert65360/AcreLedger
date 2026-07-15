import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";

import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { Auth } from "@/components/Auth";
import BottomNav from "@/components/BottomNav";
import CoachmarkOverlay from "@/components/CoachmarkOverlay";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";
import SeasonRolloverModal from "@/components/SeasonRolloverModal";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useCoachmarks } from "@/hooks/useCoachmarks";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { syncQueue } from "@/lib/syncQueue";
import { FarmProvider, useFarm } from "@/store/farmStore";
import { QuickAddProvider, useQuickAdd } from "@/context/QuickAddContext";
import QuickAddDialog from "@/components/QuickAddDialog";
import { native } from "@/lib/native";
import { Plus } from "lucide-react";

import PlantModal from "@/components/PlantModal";
import SprayModal from "@/components/SprayModal";
import HarvestModal from "@/components/HarvestModal";
import HayModal from "@/components/HayModal";
import FertilizerModal from "@/components/FertilizerModal";
import TillageModal from "@/components/TillageModal";
import CustomSprayModal from "@/components/CustomSprayModal";

import Activity from "./pages/Activity";
import FieldDetailScreen from "./pages/FieldDetailScreen";
import Index from "./pages/Index";
import Logistics from "./pages/Logistics";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import Weather from "./pages/Weather";

const queryClient = new QueryClient();

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const, // Cast to constant for Framer Motion types
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        <Routes location={location}>
          <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
          <Route path="/logistics" element={<ErrorBoundary><Logistics /></ErrorBoundary>} />
          <Route path="/activity" element={<ErrorBoundary><Activity /></ErrorBoundary>} />
          <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><Onboarding /></ErrorBoundary>} />
          <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
          <Route path="/weather" element={<ErrorBoundary><Weather /></ErrorBoundary>} />
          <Route path="/field/:id" element={<ErrorBoundary><FieldDetailScreen /></ErrorBoundary>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
};

const ModalMap = {
  plant: PlantModal,
  spray: SprayModal,
  customSpray: CustomSprayModal,
  harvest: HarvestModal,
  hay: HayModal,
  fertilizer: FertilizerModal,
  tillage: TillageModal,
};

const AppContent = () => {
  const { session, loading, isOnline, farm_id, fields, onboardingComplete, initialFetchComplete, fetchError } = useFarm();
  const { activeModal, selectedField, clearActiveModal, openQuickAdd } = useQuickAdd();
  const location = useLocation();
  const coachmarks = useCoachmarks({
    userId: session?.user?.id,
    enabled: !!session && onboardingComplete && location.pathname === '/'
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    const listenerPromise = CapApp.addListener('appStateChange', (state) => {
      if (!active) return;
      if (import.meta.env.DEV) console.log('App state changed:', state.isActive ? 'active' : 'inactive');
      if (state.isActive && isOnline && farm_id) {
        if (import.meta.env.DEV) console.log('App active, triggering sync queue replay.');
        syncQueue.replayQueue(farm_id);
      }
    });

    return () => {
      active = false;
      listenerPromise.then((handle) => handle.remove());
    };
  }, [isOnline, farm_id]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backListenerPromise = CapApp.addListener('backButton', () => {
      if (window.location.pathname === '/') {
        CapApp.minimizeApp();
      } else {
        window.history.back();
      }
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove());
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
          <img
            src="/icon-512.png"
            alt="AcreLedger Logo"
            className="relative w-24 h-24 rounded-2xl shadow-2xl border-2 border-primary/20 animate-pulse"
          />
        </div>
        <div className="mt-8 flex flex-col items-center gap-1">
          <h2 className="text-sm font-mono font-bold text-foreground uppercase tracking-[0.2em]">AcreLedger</h2>
          <div className="flex gap-1 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
          </div>
          <p className="text-xs text-muted-foreground animate-pulse mt-1">
            {!farm_id ? 'Connecting to your farm...' : 'Syncing records...'}
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  const onboardingKey = `${session.user.id}_al_onboarding_complete`;
  // Require the initial data load to settle before deciding onboarding. Without
  // this, the transient empty-fields render before fetchData resolves would
  // bounce an existing user (especially on a new device / cleared storage) into
  // /onboarding with no way back once their fields populate.
  const needsOnboarding =
    initialFetchComplete &&
    !fetchError &&
    !onboardingComplete &&
    !localStorage.getItem(onboardingKey) &&
    fields.length === 0;
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  const hideQuickAddFab =
    location.pathname === '/activity' ||
    location.pathname === '/logistics' ||
    location.pathname === '/reports' ||
    location.pathname === '/settings' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/privacy' ||
    location.pathname.startsWith('/field/');

  return (
    <>
      <OfflineBanner />
      <Sidebar />
      <div className="lg:pl-60 print:pl-0">
        <AnimatedRoutes />
      </div>
      <BottomNav />
      <SeasonRolloverModal />

      {/* Global Quick Add Dialog */}
      <QuickAddDialog />

      {/* Global Modals triggered from Quick Add */}
      {selectedField && (() => {
        const TargetModal = activeModal ? ModalMap[activeModal] : null;
        if (!TargetModal) return null;
        return (
          <TargetModal
            open={true}
            field={selectedField}
            onClose={clearActiveModal}
          />
        );
      })()}

      {/* Global Floating Action Button (FAB) for Mobile Quick Add */}
      {!hideQuickAddFab && (
        <button
          onClick={() => {
            native.haptic.light();
            openQuickAdd();
          }}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full border border-primary-foreground/20 bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.35)] transition-all hover:-translate-y-0.5 active:scale-95 lg:hidden"
          aria-label="Quick add record"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {coachmarks.isActive && coachmarks.currentStep && (
        <CoachmarkOverlay
          step={coachmarks.currentStep}
          stepIndex={coachmarks.stepIndex}
          totalSteps={coachmarks.totalSteps}
          onNext={coachmarks.next}
          onBack={coachmarks.back}
          onSkip={coachmarks.skip}
          isLast={coachmarks.stepIndex === coachmarks.totalSteps - 1}
        />
      )}
    </>
  );
};

const App = () => (
  <BrowserRouter>
    <ScrollToTop />
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="al-ui-theme">
        <TooltipProvider>
            <FarmProvider>
              <QuickAddProvider>
                <Sonner />
                <AppContent />
              </QuickAddProvider>
            </FarmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
