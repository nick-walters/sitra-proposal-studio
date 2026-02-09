import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Award } from 'lucide-react';
import { ParticipantAchievement, ACHIEVEMENT_TYPES } from '@/types/participantDetails';

interface AchievementsSectionProps {
  achievements: ParticipantAchievement[];
  onAdd: (achievement: Omit<ParticipantAchievement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantAchievement>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

export function AchievementsSection({
  achievements,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: AchievementsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAchievement, setNewAchievement] = useState({
    achievementType: 'Publication',
    description: '',
  });

  const handleAdd = () => {
    if (!newAchievement.description.trim()) return;

    onAdd({
      ...newAchievement,
      participantId: '',
      orderIndex: achievements.length,
    });

    setNewAchievement({
      achievementType: 'Publication',
      description: '',
    });
    setShowAddForm(false);
  };

  const canAddMore = achievements.length < 5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="w-5 h-5" />
              List of up to 5 publications, widely-used datasets, software, goods, services, or any other achievements relevant to the call content
            </CardTitle>
          </div>
          {canEdit && canAddMore && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Add Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={newAchievement.achievementType}
                    onValueChange={(v) => setNewAchievement({ ...newAchievement, achievementType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACHIEVEMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Key elements of the achievement, including a short qualitative assessment of its impact and (where available) its digital object identifier (DOI) or other type of persistent identifier (PID). Publications, in particular journal articles, are expected to be open access. Datasets are expected to be FAIR and 'as open as possible, as closed as necessary'.
                  </p>
                  <Textarea
                    value={newAchievement.description}
                    onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                    placeholder="e.g., Author A., Author B. (2024). Title of publication. Journal Name, 12(3), 45-67. DOI: 10.1234/example"
                    className="min-h-[80px]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newAchievement.description.trim()}>
                  Add Achievement
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Achievements List */}
        {achievements.length === 0 && !showAddForm ? (
          <div className="text-center py-6 text-muted-foreground">
            <Award className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No achievements added yet</p>
            <p className="text-xs mt-1">Add up to 5 relevant publications, datasets, or other achievements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {achievements.map((achievement, index) => (
              <div
                key={achievement.id}
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded">
                      {achievement.achievementType}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{achievement.description}</p>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(achievement.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!canAddMore && achievements.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Maximum of 5 achievements reached
          </p>
        )}
      </CardContent>
    </Card>
  );
}
