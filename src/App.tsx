import { useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { ProposalEditor } from "./pages/ProposalEditor";
import { BackendAdmin } from "./pages/admin/BackendAdmin";
import { TemplateAdmin } from "./pages/admin/TemplateAdmin";
import { UserRightsAdmin } from "./pages/admin/UserRightsAdmin";
import { InitialSetup } from "./pages/admin/InitialSetup";
import { Feedback } from "./pages/Feedback";
import NotFound from "./pages/NotFound";

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
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/proposal/:id" element={<ProtectedRoute><ProposalEditor /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><BackendAdmin /></ProtectedRoute>} />
            <Route path="/admin/templates" element={<ProtectedRoute><TemplateAdmin /></ProtectedRoute>} />
            <Route path="/admin/user-rights" element={<ProtectedRoute><UserRightsAdmin /></ProtectedRoute>} />
            <Route path="/admin/setup" element={<ProtectedRoute><InitialSetup /></ProtectedRoute>} />
            <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
