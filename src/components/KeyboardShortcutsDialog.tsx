import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Keyboard } from "lucide-react";

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
    mac?: string[];
  }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Text Formatting",
    shortcuts: [
      { keys: ["Ctrl", "B"], mac: ["⌘", "B"], description: "Bold" },
      { keys: ["Ctrl", "I"], mac: ["⌘", "I"], description: "Italic" },
      { keys: ["Ctrl", "U"], mac: ["⌘", "U"], description: "Underline" },
      { keys: ["Ctrl", "Shift", "X"], mac: ["⌘", "Shift", "X"], description: "Strikethrough" },
      { keys: ["Ctrl", "`"], mac: ["⌘", "`"], description: "Inline code" },
    ]
  },
  {
    title: "Paragraphs & Structure",
    shortcuts: [
      { keys: ["Ctrl", "Shift", "1"], mac: ["⌘", "Shift", "1"], description: "Heading 1" },
      { keys: ["Ctrl", "Shift", "2"], mac: ["⌘", "Shift", "2"], description: "Heading 2" },
      { keys: ["Ctrl", "Shift", "3"], mac: ["⌘", "Shift", "3"], description: "Heading 3" },
      { keys: ["Ctrl", "Shift", "7"], mac: ["⌘", "Shift", "7"], description: "Ordered list" },
      { keys: ["Ctrl", "Shift", "8"], mac: ["⌘", "Shift", "8"], description: "Bullet list" },
      { keys: ["Ctrl", "Shift", "B"], mac: ["⌘", "Shift", "B"], description: "Blockquote" },
      { keys: ["Ctrl", "Shift", "↑"], mac: ["⌘", "Shift", "↑"], description: "Move block up" },
      { keys: ["Ctrl", "Shift", "↓"], mac: ["⌘", "Shift", "↓"], description: "Move block down" },
      { keys: ["Tab"], description: "Indent list item" },
      { keys: ["Shift", "Tab"], description: "Outdent list item" },
    ]
  },
  {
    title: "Text Alignment",
    shortcuts: [
      { keys: ["Ctrl", "Shift", "L"], mac: ["⌘", "Shift", "L"], description: "Align left" },
      { keys: ["Ctrl", "Shift", "E"], mac: ["⌘", "Shift", "E"], description: "Align center" },
      { keys: ["Ctrl", "Shift", "R"], mac: ["⌘", "Shift", "R"], description: "Align right" },
      { keys: ["Ctrl", "Shift", "J"], mac: ["⌘", "Shift", "J"], description: "Justify" },
    ]
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["Ctrl", "Z"], mac: ["⌘", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], mac: ["⌘", "Shift", "Z"], description: "Redo" },
      { keys: ["Ctrl", "Y"], mac: ["⌘", "Y"], description: "Redo (alternative)" },
      { keys: ["Ctrl", "A"], mac: ["⌘", "A"], description: "Select all" },
      { keys: ["Ctrl", "C"], mac: ["⌘", "C"], description: "Copy" },
      { keys: ["Ctrl", "X"], mac: ["⌘", "X"], description: "Cut" },
      { keys: ["Ctrl", "V"], mac: ["⌘", "V"], description: "Paste" },
    ]
  },
  {
    title: "Search & Navigation",
    shortcuts: [
      { keys: ["Ctrl", "F"], mac: ["⌘", "F"], description: "Find & Replace" },
      { keys: ["Ctrl", "H"], mac: ["⌘", "H"], description: "Replace (alternative)" },
      { keys: ["F3"], description: "Find next" },
      { keys: ["Shift", "F3"], description: "Find previous" },
      { keys: ["Esc"], description: "Close dialog / Cancel" },
    ]
  },
  {
    title: "Links & Media",
    shortcuts: [
      { keys: ["Ctrl", "K"], mac: ["⌘", "K"], description: "Insert/edit link" },
      { keys: ["Ctrl", "Shift", "K"], mac: ["⌘", "Shift", "K"], description: "Remove link" },
    ]
  },
  {
    title: "Tables",
    shortcuts: [
      { keys: ["Tab"], description: "Move to next cell" },
      { keys: ["Shift", "Tab"], description: "Move to previous cell" },
      { keys: ["Enter"], description: "Insert row below (in last cell)" },
    ]
  },
];

function ShortcutKey({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 min-w-[24px] text-xs font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  );
}

function ShortcutDisplay({ keys, mac }: { keys: string[]; mac?: string[] }) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const displayKeys = isMac && mac ? mac : keys;
  
  return (
    <div className="flex items-center gap-1">
      {displayKeys.map((key, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <ShortcutKey>{key}</ShortcutKey>
          {idx < displayKeys.length - 1 && <span className="text-muted-foreground">+</span>}
        </span>
      ))}
    </div>
  );
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick reference for all available keyboard shortcuts in the editor.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {shortcutGroups.map((group, groupIdx) => (
              <div key={group.title}>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  {group.title}
                  <Badge variant="secondary" className="text-[10px]">
                    {group.shortcuts.length}
                  </Badge>
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">
                        {shortcut.description}
                      </span>
                      <ShortcutDisplay keys={shortcut.keys} mac={shortcut.mac} />
                    </div>
                  ))}
                </div>
                {groupIdx < shortcutGroups.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t text-xs text-muted-foreground">
          <span>
            Press <ShortcutKey>?</ShortcutKey> or <ShortcutKey>Ctrl</ShortcutKey>+<ShortcutKey>/</ShortcutKey> to open this panel
          </span>
          <span>
            {typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') 
              ? 'Showing Mac shortcuts' 
              : 'Showing Windows/Linux shortcuts'}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
