import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { MessageCircle, Mail, Phone, Building2, Search, Users, UserPlus } from "lucide-react";

// Demo users for development
export const DEMO_USERS = [
  {
    id: 'user-1',
    email: 'maria.schmidt@tum.de',
    firstName: 'Maria',
    lastName: 'Schmidt',
    fullName: 'Dr. Maria Schmidt',
    organisation: 'Technical University of Munich',
    department: 'Institute for Advanced Study',
    phone: '+49 89 289 25000',
    country: 'Germany',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: 'user-2',
    email: 'jp.dubois@cea.fr',
    firstName: 'Jean-Pierre',
    lastName: 'Dubois',
    fullName: 'Prof. Jean-Pierre Dubois',
    organisation: 'CEA',
    department: 'Energy Research Division',
    phone: '+33 1 69 08 60 00',
    country: 'France',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: 'user-3',
    email: 'a.kowalska@polimi.it',
    firstName: 'Anna',
    lastName: 'Kowalska',
    fullName: 'Dr. Anna Kowalska',
    organisation: 'Politecnico di Milano',
    department: 'Department of Engineering',
    phone: '+39 02 2399 2111',
    country: 'Italy',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: 'user-4',
    email: 'erik.johansson@kth.se',
    firstName: 'Erik',
    lastName: 'Johansson',
    fullName: 'Dr. Erik Johansson',
    organisation: 'KTH Royal Institute of Technology',
    department: 'School of Engineering Sciences',
    phone: '+46 8 790 60 00',
    country: 'Sweden',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: 'user-5',
    email: 's.papadopoulos@ntua.gr',
    firstName: 'Sofia',
    lastName: 'Papadopoulos',
    fullName: 'Dr. Sofia Papadopoulos',
    organisation: 'National Technical University of Athens',
    department: 'School of Chemical Engineering',
    phone: '+30 210 772 3000',
    country: 'Greece',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: 'user-6',
    email: 'h.nielsen@siemens.com',
    firstName: 'Henrik',
    lastName: 'Nielsen',
    fullName: 'Mr. Henrik Nielsen',
    organisation: 'Siemens AG',
    department: 'Digital Industries',
    phone: '+49 89 636 00',
    country: 'Germany',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
  },
];

interface CollaboratorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartChat?: (userId: string) => void;
}

export function CollaboratorsDialog({ open, onOpenChange, onStartChat }: CollaboratorsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const filteredUsers = DEMO_USERS.filter(user => 
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.organisation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewProfile = (userId: string) => {
    setSelectedUserId(userId);
    setIsProfileOpen(true);
  };

  const handleStartChat = (userId: string) => {
    onStartChat?.(userId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Collaborators
            </DialogTitle>
            <DialogDescription>
              View team members and start conversations
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="team" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team">Team Members</TabsTrigger>
              <TabsTrigger value="invite">Invite New</TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or organisation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* User List */}
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <Avatar 
                        className="w-12 h-12 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => handleViewProfile(user.id)}
                      >
                        <AvatarImage src={user.avatarUrl} />
                        <AvatarFallback>
                          {user.firstName[0]}{user.lastName[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span 
                            className="font-medium cursor-pointer hover:text-primary transition-colors"
                            onClick={() => handleViewProfile(user.id)}
                          >
                            {user.fullName}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {user.country}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="w-3 h-3" />
                          {user.organisation}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleStartChat(user.id)}
                        >
                          <MessageCircle className="w-4 h-4" />
                          Chat
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.location.href = `mailto:${user.email}`}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                        {user.phone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.location.href = `tel:${user.phone}`}
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="invite" className="space-y-4">
              <div className="text-center py-8">
                <UserPlus className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Invite collaborators</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter email addresses to invite new team members
                </p>
                <div className="flex gap-2 max-w-md mx-auto">
                  <Input placeholder="email@example.com" type="email" />
                  <Button>Send Invite</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      {selectedUserId && (
        <UserProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          userId={selectedUserId}
          editable={false}
        />
      )}
    </>
  );
}
