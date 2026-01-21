import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";
import { CollaboratorsDialog } from "@/components/CollaboratorsDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DirectChatDialog } from "@/components/DirectChatDialog";
import { Users, Settings, LogOut } from "lucide-react";
import sitraLogo from "@/assets/sitra-proposal-studio-logo.png";
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
          {/* Left: Logo */}
          <div className="flex items-center gap-4 flex-1">
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src={sitraLogo} alt="Sitra Proposal Studio" className="h-8" />
            </Link>
          </div>

          {/* Centre: Navigation */}
          <nav className="hidden md:flex items-center gap-1 justify-center flex-1">
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
          </nav>

          {/* Right: Settings, Logout, Avatar */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
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