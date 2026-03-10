import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FarmProvider, useFarm } from "@/store/farmStore";
import { Auth } from "@/components/Auth";
import SeasonRolloverModal from "@/components/SeasonRolloverModal";
import Index from "./pages/Index";
import Logistics from "./pages/Logistics";
import Activity from "./pages/Activity";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, loading } = useFarm();

  if (loading) {
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
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    </div>
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
        <Route path="/logistics" element={<ErrorBoundary><Logistics /></ErrorBoundary>} />
        <Route path="/activity" element={<ErrorBoundary><Activity /></ErrorBoundary>} />
        <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
        <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <SeasonRolloverModal />
    </>
  );
};

import { ThemeProvider } from "@/components/ThemeProvider";

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="al-ui-theme">
        <TooltipProvider>
          <ErrorBoundary>
            <FarmProvider>
              <Toaster />
              <Sonner />
              <AppContent />
            </FarmProvider>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
