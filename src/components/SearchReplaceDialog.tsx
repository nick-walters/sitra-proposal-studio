import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Search, 
  Replace, 
  ChevronUp, 
  ChevronDown, 
  X,
  CaseSensitive,
  Regex,
  WholeWord,
  ReplaceAll,
} from 'lucide-react';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Plugin, PluginKey } from 'prosemirror-state';

interface SearchReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

interface SearchMatch {
  from: number;
  to: number;
  text: string;
}

export function SearchReplaceDialog({ isOpen, onClose, editor }: SearchReplaceDialogProps) {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find all matches in the document
  const findMatches = useCallback(() => {
    if (!editor || !searchText) {
      setMatches([]);
      setRegexError(null);
      return;
    }

    const doc = editor.state.doc;
    const foundMatches: SearchMatch[] = [];
    let searchPattern: RegExp;

    try {
      if (useRegex) {
        searchPattern = new RegExp(searchText, caseSensitive ? 'g' : 'gi');
      } else {
        // Escape special regex characters for literal search
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
        searchPattern = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      }
      setRegexError(null);
    } catch (e) {
      setRegexError((e as Error).message);
      setMatches([]);
      return;
    }

    // Iterate through text content
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        let match;
        while ((match = searchPattern.exec(node.text)) !== null) {
          foundMatches.push({
            from: pos + match.index,
            to: pos + match.index + match[0].length,
            text: match[0],
          });
        }
      }
    });

    setMatches(foundMatches);
    if (foundMatches.length > 0 && currentMatchIndex >= foundMatches.length) {
      setCurrentMatchIndex(0);
    }
  }, [editor, searchText, caseSensitive, useRegex, wholeWord, currentMatchIndex]);

  // Update matches when search parameters change
  useEffect(() => {
    findMatches();
  }, [findMatches]);

  // Apply decorations to highlight matches
  useEffect(() => {
    if (!editor) return;

    const decorations: Decoration[] = matches.map((match, index) => {
      const isCurrentMatch = index === currentMatchIndex;
      return Decoration.inline(match.from, match.to, {
        class: isCurrentMatch 
          ? 'search-highlight-current' 
          : 'search-highlight',
        style: isCurrentMatch
          ? 'background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: 2px;'
          : 'background-color: hsl(var(--accent)); border-radius: 2px;',
      });
    });

    // Create and register the search highlight plugin
    const pluginKeyName = 'searchHighlight';
    
    // Remove any existing search highlight plugin
    const existingPlugins = editor.state.plugins.filter(
      p => (p.spec as any).key !== pluginKeyName
    );

    if (matches.length > 0) {
      const plugin = new Plugin({
        key: new PluginKey(pluginKeyName),
        state: {
          init: () => DecorationSet.create(editor.state.doc, decorations),
          apply: (tr, set) => {
            // Rebuild decorations on each transaction for simplicity
            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
        spec: {
          key: pluginKeyName,
        },
      });

      const newState = editor.state.reconfigure({
        plugins: [...existingPlugins, plugin],
      });
      editor.view.updateState(newState);
    } else {
      const newState = editor.state.reconfigure({
        plugins: existingPlugins,
      });
      editor.view.updateState(newState);
    }

    return () => {
      // Cleanup: remove the plugin when dialog closes
      if (!isOpen && editor) {
        const cleanPlugins = editor.state.plugins.filter(
          p => (p.spec as any).key !== pluginKeyName
        );
        const cleanState = editor.state.reconfigure({ plugins: cleanPlugins });
        editor.view.updateState(cleanState);
      }
    };
  }, [editor, matches, currentMatchIndex, isOpen]);

  // Navigate to current match
  useEffect(() => {
    if (!editor || matches.length === 0) return;
    
    const match = matches[currentMatchIndex];
    if (match) {
      editor.commands.setTextSelection({ from: match.from, to: match.to });
      // Scroll to selection
      const { node } = editor.view.domAtPos(match.from);
      if (node && (node as Element).scrollIntoView) {
        (node as Element).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [editor, matches, currentMatchIndex]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const goToPrevMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const replaceCurrent = () => {
    if (!editor || matches.length === 0) return;
    
    const match = matches[currentMatchIndex];
    if (!match) return;

    let replacement = replaceText;
    
    // Handle regex group replacements ($1, $2, etc.)
    if (useRegex) {
      try {
        const pattern = new RegExp(searchText, caseSensitive ? '' : 'i');
        replacement = match.text.replace(pattern, replaceText);
      } catch (e) {
        // Fall back to literal replacement
      }
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .deleteSelection()
      .insertContent(replacement)
      .run();

    // Clear stale decorations immediately, then refresh
    setMatches([]);
    setTimeout(findMatches, 50);
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;

    // Process matches in reverse order to maintain positions
    const sortedMatches = [...matches].sort((a, b) => b.from - a.from);

    // Build replacements list
    const replacements = sortedMatches.map(match => {
      let replacement = replaceText;
      if (useRegex) {
        try {
          const pattern = new RegExp(searchText, caseSensitive ? '' : 'i');
          replacement = match.text.replace(pattern, replaceText);
        } catch (e) {
          // Fall back to literal replacement
        }
      }
      return { from: match.from, to: match.to, replacement };
    });

    // Apply all replacements in a single transaction
    editor.chain().focus().command(({ tr }) => {
      for (const { from, to, replacement } of replacements) {
        tr.replaceWith(from, to, replacement ? editor.schema.text(replacement) : editor.schema.text(''));
      }
      return true;
    }).run();

    // Clear stale decorations immediately, then refresh
    setMatches([]);
    setTimeout(findMatches, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Find and Replace
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="space-y-2">
            <Label htmlFor="search-input">Find</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="search-input"
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search text or /regex/"
                  className={regexError ? 'border-destructive' : ''}
                />
                {matches.length > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                  >
                    {currentMatchIndex + 1} / {matches.length}
                  </Badge>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPrevMatch}
                    disabled={matches.length === 0}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous match (Shift+Enter)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextMatch}
                    disabled={matches.length === 0}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next match (Enter)</TooltipContent>
              </Tooltip>
            </div>
            {regexError && (
              <p className="text-xs text-destructive">{regexError}</p>
            )}
          </div>

          {/* Search options */}
          <div className="flex items-center gap-4 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Switch
                    id="case-sensitive"
                    checked={caseSensitive}
                    onCheckedChange={setCaseSensitive}
                  />
                  <Label htmlFor="case-sensitive" className="flex items-center gap-1 cursor-pointer text-sm">
                    <CaseSensitive className="w-4 h-4" />
                    Case
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>Match case</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Switch
                    id="use-regex"
                    checked={useRegex}
                    onCheckedChange={setUseRegex}
                  />
                  <Label htmlFor="use-regex" className="flex items-center gap-1 cursor-pointer text-sm">
                    <Regex className="w-4 h-4" />
                    Regex
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>Use regular expressions</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Switch
                    id="whole-word"
                    checked={wholeWord}
                    onCheckedChange={setWholeWord}
                    disabled={useRegex}
                  />
                  <Label htmlFor="whole-word" className="flex items-center gap-1 cursor-pointer text-sm">
                    <WholeWord className="w-4 h-4" />
                    Word
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>Match whole word only</TooltipContent>
            </Tooltip>
          </div>

          {/* Replace input */}
          <div className="space-y-2">
            <Label htmlFor="replace-input">Replace with</Label>
            <div className="flex gap-2">
              <Input
                id="replace-input"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Replacement text"
                className="flex-1"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={replaceCurrent}
                    disabled={matches.length === 0}
                  >
                    <Replace className="w-4 h-4 mr-1" />
                    Replace
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Replace current match</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    onClick={replaceAll}
                    disabled={matches.length === 0}
                  >
                    <ReplaceAll className="w-4 h-4 mr-1" />
                    All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Replace all matches ({matches.length})</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Regex help */}
          {useRegex && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md space-y-1">
              <p className="font-medium">Regex patterns:</p>
              <ul className="space-y-0.5 ml-2">
                <li><code className="bg-muted px-1 rounded">.</code> - Any character</li>
                <li><code className="bg-muted px-1 rounded">\d</code> - Digit</li>
                <li><code className="bg-muted px-1 rounded">\w</code> - Word character</li>
                <li><code className="bg-muted px-1 rounded">^</code> / <code className="bg-muted px-1 rounded">$</code> - Start/end of line</li>
                <li><code className="bg-muted px-1 rounded">(text)</code> - Capture group → use <code className="bg-muted px-1 rounded">$1</code> in replace</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
