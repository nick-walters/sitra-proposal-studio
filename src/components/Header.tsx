import { Button } from "@/components/ui/button";
import { FileText, Users, Settings, LogOut } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-foreground">grant.eu</span>
            <span className="text-xs text-muted-foreground border-l border-border pl-3">by Sitra</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-2">
            <FileText className="w-4 h-4" />
            My Proposals
          </Button>
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
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">JD</span>
            </div>
            <span className="text-sm font-medium">John Doe</span>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
