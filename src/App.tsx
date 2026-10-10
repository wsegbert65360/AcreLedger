import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";

import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { motion } from "framer-motion";

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
import { supabase } from "@/lib/supabase";
import { FarmProvider, useFarm } from "@/store/farmStore";
import { AskAcreLedgerProvider } from "@/context/AskAcreLedgerContext";
import { QuickAddProvider, useQuickAdd } from "@/context/QuickAddContext";
import AskAcreLedger from "@/components/AskAcreLedger";
import QuickAddDialog from "@/components/QuickAddDialog";
import { native } from "@/lib/native";
import { establishWebPasswordRecoverySession, listenForNativePasswordRecovery } from "@/lib/authDeepLinks";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { isEquipmentUiEnabled } from "@/lib/equipment/feature";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";

const PlantModal = lazy(() => import("@/components/PlantModal"));
const SprayModal = lazy(() => import("@/components/SprayModal"));
const HarvestModal = lazy(() => import("@/components/HarvestModal"));
const HayModal = lazy(() => import("@/components/HayModal"));
const FertilizerModal = lazy(() => import("@/components/FertilizerModal"));
const TillageModal = lazy(() => import("@/components/TillageModal"));
const CustomSprayModal = lazy(() => import("@/components/CustomSprayModal"));
const Activity = lazy(() => import("./pages/Activity"));
const Equipment = lazy(() => import("./pages/Equipment"));
const FieldDetailScreen = lazy(() => import("./pages/FieldDetailScreen"));
const Index = lazy(() => import("./pages/Index"));
const Logistics = lazy(() => import("./pages/Logistics"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Weather = lazy(() => import("./pages/Weather"));

const queryClient = new QueryClient();
const PASSWORD_RECOVERY_PENDING_STORAGE_KEY = 'al_password_recovery_pending';

function getPasswordRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_PENDING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setStoredPasswordRecoveryPending(pending: boolean): void {
  try {
    if (pending) {
      sessionStorage.setItem(PASSWORD_RECOVERY_PENDING_STORAGE_KEY, 'true');
    } else {
      sessionStorage.removeItem(PASSWORD_RECOVERY_PENDING_STORAGE_KEY);
    }
  } catch {
    // Private browsing or a disabled storage surface should not block recovery.
  }
}

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
};

const pageTransition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1] as const, // Cast to constant for Framer Motion types
};

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    <span className="sr-only">Loading…</span>
  </div>
);

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
    <motion.div
      key={location.pathname}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={pageTransition}
    >
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route path="/logistics" element={<ErrorBoundary><Logistics /></ErrorBoundary>} />
          <Route path="/activity" element={<ErrorBoundary><Activity /></ErrorBoundary>} />
          {isEquipmentUiEnabled() && <Route path="/equipment" element={<ErrorBoundary><Equipment /></ErrorBoundary>} />}
          <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><Onboarding /></ErrorBoundary>} />
          <Route path="/privacy" element={<ErrorBoundary><Privacy withBottomNav /></ErrorBoundary>} />
          <Route path="/support" element={<ErrorBoundary><Support withBottomNav /></ErrorBoundary>} />
          <Route path="/weather" element={<ErrorBoundary><Weather /></ErrorBoundary>} />
          <Route path="/field/:id" element={<ErrorBoundary><FieldDetailScreen /></ErrorBoundary>} />
          <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
        </Routes>
      </Suspense>
    </motion.div>
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
  const navigate = useNavigate();
  const [webRecoveryReady, setWebRecoveryReady] = useState(false);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(getPasswordRecoveryPending);
  const isPasswordRecovery = location.pathname === '/auth'
    && new URLSearchParams(location.search).get('mode') === 'recovery';
  const updatePasswordRecoveryPending = (pending: boolean) => {
    setStoredPasswordRecoveryPending(pending);
    setPasswordRecoveryPending(pending);
  };
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
        syncQueue.replayQueue(farm_id).catch(err => console.error('Sync queue replay failed:', err));
      }
    });

    return () => {
      active = false;
      listenerPromise.then((handle) => handle.remove());
    };
  }, [isOnline, farm_id]);

  useEffect(() => listenForNativePasswordRecovery(
    () => navigate('/auth?mode=recovery', { replace: true }),
    error => toast.error(error instanceof Error ? error.message : 'Could not open password recovery link.'),
  ), [navigate]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStoredPasswordRecoveryPending(true);
        setPasswordRecoveryPending(true);
      }
      if (event === 'SIGNED_OUT') {
        setStoredPasswordRecoveryPending(false);
        setPasswordRecoveryPending(false);
        setWebRecoveryReady(false);
        if (window.location.pathname === '/auth'
          && new URLSearchParams(window.location.search).get('mode') === 'recovery') {
          navigate('/auth?mode=signin', { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !isPasswordRecovery) return;
    setWebRecoveryReady(false);
    void establishWebPasswordRecoverySession()
      .then(established => {
        if (established) setWebRecoveryReady(true);
      })
      .catch(error => {
        toast.error(error instanceof Error ? error.message : 'Could not open password recovery link.');
        // A failed fresh link must not tear down an already-pending recovery
        // session (e.g. from a verified email code): the pending flag keeps
        // the Auth recovery form rendered, so navigating away would contradict
        // the visible UI. Only leave when no recovery is pending.
        if (!passwordRecoveryPending) {
          navigate('/', { replace: true });
        }
      });
  }, [isPasswordRecovery, navigate, passwordRecoveryPending]);

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

  if (passwordRecoveryPending || (isPasswordRecovery && (Capacitor.isNativePlatform() || webRecoveryReady))) {
    return (
      <ErrorBoundary>
        <Auth
          passwordRecoveryPending={passwordRecoveryPending}
          onPasswordRecoveryPendingChange={updatePasswordRecoveryPending}
        />
      </ErrorBoundary>
    );
  }

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
    // Signed-out surfaces: the thin landing at /, the auth screen at /auth
    // (deep-linkable via ?mode=signup|signin), and the public privacy and
    // support pages. Everything else redirects to the landing instead of
    // hiding the app shell.
    return (
      <Routes>
        <Route path="/" element={<ErrorBoundary><Landing /></ErrorBoundary>} />
        <Route
          path="/auth"
          element={isPasswordRecovery ? null : (
            <ErrorBoundary>
              <Auth
                passwordRecoveryPending={passwordRecoveryPending}
                onPasswordRecoveryPendingChange={updatePasswordRecoveryPending}
              />
            </ErrorBoundary>
          )}
        />
        <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
        <Route path="/support" element={<ErrorBoundary><Support /></ErrorBoundary>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
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

  const showQuickAddFab = location.pathname === '/' || location.pathname === '/weather';

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
      <AskAcreLedger />

      {/* Global Modals triggered from Quick Add */}
      {selectedField && (() => {
        const TargetModal = activeModal ? ModalMap[activeModal] : null;
        if (!TargetModal) return null;
        return (
          <Suspense fallback={null}>
            <TargetModal
              open={true}
              field={selectedField}
              onClose={clearActiveModal}
            />
          </Suspense>
        );
      })()}

      {/* Global Floating Action Button (FAB) for Mobile Quick Add */}
      {showQuickAddFab && (
        <button
          onClick={() => {
            native.haptic.light();
            openQuickAdd();
          }}
          className="quick-add-trigger fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full border border-primary-foreground/20 bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.35)] transition-all hover:-translate-y-0.5 active:scale-95 lg:hidden"
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
                <AskAcreLedgerProvider>
                  <Sonner />
                  <AppContent />
                </AskAcreLedgerProvider>
              </QuickAddProvider>
            </FarmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
