import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SectionProgressItem {
  sectionNumber: string;
  sectionTitle: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
  assignedToEmail: string | null;
  dueDate: string | null;
  hasContent: boolean;
  isPlaceholder: boolean;
  wordCount: number;
  updatedAt: string | null;
  lastEditedByName: string | null;
}

export interface ProgressSummary {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  dueSoon: number;
  completionPercentage: number;
}

export function useSectionProgress(proposalId: string | null, currentUserId?: string) {
  const [progress, setProgress] = useState<SectionProgressItem[]>([]);
  const [summary, setSummary] = useState<ProgressSummary>({
    totalAssigned: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    overdue: 0,
    dueSoon: 0,
    completionPercentage: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!proposalId) {
      setProgress([]);
      setLoading(false);
      return;
    }

    try {
      // Get the proposal template
      const { data: templateData, error: templateError } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      if (templateError || !templateData) {
        setLoading(false);
        return;
      }

      // Fetch all sections with assignments
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('proposal_template_sections')
        .select(`
          section_number,
          assigned_to,
          assigned_by,
          due_date,
          placeholder_content
        `)
        .eq('proposal_template_id', templateData.id)
        .not('assigned_to', 'is', null);

      if (sectionsError) {
        console.error('Error fetching sections:', sectionsError);
        setLoading(false);
        return;
      }

      // Filter sections to only show those assigned to or by the current user
      const filteredSectionsData = currentUserId
        ? sectionsData.filter(s => s.assigned_to === currentUserId || s.assigned_by === currentUserId)
        : sectionsData;

      // Get profile info for all assigned users
      const userIds = [...new Set(filteredSectionsData.map(s => s.assigned_to).filter(Boolean))];
      
      let profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_basic')
          .select('id, full_name, avatar_url, email')
          .in('id', userIds);
        
        if (profiles) {
          profiles.forEach(p => {
            profilesMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url, email: p.email });
          });
        }
      }

      // Get section contents
      const sectionNumbers = filteredSectionsData.map(s => s.section_number);
      const { data: contentData } = await supabase
        .from('section_content')
        .select('section_id, content, updated_at, last_edited_by')
        .eq('proposal_id', proposalId)
        .in('section_id', sectionNumbers);

      // Get template section titles
      const { data: templateSections } = await supabase
        .from('template_sections')
        .select('section_number, title');

      const titlesMap = new Map<string, string>();
      if (templateSections) {
        templateSections.forEach(ts => {
          titlesMap.set(ts.section_number, ts.title);
        });
      }

      // Get last edited by names
      const lastEditedByIds = contentData?.map(c => c.last_edited_by).filter(Boolean) || [];
      let lastEditedByMap = new Map<string, string>();
      if (lastEditedByIds.length > 0) {
        const { data: editorsProfiles } = await supabase
          .from('profiles_basic')
          .select('id, full_name')
          .in('id', lastEditedByIds);
        
        if (editorsProfiles) {
          editorsProfiles.forEach(p => {
            lastEditedByMap.set(p.id, p.full_name || 'Unknown');
          });
        }
      }

      // Build content map
      const contentMap = new Map<string, { content: string; updatedAt: string | null; lastEditedBy: string | null }>();
      if (contentData) {
        contentData.forEach(c => {
          contentMap.set(c.section_id, { 
            content: c.content || '', 
            updatedAt: c.updated_at,
            lastEditedBy: c.last_edited_by 
          });
        });
      }

      // Calculate word count helper
      const countWords = (html: string): number => {
        const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return text ? text.split(' ').filter(w => w.length > 0).length : 0;
      };

      // Build progress items
      const progressItems: SectionProgressItem[] = filteredSectionsData.map(section => {
        const profile = profilesMap.get(section.assigned_to);
        const content = contentMap.get(section.section_number);
        const wordCount = content ? countWords(content.content) : 0;
        
        // Determine if content is placeholder (no real content saved or very similar to placeholder)
        const isPlaceholder = !content || wordCount < 10;
        const hasContent = wordCount > 50; // Consider "has content" if more than 50 words

        return {
          sectionNumber: section.section_number,
          sectionTitle: titlesMap.get(section.section_number) || section.section_number,
          assignedTo: section.assigned_to,
          assignedToName: profile?.full_name || null,
          assignedToAvatar: profile?.avatar_url || null,
          assignedToEmail: profile?.email || null,
          dueDate: section.due_date,
          hasContent,
          isPlaceholder,
          wordCount,
          updatedAt: content?.updatedAt || null,
          lastEditedByName: content?.lastEditedBy ? lastEditedByMap.get(content.lastEditedBy) || null : null,
        };
      });

      // Sort by section number
      progressItems.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));

      // Calculate summary
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      let overdue = 0;
      let dueSoon = 0;
      let completed = 0;
      let inProgress = 0;
      let notStarted = 0;

      progressItems.forEach(item => {
        if (item.hasContent) {
          completed++;
        } else if (item.wordCount > 10) {
          inProgress++;
        } else {
          notStarted++;
        }

        if (item.dueDate) {
          const dueDate = new Date(item.dueDate);
          if (dueDate < now && !item.hasContent) {
            overdue++;
          } else if (dueDate <= threeDaysFromNow && dueDate >= now && !item.hasContent) {
            dueSoon++;
          }
        }
      });

      const summaryData: ProgressSummary = {
        totalAssigned: progressItems.length,
        completed,
        inProgress,
        notStarted,
        overdue,
        dueSoon,
        completionPercentage: progressItems.length > 0 
          ? Math.round((completed / progressItems.length) * 100) 
          : 0,
      };

      setProgress(progressItems);
      setSummary(summaryData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching progress:', error);
      setLoading(false);
    }
  }, [proposalId, currentUserId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Real-time subscription for updates
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`section_progress:${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_template_sections',
        },
        () => fetchProgress()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'section_content',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => fetchProgress()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, fetchProgress]);

  return {
    progress,
    summary,
    loading,
    refetch: fetchProgress,
  };
}
