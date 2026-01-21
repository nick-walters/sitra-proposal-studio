import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { Dashboard } from "./pages/Dashboard";
import { ProposalEditor } from "./pages/ProposalEditor";
import { BackendAdmin } from "./pages/admin/BackendAdmin";
import { TemplateAdmin } from "./pages/admin/TemplateAdmin";
import { UserRightsAdmin } from "./pages/admin/UserRightsAdmin";
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/proposal/:id" element={<ProposalEditor />} />
          <Route path="/admin" element={<BackendAdmin />} />
          <Route path="/admin/templates" element={<TemplateAdmin />} />
          <Route path="/admin/user-rights" element={<UserRightsAdmin />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
