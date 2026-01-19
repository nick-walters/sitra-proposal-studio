import { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Type, 
  Wand2, 
  MessageSquare,
  Loader2,
  X,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Suggestion {
  original: string;
  replacement: string;
  type: 'grammar' | 'spelling' | 'style' | 'clarity' | 'wordiness' | 'punctuation';
  explanation: string;
}

interface GrammarCheckerProps {
  text: string;
  onApplySuggestion?: (original: string, replacement: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  grammar: <Type className="w-3.5 h-3.5" />,
  spelling: <AlertCircle className="w-3.5 h-3.5" />,
  style: <Wand2 className="w-3.5 h-3.5" />,
  clarity: <MessageSquare className="w-3.5 h-3.5" />,
  wordiness: <Type className="w-3.5 h-3.5" />,
  punctuation: <Type className="w-3.5 h-3.5" />,
};

const typeColors: Record<string, string> = {
  grammar: 'bg-destructive/10 text-destructive border-destructive/20',
  spelling: 'bg-destructive/10 text-destructive border-destructive/20',
  style: 'bg-primary/10 text-primary border-primary/20',
  clarity: 'bg-warning/10 text-warning border-warning/20',
  wordiness: 'bg-muted text-muted-foreground border-border',
  punctuation: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function GrammarChecker({ text, onApplySuggestion, isOpen, onClose }: GrammarCheckerProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());

  const checkGrammar = useCallback(async () => {
    if (!text || text.trim().length < 10) {
      toast.info("Please add more text before checking grammar");
      return;
    }

    setIsLoading(true);
    setAppliedSuggestions(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('grammar-check', {
        body: { text }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setSuggestions(data.suggestions || []);
      
      if (data.suggestions?.length === 0) {
        toast.success("No issues found! Your text looks great.");
      } else {
        toast.info(`Found ${data.suggestions.length} suggestion(s)`);
      }
    } catch (error) {
      console.error('Grammar check error:', error);
      toast.error("Failed to check grammar. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [text]);

  const handleApply = (suggestion: Suggestion, index: number) => {
    if (onApplySuggestion) {
      onApplySuggestion(suggestion.original, suggestion.replacement);
      setAppliedSuggestions(prev => new Set([...prev, index]));
    }
  };

  if (!isOpen) return null;

  return (
    <Card className="absolute right-4 top-14 w-80 z-50 shadow-lg border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">AI Grammar Check</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button 
          onClick={checkGrammar} 
          disabled={isLoading}
          className="w-full gap-2"
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Check Grammar & Style
            </>
          )}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <ScrollArea className="max-h-[400px]">
          <div className="p-2 space-y-2">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={`p-3 rounded-md border ${
                  appliedSuggestions.has(index) 
                    ? 'bg-success/10 border-success/20 opacity-60' 
                    : 'bg-card'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] px-1.5 py-0.5 ${typeColors[suggestion.type]}`}
                  >
                    {typeIcons[suggestion.type]}
                    <span className="ml-1 capitalize">{suggestion.type}</span>
                  </Badge>
                  {appliedSuggestions.has(index) && (
                    <CheckCircle2 className="w-4 h-4 text-success ml-auto" />
                  )}
                </div>

                <div className="text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-destructive line-through">{suggestion.original}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-success font-medium">{suggestion.replacement}</span>
                  </div>
                  <p className="text-muted-foreground">{suggestion.explanation}</p>
                </div>

                {!appliedSuggestions.has(index) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs w-full"
                    onClick={() => handleApply(suggestion, index)}
                  >
                    Apply Suggestion
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {!isLoading && suggestions.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Click "Check Grammar & Style" to analyze your text
        </div>
      )}
    </Card>
  );
}
