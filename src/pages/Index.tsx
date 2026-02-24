import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Users,
  History,
  Download,
  CheckCircle,
  ArrowRight,
  Star,
  Shield,
  Zap,
} from "lucide-react";
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

  const features = [
    {
      icon: FileText,
      title: "Structured Templates",
      description: "Pre-built templates following Part B requirements for RIA, IA, and CSA proposals.",
    },
    {
      icon: Users,
      title: "Real-time Collaboration",
      description: "Work together with your consortium partners. Track changes, add comments, and coordinate seamlessly.",
    },
    {
      icon: History,
      title: "Version Control",
      description: "Automatic version history with the ability to compare and restore previous versions anytime.",
    },
    {
      icon: Download,
      title: "PDF Export",
      description: "Export publication-ready PDFs with proper formatting: A4, Times New Roman, correct margins.",
    },
    {
      icon: Shield,
      title: "Access Control",
      description: "Granular permissions with admin, editor, and viewer roles per proposal.",
    },
    {
      icon: Zap,
      title: "Smart Guidelines",
      description: "Integrated writing guidelines with text, images, and video instructions for each section.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative">

        <div className="relative container py-24 lg:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center mb-8 animate-fade-in">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className="h-16 w-auto object-contain flex-shrink-0" />
            </div>

            <p className="text-lg sm:text-xl text-muted-foreground mb-8 animate-slide-up max-w-2xl mx-auto">
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
                Sign In
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Trust indicator */}
            <div className="mt-12 pt-8 border-t border-border animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <p className="text-sm text-muted-foreground">
                An internal tool by <span className="font-semibold text-foreground">Sitra</span> — The Finnish Innovation Fund
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
