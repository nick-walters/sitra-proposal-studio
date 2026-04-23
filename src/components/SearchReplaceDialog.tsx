import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
  CaseSensitive,
  Regex,
  WholeWord,
  ReplaceAll,
  X,
  GripHorizontal,
} from 'lucide-react';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { createPortal } from 'react-dom';

const searchPluginKey = new PluginKey('searchHighlight');

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
  const pluginRegistered = useRef(false);

  // Drag state
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const positionInitialized = useRef(false);

  // Initialize position to top-right of viewport
  useEffect(() => {
    if (isOpen && !positionInitialized.current) {
      setPosition({ x: window.innerWidth - 520, y: 80 });
      positionInitialized.current = true;
    }
    if (!isOpen) {
      positionInitialized.current = false;
    }
  }, [isOpen]);

  // Drag handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    setIsDragging(true);
  };

  // Register the search highlight plugin once when the dialog opens
  useEffect(() => {
    if (!editor) return;

    if (isOpen && !pluginRegistered.current) {
      const hasPlugin = editor.state.plugins.some(
        p => p.spec.key === searchPluginKey
      );
      if (!hasPlugin) {
        const plugin = new Plugin({
          key: searchPluginKey,
          state: {
            init: () => ({ decorations: DecorationSet.empty, matches: [] as SearchMatch[], currentIndex: 0 }),
            apply: (tr, prev) => {
              const meta = tr.getMeta(searchPluginKey);
              if (meta) {
                const { matches: m, currentIndex } = meta as { matches: SearchMatch[]; currentIndex: number };
                const decos = m.map((match: SearchMatch, index: number) => {
                  const isCurrent = index === currentIndex;
                  return Decoration.inline(match.from, match.to, {
                    class: isCurrent ? 'search-highlight-current' : 'search-highlight',
                    style: isCurrent
                      ? 'background-color: #f59e0b; color: #000; border-radius: 2px;'
                      : 'background-color: #fde68a; border-radius: 2px;',
                  });
                });
                return { decorations: DecorationSet.create(tr.doc, decos), matches: m, currentIndex };
              }
              return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
            },
          },
          props: {
            decorations(state) {
              return this.getState(state)?.decorations ?? DecorationSet.empty;
            },
          },
        });
        editor.registerPlugin(plugin);
      }
      pluginRegistered.current = true;
    }

    if (!isOpen && pluginRegistered.current) {
      const tr = editor.state.tr.setMeta(searchPluginKey, { matches: [], currentIndex: 0 });
      editor.view.dispatch(tr);
      editor.unregisterPlugin(searchPluginKey);
      pluginRegistered.current = false;
    }
  }, [editor, isOpen]);

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

  useEffect(() => {
    findMatches();
  }, [findMatches]);

  useEffect(() => {
    if (!editor || !pluginRegistered.current) return;
    const tr = editor.state.tr.setMeta(searchPluginKey, {
      matches,
      currentIndex: currentMatchIndex,
    });
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }, [editor, matches, currentMatchIndex]);

  useEffect(() => {
    if (!editor || matches.length === 0) return;
    const match = matches[currentMatchIndex];
    if (match) {
      editor.commands.setTextSelection({ from: match.from, to: match.to });
      const { node } = editor.view.domAtPos(match.from);
      if (node && (node as Element).scrollIntoView) {
        (node as Element).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [editor, matches, currentMatchIndex]);

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
    if (useRegex) {
      try {
        const pattern = new RegExp(searchText, caseSensitive ? '' : 'i');
        replacement = match.text.replace(pattern, replaceText);
      } catch (e) {}
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .deleteSelection()
      .insertContent(replacement)
      .run();

    setMatches([]);
    setTimeout(findMatches, 50);
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;
    const sortedMatches = [...matches].sort((a, b) => b.from - a.from);

    const replacements = sortedMatches.map(match => {
      let replacement = replaceText;
      if (useRegex) {
        try {
          const pattern = new RegExp(searchText, caseSensitive ? '' : 'i');
          replacement = match.text.replace(pattern, replaceText);
        } catch (e) {}
      }
      return { from: match.from, to: match.to, replacement };
    });

    editor.chain().focus().command(({ tr }) => {
      for (const { from, to, replacement } of replacements) {
        tr.replaceWith(from, to, replacement ? editor.schema.text(replacement) : editor.schema.text(''));
      }
      return true;
    }).run();

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

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
        width: 480,
        maxWidth: 'calc(100vw - 32px)',
      }}
      className="rounded-lg border bg-background shadow-lg"
    >
      {/* Drag handle header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-move select-none bg-muted/50 rounded-t-lg"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <GripHorizontal className="w-4 h-4 text-muted-foreground" />
          <Search className="w-4 h-4" />
          Find and Replace
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {/* Search input */}
        <div className="space-y-1.5">
          <Label htmlFor="search-input" className="text-xs">Find</Label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Input
                id="search-input"
                ref={searchInputRef}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search text or /regex/"
                className={`h-8 text-sm ${regexError ? 'border-destructive' : ''}`}
              />
              {matches.length > 0 && (
                <Badge 
                  variant="secondary" 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0"
                >
                  {currentMatchIndex + 1}/{matches.length}
                </Badge>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMatch} disabled={matches.length === 0}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous (Shift+Enter)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMatch} disabled={matches.length === 0}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next (Enter)</TooltipContent>
            </Tooltip>
          </div>
          {regexError && <p className="text-xs text-destructive">{regexError}</p>}
        </div>

        {/* Search options */}
        <div className="flex items-center gap-3 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Switch id="case-sensitive" checked={caseSensitive} onCheckedChange={setCaseSensitive} className="scale-75" />
                <Label htmlFor="case-sensitive" className="flex items-center gap-1 cursor-pointer text-xs">
                  <CaseSensitive className="w-3.5 h-3.5" /> Case
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>Match case</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Switch id="use-regex" checked={useRegex} onCheckedChange={setUseRegex} className="scale-75" />
                <Label htmlFor="use-regex" className="flex items-center gap-1 cursor-pointer text-xs">
                  <Regex className="w-3.5 h-3.5" /> Regex
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>Use regular expressions</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Switch id="whole-word" checked={wholeWord} onCheckedChange={setWholeWord} disabled={useRegex} className="scale-75" />
                <Label htmlFor="whole-word" className="flex items-center gap-1 cursor-pointer text-xs">
                  <WholeWord className="w-3.5 h-3.5" /> Word
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>Match whole word only</TooltipContent>
          </Tooltip>
        </div>

        {/* Replace input */}
        <div className="space-y-1.5">
          <Label htmlFor="replace-input" className="text-xs">Replace with</Label>
          <div className="flex gap-1.5">
            <Input
              id="replace-input"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replacement text"
              className="flex-1 h-8 text-sm"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8" onClick={replaceCurrent} disabled={matches.length === 0}>
                  <Replace className="w-3.5 h-3.5 mr-1" /> Replace
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replace current match</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" size="sm" className="h-8" onClick={replaceAll} disabled={matches.length === 0}>
                  <ReplaceAll className="w-3.5 h-3.5 mr-1" /> All
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replace all ({matches.length})</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Regex help */}
        {useRegex && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md space-y-1">
            <p className="font-medium">Regex patterns:</p>
            <ul className="space-y-0.5 ml-2">
              <li><code className="bg-muted px-1 rounded">.</code> - Any character</li>
              <li><code className="bg-muted px-1 rounded">\d</code> - Digit</li>
              <li><code className="bg-muted px-1 rounded">\w</code> - Word character</li>
              <li><code className="bg-muted px-1 rounded">(text)</code> → <code className="bg-muted px-1 rounded">$1</code> in replace</li>
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
