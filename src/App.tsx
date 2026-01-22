import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { ProposalEditor } from "./pages/ProposalEditor";
import { BackendAdmin } from "./pages/admin/BackendAdmin";
import { TemplateAdmin } from "./pages/admin/TemplateAdmin";
import { UserRightsAdmin } from "./pages/admin/UserRightsAdmin";
import { InitialSetup } from "./pages/admin/InitialSetup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/proposal/:id" element={<ProtectedRoute><ProposalEditor /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><BackendAdmin /></ProtectedRoute>} />
          <Route path="/admin/templates" element={<ProtectedRoute><TemplateAdmin /></ProtectedRoute>} />
          <Route path="/admin/user-rights" element={<ProtectedRoute><UserRightsAdmin /></ProtectedRoute>} />
          <Route path="/admin/setup" element={<ProtectedRoute><InitialSetup /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
