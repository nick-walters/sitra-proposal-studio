import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { CollaboratorsDialog } from "@/components/CollaboratorsDialog";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Notification } from "@/hooks/useNotifications";
import { Users, Database, Columns3, MessageSquare } from "lucide-react";
import sitraLogo from "@/assets/sitra-proposal-studio-logo.png";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export function Header() {
  const { user, signOut } = useAuth();
  const { isOwner, hasAnyCoordinatorRole, isGlobalAdmin } = useUserRole();
  const [isCollaboratorsOpen, setIsCollaboratorsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isCompact = location.pathname.startsWith('/proposal/');

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.proposal_id) return;
    const meta = notification.metadata || {};
    
    // Message board mentions
    if (meta.source === 'message_board') {
      navigate(`/proposal/${notification.proposal_id}?section=messaging`);
      return;
    }
    
    // Comment mentions - navigate to the section with review panel open
    if (notification.type === 'mention' && notification.section_id && meta.source === 'comment') {
      navigate(`/proposal/${notification.proposal_id}?section=${notification.section_id}&panel=comments`);
      return;
    }

    // Other section-based mentions
    if (notification.type === 'mention' && notification.section_id) {
      navigate(`/proposal/${notification.proposal_id}?section=${notification.section_id}`);
      return;
    }
    
    // Task mentions
    if (meta.source === 'task') {
      navigate(`/proposal/${notification.proposal_id}?section=task-allocator`);
      return;
    }
    
    // Section assignments / due dates
    if (notification.section_id) {
      navigate(`/proposal/${notification.proposal_id}?section=${notification.section_id}`);
      return;
    }
    
    // Feedback notifications
    if (meta.source === 'feedback' && meta.feedback_id) {
      navigate(`/admin?feedback=${meta.feedback_id}`);
      return;
    }
    
    // Fallback: just navigate to the proposal
    navigate(`/proposal/${notification.proposal_id}`);
  }, [navigate]);

  return (
    <>
      <header className={`${isCompact ? 'h-10' : 'h-16'} border-b border-border bg-card sticky top-0 z-40 transition-[height] duration-200`}>
        <div className="h-full px-6 flex items-center">
          {/* Left: Logo + Alpha */}
          <div className="flex items-center gap-4 w-[220px] shrink-0">
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className={`${isCompact ? 'h-5' : 'h-8'} w-auto object-contain flex-shrink-0 transition-[height] duration-200`} />
            </Link>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">beta</span>
          </div>

          {/* Centre: Navigation */}
          <nav className="hidden md:flex items-center gap-1 justify-center flex-1">
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
            <Link to="/feedback">
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Feedback
              </Button>
            </Link>
            {(isOwner || (isGlobalAdmin && hasAnyCoordinatorRole)) && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Database className="w-4 h-4" />
                  <span className="hidden sm:inline">Backend</span>
                </Button>
              </Link>
            )}
          </nav>

          {/* Right: Notifications, Avatar */}
          <div className="flex items-center gap-2 w-[220px] shrink-0 justify-end">
            {user && <NotificationCenter onNotificationClick={handleNotificationClick} />}
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