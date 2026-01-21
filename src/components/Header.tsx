import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { CollaboratorsDialog } from "@/components/CollaboratorsDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DirectChatDialog } from "@/components/DirectChatDialog";
import { Users, Settings } from "lucide-react";
import sitraLogo from "@/assets/sitra-logo.png";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, signOut } = useAuth();
  const [isCollaboratorsOpen, setIsCollaboratorsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chatUserId, setChatUserId] = useState<string | null>(null);

  const handleStartChat = (userId: string) => {
    setIsCollaboratorsOpen(false);
    setChatUserId(userId);
  };

  return (
    <>
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src={sitraLogo} alt="Sitra" className="h-8 w-32" />
              <span className="text-base font-bold tracking-tight text-foreground" style={{ transform: 'scaleX(0.7)', transformOrigin: 'left' }}>grant.eu</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                My Proposals
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
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </nav>

          <div className="flex items-center gap-2">
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
        onStartChat={handleStartChat}
      />
      <SettingsDialog 
        open={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
      />
      {chatUserId && (
        <DirectChatDialog
          open={!!chatUserId}
          onOpenChange={(open) => !open && setChatUserId(null)}
          userId={chatUserId}
        />
      )}
    </>
  );
}