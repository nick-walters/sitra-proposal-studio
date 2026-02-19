import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { CollaboratorsDialog } from "@/components/CollaboratorsDialog";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Users, Database, Columns3 } from "lucide-react";
import sitraLogo from "@/assets/sitra-proposal-studio-logo.png";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export function Header() {
  const { user, signOut } = useAuth();
  const { isOwner, hasAnyCoordinatorRole, isGlobalAdmin } = useUserRole();
  const [isCollaboratorsOpen, setIsCollaboratorsOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-border bg-card sticky top-0 z-40">
        <div className="h-full px-6 flex items-center justify-between">
          {/* Left: Logo + Navigation */}
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className="h-8 w-auto object-contain flex-shrink-0" />
            </Link>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">alpha</span>
            <nav className="hidden md:flex items-center gap-1">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Columns3 className="w-4 h-4" />
                  Proposal dashboard
                </Button>
              </Link>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2"
                onClick={() => setIsCollaboratorsOpen(true)}
              >
                <Users className="w-4 h-4" />
                Collaborators
              </Button>
              {(isOwner || (isGlobalAdmin && hasAnyCoordinatorRole)) && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Database className="w-4 h-4" />
                    <span className="hidden sm:inline">Backend</span>
                  </Button>
                </Link>
              )}
            </nav>
          </div>

          {/* Right: Notifications, Avatar */}
          <div className="flex items-center gap-2">
            {user && <NotificationCenter />}
            {user && (
              <UserAvatarMenu 
                userId={user.id}
                email={user.email || ''}
                onLogout={signOut}
              />
            )}
          </div>
        </div>
      </header>

      {/* Dialogs */}
      <CollaboratorsDialog 
        open={isCollaboratorsOpen} 
        onOpenChange={setIsCollaboratorsOpen}
      />
    </>
  );
}