import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Users,
  Shield,
  ChevronRight,
  Lock,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";

export function BackendAdmin() {
  const navigate = useNavigate();
  const { isAdminOrOwner, isOwner, loading } = useUserRole();

  // Redirect non-admins
  useEffect(() => {
    if (!loading && !isAdminOrOwner) {
      toast.error("Access denied. Admin or Owner role required.");
      navigate("/dashboard");
    }
  }, [isAdminOrOwner, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminOrOwner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Backend Administration</h1>
          <p className="text-muted-foreground mt-2">
            Manage templates, user rights, and system settings
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Template Management - Owners only */}
          <Link to="/admin/templates" className={!isOwner ? 'pointer-events-none' : ''}>
            <Card className={`h-full transition-all hover:shadow-md ${!isOwner ? 'opacity-50' : 'hover:border-primary cursor-pointer'}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  {isOwner ? (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <CardTitle className="mt-4">Template Management</CardTitle>
                <CardDescription>
                  Manage funding programmes, template types, sections, guidelines, and form fields
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {isOwner ? (
                    <span className="text-primary">Owner access granted</span>
                  ) : (
                    <span>Requires Owner role</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* User Rights - Owners and Admins */}
          <Link to="/admin/user-rights">
            <Card className="h-full transition-all hover:shadow-md hover:border-primary cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-secondary/50 rounded-lg">
                    <Shield className="w-6 h-6 text-foreground" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
                <CardTitle className="mt-4">User Rights</CardTitle>
                <CardDescription>
                  Manage user roles and permissions across the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <span className="text-primary">
                    {isOwner ? 'Owner' : 'Admin'} access granted
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Received Feedback - Owners only */}
          <Link to="/admin/feedback" className={!isOwner ? 'pointer-events-none' : ''}>
            <Card className={`h-full transition-all hover:shadow-md ${!isOwner ? 'opacity-50' : 'hover:border-primary cursor-pointer'}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-amber-500/10 rounded-lg">
                    <MessageSquare className="w-6 h-6 text-amber-600" />
                  </div>
                  {isOwner ? (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <CardTitle className="mt-4">Received Feedback</CardTitle>
                <CardDescription>
                  Review feature requests and bug reports from users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {isOwner ? (
                    <span className="text-primary">Owner access granted</span>
                  ) : (
                    <span>Requires Owner role</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
