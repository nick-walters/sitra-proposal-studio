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


      {/* Document Format Section */}
      <section className="py-20">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-6">
                Publication-Ready Formatting
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                Our platform automatically applies all required document formatting,
                so you can focus on content.
              </p>
              <ul className="space-y-4">
                {[
                  'Portrait A4 page format',
                  'Times New Roman 11pt body text',
                  'Proper heading hierarchy (14pt H1, 12pt H2, 11pt H3)',
                  '1.5cm margins on all sides',
                  'Automatic page numbering and footers',
                  'Proposal acronym in document footer',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-primary/5 rounded-2xl -rotate-3" />
              <div className="relative bg-card rounded-2xl shadow-2xl p-8 rotate-1">
                <div className="document-page transform scale-[0.6] origin-top-left" style={{ width: '210mm', minHeight: '200mm' }}>
                  <h1 className="document-h1 mb-4">1. Excellence</h1>
                  <h2 className="document-h2 mb-3">1.1 Objectives & ambition</h2>
                  <p className="document-content text-muted-foreground">
                    This project aims to develop innovative solutions for sustainable urban development
                    through the integration of green technologies and smart city infrastructure...
                  </p>
                  <div className="mt-6 pt-4 border-t text-xs text-muted-foreground flex justify-between">
                    <span>GREENTECH</span>
                    <span>Section 1: Excellence</span>
                    <span>Page 1 of 45</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Start Your Proposal?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Access Sitra Proposal Studio to collaborate with your consortium partners on funding proposals.
          </p>
          <Button
            size="xl"
            variant="hero-outline"
            onClick={() => navigate('/auth')}
            className="gap-2"
          >
            Sign In
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">Sitra Proposal Studio</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Sitra — The Finnish Innovation Fund. Internal use only.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
