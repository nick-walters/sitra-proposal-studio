import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Building2, GripVertical } from 'lucide-react';
import { CountrySelect } from '@/components/CountrySelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Department {
  id: string;
  participantId: string;
  departmentName: string;
  street?: string;
  town?: string;
  postcode?: string;
  country?: string;
  sameAsOrganisation: boolean;
  orderIndex: number;
}

interface DepartmentsSectionProps {
  participantId: string;
  organisationStreet?: string;
  organisationTown?: string;
  organisationPostcode?: string;
  organisationCountry?: string;
  departmentsNotApplicable: boolean;
  onToggleNotApplicable: (value: boolean) => void;
  canEdit: boolean;
}

function SortableDepartmentCard({
  dept,
  canEdit,
  orgStreet,
  orgTown,
  orgPostcode,
  orgCountry,
  onUpdate,
  onDelete,
}: {
  dept: Department;
  canEdit: boolean;
  orgStreet?: string;
  orgTown?: string;
  orgPostcode?: string;
  orgCountry?: string;
  onUpdate: (id: string, updates: Partial<Department>) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dept.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSameAsOrg = (checked: boolean) => {
    if (checked) {
      onUpdate(dept.id, {
        sameAsOrganisation: true,
        street: orgStreet || '',
        town: orgTown || '',
        postcode: orgPostcode || '',
        country: orgCountry || '',
      });
    } else {
      onUpdate(dept.id, { sameAsOrganisation: false });
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 bg-muted/30 space-y-3">
      <div className="flex items-center gap-3">
        {canEdit && (
          <button
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <DebouncedInput
            value={dept.departmentName}
            onDebouncedChange={(v) => onUpdate(dept.id, { departmentName: v })}
            placeholder="Department name"
            disabled={!canEdit}
            className="font-medium"
          />
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(dept.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 ml-9">
        <Checkbox
          id={`same-as-org-${dept.id}`}
          checked={dept.sameAsOrganisation}
          onCheckedChange={handleSameAsOrg}
          disabled={!canEdit}
        />
        <Label htmlFor={`same-as-org-${dept.id}`} className="text-sm font-normal cursor-pointer">
          Same as organisation address
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 ml-9">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Street</Label>
          <DebouncedInput
            value={dept.street || ''}
            onDebouncedChange={(v) => onUpdate(dept.id, { street: v })}
            placeholder="Street address"
            disabled={!canEdit || dept.sameAsOrganisation}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Town</Label>
          <DebouncedInput
            value={dept.town || ''}
            onDebouncedChange={(v) => onUpdate(dept.id, { town: v })}
            placeholder="Town / City"
            disabled={!canEdit || dept.sameAsOrganisation}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Postcode</Label>
          <DebouncedInput
            value={dept.postcode || ''}
            onDebouncedChange={(v) => onUpdate(dept.id, { postcode: v })}
            placeholder="Postcode"
            disabled={!canEdit || dept.sameAsOrganisation}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Country</Label>
          {canEdit && !dept.sameAsOrganisation ? (
            <CountrySelect
              value={dept.country || ''}
              onValueChange={(v) => onUpdate(dept.id, { country: v })}
            />
          ) : (
            <Input value={dept.country || ''} disabled />
          )}
        </div>
      </div>
    </div>
  );
}

export function DepartmentsSection({
  participantId,
  organisationStreet,
  organisationTown,
  organisationPostcode,
  organisationCountry,
  departmentsNotApplicable,
  onToggleNotApplicable,
  canEdit,
}: DepartmentsSectionProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchDepartments = useCallback(async () => {
    const { data, error } = await supabase
      .from('participant_departments')
      .select('*')
      .eq('participant_id', participantId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching departments:', error);
      return;
    }

    setDepartments(
      (data || []).map((d: any) => ({
        id: d.id,
        participantId: d.participant_id,
        departmentName: d.department_name,
        street: d.street || undefined,
        town: d.town || undefined,
        postcode: d.postcode || undefined,
        country: d.country || undefined,
        sameAsOrganisation: d.same_as_organisation || false,
        orderIndex: d.order_index || 0,
      }))
    );
    setLoading(false);
  }, [participantId]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const addDepartment = async () => {
    const { data, error } = await supabase
      .from('participant_departments')
      .insert({
        participant_id: participantId,
        department_name: '',
        order_index: departments.length,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add department');
      console.error(error);
      return;
    }

    setDepartments((prev) => [
      ...prev,
      {
        id: data.id,
        participantId: data.participant_id,
        departmentName: data.department_name,
        sameAsOrganisation: data.same_as_organisation || false,
        orderIndex: data.order_index || 0,
      },
    ]);
  };

  const updateDepartment = async (id: string, updates: Partial<Department>) => {
    const dbUpdates: any = {};
    if (updates.departmentName !== undefined) dbUpdates.department_name = updates.departmentName;
    if (updates.street !== undefined) dbUpdates.street = updates.street;
    if (updates.town !== undefined) dbUpdates.town = updates.town;
    if (updates.postcode !== undefined) dbUpdates.postcode = updates.postcode;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.sameAsOrganisation !== undefined) dbUpdates.same_as_organisation = updates.sameAsOrganisation;
    if (updates.orderIndex !== undefined) dbUpdates.order_index = updates.orderIndex;

    const { error } = await supabase
      .from('participant_departments')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      toast.error('Failed to update department');
      console.error(error);
      return;
    }

    setDepartments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const deleteDepartment = async (id: string) => {
    const { error } = await supabase
      .from('participant_departments')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete department');
      console.error(error);
      return;
    }

    setDepartments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = departments.findIndex((d) => d.id === active.id);
    const newIndex = departments.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(departments, oldIndex, newIndex);
    setDepartments(reordered);
    reordered.forEach((item, i) => {
      updateDepartment(item.id, { orderIndex: i });
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Departments
          </CardTitle>
          {canEdit && !departmentsNotApplicable && (
            <Button
              variant="outline"
              size="sm"
              onClick={addDepartment}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Department
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="dept-not-applicable"
            checked={departmentsNotApplicable}
            onCheckedChange={(checked) => onToggleNotApplicable(!!checked)}
            disabled={!canEdit}
          />
          <Label htmlFor="dept-not-applicable" className="text-sm font-normal cursor-pointer">
            Not applicable — only organisation address is used
          </Label>
        </div>

        {!departmentsNotApplicable && (
          <>
            {departments.length === 0 && !loading ? (
              <div className="text-center py-6 text-muted-foreground">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No departments added yet</p>
                <p className="text-xs mt-1">Add departments if different from the main organisation address</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={departments.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {departments.map((dept) => (
                      <SortableDepartmentCard
                        key={dept.id}
                        dept={dept}
                        canEdit={canEdit}
                        orgStreet={organisationStreet}
                        orgTown={organisationTown}
                        orgPostcode={organisationPostcode}
                        orgCountry={organisationCountry}
                        onUpdate={updateDepartment}
                        onDelete={deleteDepartment}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
