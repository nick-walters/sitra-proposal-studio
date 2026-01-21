import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DirectChatDialog } from "@/components/DirectChatDialog";
import { Building2, Mail, Phone, MessageCircle, User } from "lucide-react";

interface TeamMember {
  id: string;
  fullName: string;
  email?: string | null;
  roleInProject?: string | null;
  personMonths?: number | null;
  organisation?: string;
  organisationShortName?: string;
  organisationLogo?: string;
  phoneNumber?: string | null;
  userId?: string | null;
}

interface TeamMemberCardProps {
  member: TeamMember;
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const initials = member.fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer group">
            <Avatar className="w-12 h-12 flex-shrink-0 border">
              {member.organisationLogo ? (
                <AvatarImage
                  src={member.organisationLogo}
                  alt={member.organisationShortName}
                  className="object-contain p-1"
                />
              ) : null}
              <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                  {member.fullName}
                </p>
                {member.personMonths && (
                  <Badge variant="secondary" className="text-xs">
                    {member.personMonths} PM
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {member.roleInProject || 'Team Member'}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  <span>{member.organisationShortName || member.organisation}</span>
                </div>
                {member.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <span className="truncate max-w-32">{member.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Avatar className="w-14 h-14 border">
                {member.organisationLogo ? (
                  <AvatarImage
                    src={member.organisationLogo}
                    alt={member.organisationShortName}
                    className="object-contain p-1"
                  />
                ) : null}
                <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-semibold">{member.fullName}</h4>
                <p className="text-sm text-muted-foreground">
                  {member.roleInProject || 'Team Member'}
                </p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-2 text-sm">
              {member.organisation && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{member.organisation}</span>
                </div>
              )}
              {member.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a href={`mailto:${member.email}`} className="text-primary hover:underline">
                    {member.email}
                  </a>
                </div>
              )}
              {member.phoneNumber && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a href={`tel:${member.phoneNumber}`} className="text-primary hover:underline">
                    {member.phoneNumber}
                  </a>
                </div>
              )}
              {member.personMonths && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{member.personMonths} person-months allocated</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              {member.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => window.open(`mailto:${member.email}`, '_blank')}
                >
                  <Mail className="w-4 h-4" />
                  Email
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setIsChatOpen(true)}
              >
                <MessageCircle className="w-4 h-4" />
                Chat
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <DirectChatDialog
        open={isChatOpen}
        onOpenChange={setIsChatOpen}
        userId={member.userId || member.id}
      />
    </>
  );
}
