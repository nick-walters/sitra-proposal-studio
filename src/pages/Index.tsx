import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, Users, History, Download, ArrowRight, Shield, Zap } from "lucide-react";
import sitraLogo from "@/assets/sitra-proposal-studio-logo.png";
import { useAuth } from "@/hooks/useAuth";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);


  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero Section */}
      <section className="relative flex-1 flex items-center justify-center">
        <div className="relative container py-32 lg:py-40">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center mb-10 animate-fade-in">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className="h-16 w-auto object-contain flex-shrink-0" />
            </div>

            <p className="text-lg sm:text-xl text-muted-foreground mb-10 animate-slide-up max-w-2xl mx-auto">
              Sitra's collaborative platform for co-developing funding proposals
              with consortium partners. Real-time editing, change tracking, and publication-ready exports.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Button
                size="xl"
                variant="hero"
                onClick={() => navigate('/auth')}
                className="gap-2"
              >
                Sign in
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-border">
        <div className="container text-center">
          <p className="text-sm text-muted-foreground">
            An internal tool by <span className="font-semibold text-foreground">Sitra</span> — The Finnish Innovation Fund
          </p>
        </div>
      </footer>
    </div>
  );
}
