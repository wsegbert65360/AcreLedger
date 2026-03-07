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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
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
