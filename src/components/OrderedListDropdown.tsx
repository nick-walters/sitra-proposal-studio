import { ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ListStyleType = 'decimal' | 'lower-alpha' | 'lower-roman';

interface OrderedListDropdownProps {
  /** TipTap editor instance — if provided, uses TipTap commands */
  editor?: any;
  /** Fallback for non-TipTap editors (e.g. execCommand-based) */
  onInsertOrderedList?: (style: ListStyleType) => void;
  active?: boolean;
  buttonClassName?: string;
  iconClassName?: string;
}

const LIST_STYLES: { label: string; preview: string; value: ListStyleType }[] = [
  { label: 'Numbered', preview: '1. 2. 3.', value: 'decimal' },
  { label: 'Lettered', preview: 'a. b. c.', value: 'lower-alpha' },
  { label: 'Roman', preview: 'i. ii. iii.', value: 'lower-roman' },
];

export function OrderedListDropdown({
  editor,
  onInsertOrderedList,
  active,
  buttonClassName = 'h-7 w-7',
  iconClassName = 'w-4 h-4',
}: OrderedListDropdownProps) {
  const handleSelect = (style: ListStyleType) => {
    if (editor) {
      if (editor.isActive('orderedList')) {
        const currentStyle = editor.getAttributes('orderedList')?.listStyleType || 'decimal';
        if (currentStyle === style) {
          // Same style selected — toggle list off
          editor.chain().focus().toggleOrderedList().run();
        } else {
          editor.chain().focus().updateAttributes('orderedList', { listStyleType: style }).run();
        }
      } else {
        editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { listStyleType: style }).run();
      }
    } else if (onInsertOrderedList) {
      onInsertOrderedList(style);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
 variant={active ? 'secondary' : 'ghost'}
 size="icon"
 className={buttonClassName}
 title="Numbered list"
 aria-label="Numbered list" >
          <ListOrdered className={iconClassName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {LIST_STYLES.map((style) => (
          <DropdownMenuItem
            key={style.value}
            onClick={() => handleSelect(style.value)}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-sm">{style.label}</span>
            <span className="text-xs text-muted-foreground font-mono">{style.preview}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
