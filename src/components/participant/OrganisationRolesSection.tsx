import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Briefcase } from 'lucide-react';
import { ParticipantOrganisationRole, ORGANISATION_ROLES } from '@/types/participantDetails';
import { useState } from 'react';

interface OrganisationRolesSectionProps {
  roles: ParticipantOrganisationRole[];
  onSetRole: (roleType: string, enabled: boolean, otherDescription?: string) => void;
  canEdit: boolean;
}

export function OrganisationRolesSection({
  roles,
  onSetRole,
  canEdit,
}: OrganisationRolesSectionProps) {
  const [otherDescription, setOtherDescription] = useState(
    roles.find(r => r.roleType === 'other')?.otherDescription || ''
  );

  const isRoleSelected = (roleType: string) => {
    return roles.some(r => r.roleType === roleType);
  };

  const handleRoleChange = (roleType: string, checked: boolean) => {
    if (roleType === 'other') {
      onSetRole(roleType, checked, otherDescription);
    } else {
      onSetRole(roleType, checked);
    }
  };

  const handleOtherDescriptionChange = (description: string) => {
    setOtherDescription(description);
    if (isRoleSelected('other')) {
      onSetRole('other', true, description);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Briefcase className="w-5 h-5" />
          Role of participating organisation in the project
        </CardTitle>
        <CardDescription>
          Select all roles that apply to this organisation's contribution to the project
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {ORGANISATION_ROLES.map((role) => (
            <div key={role.value} className="flex items-start space-x-2">
              <Checkbox
                id={`role-${role.value}`}
                checked={isRoleSelected(role.value)}
                onCheckedChange={(checked) => handleRoleChange(role.value, !!checked)}
                disabled={!canEdit}
              />
              <div className="flex-1">
                <Label
                  htmlFor={`role-${role.value}`}
                  className="text-sm font-normal cursor-pointer leading-tight"
                >
                  {role.label}
                </Label>
                {role.value === 'other' && isRoleSelected('other') && (
                  <Input
                    className="mt-2"
                    value={otherDescription}
                    onChange={(e) => handleOtherDescriptionChange(e.target.value)}
                    placeholder="Please specify..."
                    disabled={!canEdit}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
