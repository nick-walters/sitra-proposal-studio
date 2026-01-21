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

export default function Index() {
  const navigate = useNavigate();

  const features = [
    {
      icon: FileText,
      title: "Structured Templates",
      description: "Pre-built templates following Horizon Europe Part B requirements for RIA, IA, and CSA proposals.",
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
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23003399' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

        <div className="relative container py-24 lg:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center mb-8 animate-fade-in">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className="h-16" />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Star className="w-4 h-4" />
              A Sitra internal tool for Horizon Europe
            </div>

            <p className="text-lg sm:text-xl text-muted-foreground mb-8 animate-slide-up max-w-2xl mx-auto">
              Sitra's collaborative platform for co-developing Horizon Europe funding proposals
              with consortium partners. Real-time editing, change tracking, and publication-ready exports.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Button
                size="xl"
                variant="hero"
                onClick={() => navigate('/dashboard')}
                className="gap-2"
              >
                Start Writing
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="xl" variant="outline" className="gap-2">
                <FileText className="w-5 h-5" />
                View Demo
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

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Everything You Need for Proposal Success
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From initial drafts to final submission, our platform supports every step of your proposal journey.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div
                key={feature.title}
                className="card-elevated p-6 animate-fade-in"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
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
                Our platform automatically applies all Horizon Europe document formatting requirements,
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
                  <h2 className="document-h2 mb-3">1.1 Objectives and ambition</h2>
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
            Access Sitra Proposal Studio to collaborate with your consortium partners on Horizon Europe proposals.
          </p>
          <Button
            size="xl"
            variant="hero-outline"
            onClick={() => navigate('/dashboard')}
            className="gap-2"
          >
            Go to Dashboard
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
