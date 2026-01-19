import { Button } from "@/components/ui/button";
import { Users, Settings, LogOut } from "lucide-react";
import sitraLogo from "@/assets/sitra-logo.png";
import { Link } from "react-router-dom";

interface HeaderProps {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : 'U';

  return (
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
          <Button variant="ghost" size="sm" className="gap-2">
            <Users className="w-4 h-4" />
            Collaborators
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </nav>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">{initials}</span>
              </div>
              <span className="text-sm font-medium">{user.name}</span>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
