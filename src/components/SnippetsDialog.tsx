import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  FileText, 
  Search, 
  Copy, 
  Plus,
  Target,
  Lightbulb,
  TrendingUp,
  Globe2,
  Trash2,
  Loader2,
  Save,
} from 'lucide-react';

interface SnippetsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (content: string) => void;
  sectionId?: string;
}

interface Snippet {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  section_ids?: string[];
  is_default?: boolean;
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Impact': <TrendingUp className="w-4 h-4" />,
  'Excellence': <Lightbulb className="w-4 h-4" />,
  'Implementation': <Target className="w-4 h-4" />,
  'Cross-cutting': <Globe2 className="w-4 h-4" />,
  'Custom': <FileText className="w-4 h-4" />,
};

// Default built-in snippets (always available)
const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: 'dissemination-plan',
    title: 'Dissemination Strategy Overview',
    category: 'Impact',
    tags: ['dissemination', 'communication'],
    section_ids: ['b2-1'],
    is_default: true,
    content: `The dissemination strategy will ensure maximum visibility and uptake of project results through a multi-channel approach:\n\n**Scientific Dissemination:**\n- Publication in high-impact peer-reviewed journals\n- Presentations at international conferences\n- Open access publications in line with Horizon Europe requirements\n\n**Stakeholder Engagement:**\n- Regular workshops with key stakeholders\n- Policy briefs for decision-makers\n- Industry engagement through targeted events`,
  },
  {
    id: 'exploitation-plan',
    title: 'Exploitation Plan Template',
    category: 'Impact',
    tags: ['exploitation', 'commercialization'],
    section_ids: ['b2-1'],
    is_default: true,
    content: `**Exploitation Strategy:**\n\nThe consortium has developed a comprehensive exploitation plan:\n\n1. **IP Management:** Clear IP ownership and licensing framework\n2. **Market Analysis:** Identification of target markets and user segments\n3. **Commercialization Pathway:** Roadmap from TRL advancement to market entry\n4. **Sustainability Plan:** Long-term viability beyond project funding`,
  },
  {
    id: 'state-of-art',
    title: 'State-of-the-Art Analysis',
    category: 'Excellence',
    tags: ['sota', 'background'],
    section_ids: ['b1-1'],
    is_default: true,
    content: `**Current State-of-the-Art:**\n\nThe project builds upon and advances the current state-of-the-art in [field]:\n\n| Aspect | Current SotA | Project Advancement |\n|--------|-------------|---------------------|\n| [Aspect 1] | [Current] | [Advancement] |\n\n**Key Limitations of Existing Solutions:**\n- [Limitation 1]\n- [Limitation 2]\n\n**How This Project Goes Beyond:**\nThe proposed approach addresses these limitations through [methodology].`,
  },
  {
    id: 'risk-management',
    title: 'Risk Management Table',
    category: 'Implementation',
    tags: ['risks', 'mitigation'],
    section_ids: ['b1-2'],
    is_default: true,
    content: `**Risk Management Strategy:**\n\n| Risk | Likelihood | Impact | Mitigation |\n|------|-----------|--------|------------|\n| Technical delays | Medium | High | Buffer time; parallel paths |\n| Partner withdrawal | Low | High | Backup expertise |\n| Regulatory changes | Low | Medium | Continuous monitoring |`,
  },
  {
    id: 'gender-equality',
    title: 'Gender Equality Plan',
    category: 'Cross-cutting',
    tags: ['gender', 'equality', 'diversity'],
    section_ids: ['b1-1', 'b1-2', 'b2-1'],
    is_default: true,
    content: `**Gender Dimension:**\n\nThe project promotes gender equality across all activities:\n\n**Team Composition:** [X]% female researchers, gender-balanced management\n**Research Content:** Sex/gender analysis integrated in research design\n**Working Environment:** Flexible arrangements, equal opportunity policies`,
  },
  {
    id: 'open-science',
    title: 'Open Science Statement',
    category: 'Cross-cutting',
    tags: ['open science', 'FAIR', 'data'],
    section_ids: ['b1-1', 'b2-1'],
    is_default: true,
    content: `**Open Science Practices:**\n\n**Open Access:** All peer-reviewed publications in open access with CC-BY licensing\n**FAIR Data:** DOIs, open repositories (Zenodo), standard formats\n**Open Source:** Software released under open source licenses where appropriate`,
  },
];

