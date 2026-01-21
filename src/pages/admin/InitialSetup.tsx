import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, 
  CheckCircle2, 
  AlertCircle,
  Crown,
  UserCog
} from "lucide-react";
import { toast } from "sonner";

export function InitialSetup() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [hasOwner, setHasOwner] = useState<boolean | null>(null);
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Check if any owner exists
        const { data: owners, error: ownersError } = await supabase
          .from('user_roles')
          .select('id')
          .eq('role', 'owner')
          .limit(1);

        if (ownersError) throw ownersError;
        setHasOwner(owners && owners.length > 0);

        // Check current user's roles
        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (rolesError) throw rolesError;
        setCurrentUserRoles(userRoles?.map(r => r.role) || []);
      } catch (error) {
        console.error('Error checking setup:', error);
        toast.error("Failed to check setup status");
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkSetup();
    }
  }, [user, authLoading]);

  const handleAssignOwner = async () => {
    if (!user) return;

    setAssigning(true);
    try {
      // Insert owner role for current user
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'owner',
          proposal_id: '00000000-0000-0000-0000-000000000000' // Global role placeholder
        });

      if (error) throw error;

      toast.success("You are now an Owner! Redirecting to admin...");
      setCurrentUserRoles(prev => [...prev, 'owner']);
      setHasOwner(true);
      
      setTimeout(() => navigate('/admin'), 1500);
    } catch (error: any) {
      console.error('Error assigning owner:', error);
      toast.error(error.message || "Failed to assign owner role");
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignAdmin = async () => {
    if (!user) return;

    setAssigning(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'admin',
          proposal_id: '00000000-0000-0000-0000-000000000000' // Global role placeholder
        });

      if (error) throw error;

      toast.success("You are now an Admin!");
      setCurrentUserRoles(prev => [...prev, 'admin']);
    } catch (error: any) {
      console.error('Error assigning admin:', error);
      toast.error(error.message || "Failed to assign admin role");
    } finally {
      setAssigning(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4 max-w-2xl">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-orange-500" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                Please sign in to access the initial setup page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/')}>
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isOwner = currentUserRoles.includes('owner');
  const isAdmin = currentUserRoles.includes('admin');

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8" />
            Initial Setup
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure your account with administrative privileges
          </p>
        </div>

        {/* Current Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm">Logged in as:</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm">Your roles:</span>
              <span className="font-medium">
                {currentUserRoles.length > 0 ? currentUserRoles.join(', ') : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm">System has owner:</span>
              <span className={`font-medium ${hasOwner ? 'text-green-600' : 'text-orange-500'}`}>
                {hasOwner ? 'Yes' : 'No'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Owner Assignment */}
        {!hasOwner && (
          <Card className="mb-6 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Become the First Owner
              </CardTitle>
              <CardDescription>
                No owner has been assigned yet. As the first user, you can claim the owner role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertDescription>
                  The <strong>Owner</strong> role provides full access to template management, user rights, and all administrative functions.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleAssignOwner} 
                disabled={assigning}
                className="w-full"
              >
                {assigning ? 'Assigning...' : 'Claim Owner Role'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Already Owner */}
        {isOwner && (
          <Card className="mb-6 border-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                You are an Owner
              </CardTitle>
              <CardDescription>
                You have full administrative access to the system.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/admin')} className="w-full">
                Go to Admin Panel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Admin Assignment (only if owner exists and user is not already admin) */}
        {hasOwner && !isOwner && !isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="w-5 h-5" />
                Request Admin Role
              </CardTitle>
              <CardDescription>
                An owner already exists. You can assign yourself as an admin for testing purposes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertDescription>
                  The <strong>Admin</strong> role provides access to user rights management and proposal administration.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleAssignAdmin} 
                disabled={assigning}
                variant="secondary"
                className="w-full"
              >
                {assigning ? 'Assigning...' : 'Assign Admin Role'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Already Admin */}
        {isAdmin && !isOwner && (
          <Card className="mb-6 border-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <CheckCircle2 className="w-5 h-5" />
                You are an Admin
              </CardTitle>
              <CardDescription>
                You have administrative access to user rights management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/admin')} className="w-full">
                Go to Admin Panel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex-1">
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
