import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceivedFeedback } from "@/components/ReceivedFeedback";
import { FeedbackDetail } from "@/components/FeedbackDetail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export function FeedbackAdmin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOwner, loading } = useUserRole();
  const [searchParams] = useSearchParams();
  const highlightFeedbackId = searchParams.get("feedback") || undefined;

  // Non-owners can only access with a specific feedback deep link
  const isDeepLink = !!highlightFeedbackId;

  useEffect(() => {
    if (!loading && !isOwner && !isDeepLink) {
      toast.error("Access denied. Owner role required.");
      navigate("/dashboard");
    }
  }, [isOwner, loading, navigate, isDeepLink]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Non-owner with deep link: show only the specific feedback detail
  if (!isOwner && isDeepLink) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4 max-w-2xl">
          <FeedbackDetail
            feedbackId={highlightFeedbackId!}
            onBack={() => navigate("/dashboard")}
            onDeleted={() => navigate("/dashboard")}
          />
        </div>
      </div>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin")}
          className="mb-4 gap-2 text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to admin
        </Button>

        <ReceivedFeedback highlightId={highlightFeedbackId} />
      </div>
    </div>
  );
}
