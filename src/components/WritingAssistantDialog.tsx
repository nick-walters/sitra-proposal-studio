import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Wand2, 
  Sparkles, 
  Scissors, 
  Expand, 
  Globe, 
  Loader2,
  Copy,
  Check,
  ArrowRight
} from 'lucide-react';

interface WritingAssistantDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  onApply: (newText: string) => void;
}

type Action = 'improve_clarity' | 'improve_tone' | 'make_concise' | 'expand' | 'eu_language';

const actions: { id: Action; label: string; icon: React.ReactNode; description: string }[] = [
  { 
    id: 'improve_clarity', 
    label: 'Improve Clarity', 
    icon: <Wand2 className="w-4 h-4" />,
    description: 'Make complex ideas more accessible'
  },
  { 
    id: 'improve_tone', 
    label: 'Improve Tone', 
    icon: <Sparkles className="w-4 h-4" />,
    description: "Apply Sitra's professional tone"
  },
  { 
    id: 'make_concise', 
    label: 'Make Concise', 
    icon: <Scissors className="w-4 h-4" />,
    description: 'Remove redundancy, be direct'
  },
  { 
    id: 'expand', 
    label: 'Expand', 
    icon: <Expand className="w-4 h-4" />,
    description: 'Add detail and strengthen'
  },
  { 
    id: 'eu_language', 
    label: 'EU Language', 
    icon: <Globe className="w-4 h-4" />,
    description: 'Adapt to Horizon Europe style'
  },
];

export function WritingAssistantDialog({ 
  isOpen, 
  onClose, 
  selectedText,
  onApply 
}: WritingAssistantDialogProps) {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAction = useCallback(async (action: Action) => {
    if (!selectedText.trim()) {
      toast.error('No text selected');
      return;
    }

    setLoading(true);
    setActiveAction(action);
    setResult('');

    try {
      const { data, error } = await supabase.functions.invoke('writing-assistant', {
        body: { text: selectedText, action },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setResult(data?.result || '');
    } catch (err) {
      console.error('Writing assistant error:', err);
      toast.error('Failed to process text. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedText]);

  const handleCopy = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const handleApply = useCallback(() => {
    if (result) {
      onApply(result);
      onClose();
      toast.success('Text replaced');
    }
  }, [result, onApply, onClose]);

  const handleClose = () => {
    setResult('');
    setActiveAction(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Writing Assistant
          </DialogTitle>
          <DialogDescription>
            Improve your text with AI-powered suggestions tailored for EU proposals
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="actions" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="actions">Quick Actions</TabsTrigger>
            <TabsTrigger value="result" disabled={!result}>Result</TabsTrigger>
          </TabsList>

          <TabsContent value="actions" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Selected Text</label>
              <div className="p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">
                  {selectedText || <span className="text-muted-foreground italic">Select text in the editor first</span>}
                </p>
              </div>
              {selectedText && (
                <Badge variant="secondary" className="text-xs">
                  {selectedText.split(/\s+/).length} words
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Choose an action</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {actions.map((action) => (
                  <Button
                    key={action.id}
                    variant={activeAction === action.id ? "default" : "outline"}
                    className="h-auto py-3 px-4 justify-start"
                    onClick={() => handleAction(action.id)}
                    disabled={loading || !selectedText.trim()}
                  >
                    <div className="flex items-center gap-3 w-full">
                      {loading && activeAction === action.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        action.icon
                      )}
                      <div className="text-left">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          {action.description}
                        </div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="result" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="gap-1">
                {actions.find(a => a.id === activeAction)?.icon}
                {actions.find(a => a.id === activeAction)?.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Original</label>
                <div className="p-3 bg-muted rounded-md h-[200px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{selectedText}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-primary">Improved</label>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-md h-[200px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{result}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-xs text-muted-foreground">
                {result.split(/\s+/).length} words ({result.split(/\s+/).length - selectedText.split(/\s+/).length > 0 ? '+' : ''}{result.split(/\s+/).length - selectedText.split(/\s+/).length})
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  Copy
                </Button>
                <Button size="sm" onClick={handleApply}>
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Apply Change
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