export function SnippetsDialog({ 
  isOpen, 
  onClose, 
  onInsert,
  sectionId 
}: SnippetsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('Custom');

  // Fetch user snippets from DB
  const { data: dbSnippets = [], isLoading } = useQuery({
    queryKey: ['snippet-library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('snippet_library')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(s => ({
        id: s.id,
        title: s.title,
        content: s.content,
        category: s.category || 'Custom',
        tags: s.tags || [],
        section_ids: s.section_ids || [],
        is_default: false,
      })) as Snippet[];
    },
    enabled: isOpen,
  });

  const allSnippets = [...dbSnippets, ...DEFAULT_SNIPPETS];

  // Normalize section ID
  const normalizedSectionId = sectionId
    ?.toLowerCase()
    .replace(/^[a-z]/, '')
    .replace(/\./g, '-');

  const sectionFilteredSnippets = allSnippets.filter(snippet => {
    if (!snippet.section_ids || snippet.section_ids.length === 0) return true;
    if (!normalizedSectionId) return true;
    return snippet.section_ids.some(sid => sid === normalizedSectionId || sid === sectionId);
  });

  const categories = ['all', ...Array.from(new Set(sectionFilteredSnippets.map(s => s.category)))];

  const filteredSnippets = sectionFilteredSnippets.filter(snippet => {
    const matchesSearch = searchQuery === '' || 
      snippet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || snippet.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const saveSnippet = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!newTitle.trim() || !newContent.trim()) throw new Error('Title and content required');
      const { error } = await supabase.from('snippet_library').insert({
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        tags: [],
        section_ids: [],
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snippet-library'] });
      setIsCreating(false);
      setNewTitle('');
      setNewContent('');
      toast.success('Snippet saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save snippet'),
  });

  const deleteSnippet = useMutation({
    mutationFn: async (snippetId: string) => {
      const { error } = await supabase.from('snippet_library').delete().eq('id', snippetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snippet-library'] });
      toast.success('Snippet deleted');
    },
    onError: () => toast.error('Failed to delete snippet'),
  });

  const handleInsert = useCallback((snippet: Snippet) => {
    onInsert(snippet.content);
    onClose();
    toast.success(`Inserted "${snippet.title}"`);
  }, [onInsert, onClose]);

  const handleCopy = useCallback((snippet: Snippet) => {
    navigator.clipboard.writeText(snippet.content);
    toast.success('Copied to clipboard');
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Reusable Content Library
          </DialogTitle>
          <DialogDescription>
            Pre-written snippets and your saved content blocks
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setIsCreating(!isCreating)}>
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>

        {/* Create new snippet form */}
        {isCreating && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <Input
              placeholder="Snippet title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder="Snippet content (supports markdown)"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="min-h-[100px]"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button size="sm" className="gap-1" onClick={() => saveSnippet.mutate()} disabled={saveSnippet.isPending}>
                {saveSnippet.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start">
            {categories.map(cat => (
              <TabsTrigger key={cat} value={cat} className="capitalize">
                {cat === 'all' ? 'All' : (
                  <span className="flex items-center gap-1">
                    {categoryIcons[cat] || <FileText className="w-4 h-4" />}
                    {cat}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <div className="grid gap-3 pr-4">
              {filteredSnippets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No snippets found
                </div>
              ) : (
                filteredSnippets.map((snippet) => (
                  <div key={snippet.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h4 className="font-medium">{snippet.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs gap-1">
                            {categoryIcons[snippet.category] || <FileText className="w-3 h-3" />}
                            {snippet.category}
                          </Badge>
                          {snippet.is_default && (
                            <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
                          )}
                          {snippet.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleCopy(snippet)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        {!snippet.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSnippet.mutate(snippet.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleInsert(snippet)}>
                          <Plus className="w-4 h-4 mr-1" />
                          Insert
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-muted/50 rounded-md max-h-32 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                        {snippet.content.slice(0, 300)}
                        {snippet.content.length > 300 && '...'}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
