import { useEffect, lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Route-level code splitting for heavy / less-frequently visited pages.
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const ProposalEditor = lazy(() => import("./pages/ProposalEditor").then(m => ({ default: m.ProposalEditor })));
const BackendAdmin = lazy(() => import("./pages/admin/BackendAdmin").then(m => ({ default: m.BackendAdmin })));
const TemplateAdmin = lazy(() => import("./pages/admin/TemplateAdmin").then(m => ({ default: m.TemplateAdmin })));
const UserRightsAdmin = lazy(() => import("./pages/admin/UserRightsAdmin").then(m => ({ default: m.UserRightsAdmin })));
const InitialSetup = lazy(() => import("./pages/admin/InitialSetup").then(m => ({ default: m.InitialSetup })));
const FeedbackAdmin = lazy(() => import("./pages/admin/FeedbackAdmin").then(m => ({ default: m.FeedbackAdmin })));
const EvaluationConfigAdmin = lazy(() => import("./pages/admin/EvaluationConfigAdmin").then(m => ({ default: m.EvaluationConfigAdmin })));
const AIConfigAdmin = lazy(() => import("./components/admin/AIConfigAdmin").then(m => ({ default: m.AIConfigAdmin })));
const BackupsAdmin = lazy(() => import("./pages/admin/BackupsAdmin"));
const OrganisationRegistryAdmin = lazy(() => import("./pages/admin/OrganisationRegistryAdmin").then(m => ({ default: m.OrganisationRegistryAdmin })));
const Feedback = lazy(() => import("./pages/Feedback").then(m => ({ default: m.Feedback })));

const RouteFallback = () => (
  <div className="flex h-dvh items-center justify-center" role="status" aria-label="Loading">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        const el = document.activeElement;
        const isEditable =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handler, true);

    // Prefetch the two most likely next routes once the browser is idle,
    // so the lazy chunks are already in cache by the time the user clicks.
    const ric: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb) => window.setTimeout(cb, 1500));
    const handle = ric(() => {
      void import('./pages/Dashboard');
      void import('./pages/ProposalEditor');
    });

    return () => {
      window.removeEventListener('keydown', handler, true);
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cic) cic(handle);
      else window.clearTimeout(handle);
    };
  }, []);


  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/proposal/:id" element={<ProtectedRoute><ProposalEditor /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><BackendAdmin /></ProtectedRoute>} />
                <Route path="/admin/templates" element={<ProtectedRoute><TemplateAdmin /></ProtectedRoute>} />
                <Route path="/admin/user-rights" element={<ProtectedRoute><UserRightsAdmin /></ProtectedRoute>} />
                <Route path="/admin/setup" element={<ProtectedRoute><InitialSetup /></ProtectedRoute>} />
                <Route path="/admin/feedback" element={<ProtectedRoute><FeedbackAdmin /></ProtectedRoute>} />
                <Route path="/admin/evaluation-config" element={<ProtectedRoute><EvaluationConfigAdmin /></ProtectedRoute>} />
                <Route path="/admin/ai-config" element={<ProtectedRoute><AIConfigAdmin /></ProtectedRoute>} />
                <Route path="/admin/backups" element={<ProtectedRoute><BackupsAdmin /></ProtectedRoute>} />
                <Route path="/admin/organisations" element={<ProtectedRoute><OrganisationRegistryAdmin /></ProtectedRoute>} />

                <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>

        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
