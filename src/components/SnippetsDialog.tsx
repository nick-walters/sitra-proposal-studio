import { useState, useCallback } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  FileText, 
  Search, 
  Copy, 
  Plus,
  Target,
  Users,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Shield,
  Leaf,
  Globe2
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
  sectionIds?: string[]; // e.g., ['b1-1', 'b1-2'] - if empty, available in all sections
}

const snippets: Snippet[] = [
  // Impact & Dissemination - B2.1 section
  {
    id: 'dissemination-plan',
    title: 'Dissemination Strategy Overview',
    category: 'Impact',
    tags: ['dissemination', 'communication'],
    sectionIds: ['b2-1'],
    content: `The dissemination strategy will ensure maximum visibility and uptake of project results through a multi-channel approach:

**Scientific Dissemination:**
- Publication in high-impact peer-reviewed journals
- Presentations at international conferences
- Open access publications in line with Horizon Europe requirements

**Stakeholder Engagement:**
- Regular workshops with key stakeholders
- Policy briefs for decision-makers
- Industry engagement through targeted events

**Public Communication:**
- Project website with regular updates
- Social media presence
- Public engagement activities`,
  },
  {
    id: 'exploitation-plan',
    title: 'Exploitation Plan Template',
    category: 'Impact',
    tags: ['exploitation', 'commercialization'],
    sectionIds: ['b2-1'],
    content: `**Exploitation Strategy:**

The consortium has developed a comprehensive exploitation plan to maximize the impact of project outcomes:

1. **IP Management:** Clear IP ownership and licensing framework
2. **Market Analysis:** Identification of target markets and user segments
3. **Commercialization Pathway:** Roadmap from TRL advancement to market entry
4. **Sustainability Plan:** Long-term viability beyond project funding

**Expected Exploitable Results:**
| Result | Owner | Exploitation Route | Timeline |
|--------|-------|-------------------|----------|
| [Result 1] | [Partner] | [Route] | M[X] |`,
  },
  {
    id: 'sustainability-plan',
    title: 'Sustainability Beyond Funding',
    category: 'Impact',
    tags: ['sustainability', 'long-term'],
    sectionIds: ['b2-1'],
    content: `**Sustainability Strategy:**

The project has developed a clear sustainability roadmap to ensure continuity beyond EC funding:

**Financial Sustainability:**
- Revenue generation through licensing/services
- Follow-up funding applications
- Industry partnerships

**Institutional Sustainability:**
- Integration into partner organizations' ongoing activities
- Establishment of governance structures
- Knowledge transfer mechanisms

**Community Sustainability:**
- Open source contributions
- Active user community building
- Training and capacity building`,
  },
  // Excellence - B1.1 section
  {
    id: 'state-of-art',
    title: 'State-of-the-Art Analysis',
    category: 'Excellence',
    tags: ['sota', 'background'],
    sectionIds: ['b1-1'],
    content: `**Current State-of-the-Art:**

The project builds upon and advances the current state-of-the-art in [field]:

| Aspect | Current SotA | Project Advancement |
|--------|-------------|---------------------|
| [Aspect 1] | [Current] | [Advancement] |
| [Aspect 2] | [Current] | [Advancement] |

**Key Limitations of Existing Solutions:**
- [Limitation 1]
- [Limitation 2]

**How This Project Goes Beyond:**
The proposed approach addresses these limitations through [methodology], resulting in [expected improvements].`,
  },
  {
    id: 'methodology-overview',
    title: 'Methodology Framework',
    category: 'Excellence',
    tags: ['methodology', 'approach'],
    sectionIds: ['b1-1', 'b1-2'],
    content: `**Methodological Approach:**

The project employs a rigorous methodological framework structured around three pillars:

**1. Research Methodology:**
- [Approach 1]
- [Approach 2]

**2. Validation Strategy:**
- Laboratory validation
- Field testing
- User validation studies

**3. Quality Assurance:**
- Peer review processes
- Milestone-based evaluation
- External advisory input`,
  },
  // Implementation - B1.2 section
  {
    id: 'risk-management',
    title: 'Risk Management Table',
    category: 'Implementation',
    tags: ['risks', 'mitigation'],
    sectionIds: ['b1-2'],
    content: `**Risk Management Strategy:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Technical delays | Medium | High | Buffer time in schedule; parallel development paths |
| Partner withdrawal | Low | High | Clear commitment agreements; backup expertise |
| Regulatory changes | Low | Medium | Continuous monitoring; flexible approach |
| Market changes | Medium | Medium | Regular market analysis; adaptive strategy |

**Contingency Measures:**
- Regular risk reviews at consortium meetings
- Early warning indicators established
- Clear escalation procedures`,
  },
  {
    id: 'consortium-strength',
    title: 'Consortium Excellence',
    category: 'Implementation',
    tags: ['consortium', 'partners'],
    sectionIds: ['b1-2'],
    content: `**Consortium Excellence:**

The consortium brings together [X] partners from [Y] countries, combining:

**Complementary Expertise:**
- Academic excellence in [areas]
- Industrial leadership in [sectors]
- Policy/regulatory experience

**Track Record:**
- Combined €[X]M in relevant EU funding
- [X] joint publications
- Previous successful collaborations

**Resource Commitment:**
The partners commit significant resources to ensure project success, including [specific resources].`,
  },
  // Cross-cutting - available in multiple sections
  {
    id: 'gender-equality',
    title: 'Gender Equality Plan',
    category: 'Cross-cutting',
    tags: ['gender', 'equality', 'diversity'],
    sectionIds: ['b1-1', 'b1-2', 'b2-1'],
    content: `**Gender Dimension:**

The project is committed to promoting gender equality across all activities:

**Team Composition:**
- [X]% female researchers in project team
- Gender-balanced management structure
- Active recruitment of underrepresented groups

**Research Content:**
- Sex/gender analysis integrated in research design
- Gender-disaggregated data collection where relevant
- Consideration of gender-specific impacts

**Working Environment:**
- Flexible working arrangements
- Family-friendly meeting scheduling
- Equal opportunity policies`,
  },
  {
    id: 'open-science',
    title: 'Open Science Statement',
    category: 'Cross-cutting',
    tags: ['open science', 'FAIR', 'data'],
    sectionIds: ['b1-1', 'b2-1'],
    content: `**Open Science Practices:**

The project is committed to Open Science principles in line with Horizon Europe requirements:

**Open Access Publications:**
- All peer-reviewed publications in open access
- Immediate deposit in open repositories
- CC-BY licensing for publications

**FAIR Data Management:**
- Findable: DOIs and rich metadata
- Accessible: Open repositories (e.g., Zenodo)
- Interoperable: Standard formats and vocabularies
- Reusable: Clear licensing and documentation

**Open Source:**
- Software released under open source licenses where appropriate
- Active community engagement`,
  },
  {
    id: 'ethics-statement',
    title: 'Ethics Considerations',
    category: 'Cross-cutting',
    tags: ['ethics', 'responsible research'],
    sectionIds: ['b1-1', 'b1-2'],
    content: `**Ethical Considerations:**

The project adheres to the highest ethical standards:

**Research Ethics:**
- Compliance with all relevant national and EU regulations
- Ethics approval obtained where required
- Informed consent procedures for human participants

**Data Protection:**
- GDPR compliance ensured
- Data Protection Officer appointed
- Privacy-by-design principles applied

**Responsible Research:**
- No dual-use concerns identified
- Environmental impact considered
- Societal implications assessed`,
  },
];

const categoryIcons: Record<string, React.ReactNode> = {
  'Impact': <TrendingUp className="w-4 h-4" />,
  'Excellence': <Lightbulb className="w-4 h-4" />,
  'Implementation': <Target className="w-4 h-4" />,
  'Cross-cutting': <Globe2 className="w-4 h-4" />,
};

export function SnippetsDialog({ 
  isOpen, 
  onClose, 
  onInsert,
  sectionId 
}: SnippetsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Normalize section ID for matching (e.g., 'B1.1' -> 'b1-1', 'b1-1' -> 'b1-1')
  const normalizedSectionId = sectionId
    ?.toLowerCase()
    .replace(/^[a-z]/, '') // Remove letter prefix
    .replace('.', '-'); // Replace dot with dash

  // Filter snippets based on section first
  const sectionFilteredSnippets = snippets.filter(snippet => {
    // If no sectionIds specified, show in all sections (backwards compat)
    if (!snippet.sectionIds || snippet.sectionIds.length === 0) return true;
    // If we have a sectionId, check if this snippet is available for this section
    if (!normalizedSectionId) return true;
    return snippet.sectionIds.some(sid => sid === normalizedSectionId || sid === sectionId);
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
            Templates & Snippets
          </DialogTitle>
          <DialogDescription>
            Pre-written text blocks for common proposal sections
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start">
            {categories.map(cat => (
              <TabsTrigger key={cat} value={cat} className="capitalize">
                {cat === 'all' ? 'All' : (
                  <span className="flex items-center gap-1">
                    {categoryIcons[cat]}
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
                  No snippets found matching your search
                </div>
              ) : (
                filteredSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h4 className="font-medium">{snippet.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs gap-1">
                            {categoryIcons[snippet.category]}
                            {snippet.category}
                          </Badge>
                          {snippet.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(snippet)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleInsert(snippet)}
                        >
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
