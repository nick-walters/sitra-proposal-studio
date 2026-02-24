import { useState, useRef, useCallback, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface MentionMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url?: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  teamMembers: MentionMember[];
  autoFocus?: boolean;
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Extract mentioned user IDs from text containing @[Name](id) patterns */
export function extractMentionedUserIds(text: string): string[] {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  const ids: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[2]);
  }
  return ids;
}

/** Render text with @mentions highlighted as JSX */
export function renderMentionContent(text: string) {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className="text-primary font-medium bg-primary/10 px-1 rounded"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Convert raw value (with @[Name](id)) to display value (with @Name)
 * and build a position mapping so we can convert cursor positions.
 */
function rawToDisplay(raw: string): { display: string; mentions: { rawStart: number; rawEnd: number; displayStart: number; displayEnd: number; name: string; id: string }[] } {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  const mentions: { rawStart: number; rawEnd: number; displayStart: number; displayEnd: number; name: string; id: string }[] = [];
  let display = '';
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    display += raw.slice(lastIndex, match.index);
    const displayName = `@${match[1]}`;
    const displayStart = display.length;
    display += displayName;
    mentions.push({
      rawStart: match.index,
      rawEnd: match.index + match[0].length,
      displayStart,
      displayEnd: display.length,
      name: match[1],
      id: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  display += raw.slice(lastIndex);
  return { display, mentions };
}

/**
 * Convert a cursor position in display text back to position in raw text.
 */
function displayPosToRawPos(displayPos: number, raw: string): number {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let rawOffset = 0;
  let displayOffset = 0;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const textBefore = raw.slice(lastIndex, match.index);
    const textBeforeLen = textBefore.length;
    
    if (displayPos <= displayOffset + textBeforeLen) {
      return match.index - (displayOffset + textBeforeLen - displayPos);
    }
    
    displayOffset += textBeforeLen;
    const displayName = `@${match[1]}`;
    const displayNameLen = displayName.length;
    
    if (displayPos <= displayOffset + displayNameLen) {
      // Cursor is inside a mention display — snap to end of raw mention
      return match.index + match[0].length;
    }
    
    displayOffset += displayNameLen;
    lastIndex = match.index + match[0].length;
  }

  // After all mentions
  const remaining = displayPos - displayOffset;
  return lastIndex + remaining;
}

/**
 * Convert a cursor position in raw text to position in display text.
 */
function rawPosToDisplayPos(rawPos: number, raw: string): number {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let displayOffset = 0;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const textBefore = raw.slice(lastIndex, match.index);
    
    if (rawPos <= match.index) {
      return displayOffset + (rawPos - lastIndex);
    }
    
    displayOffset += textBefore.length;
    
    if (rawPos <= match.index + match[0].length) {
      // Inside a mention in raw — snap to end of display mention
      const displayName = `@${match[1]}`;
      return displayOffset + displayName.length;
    }
    
    const displayName = `@${match[1]}`;
    displayOffset += displayName.length;
    lastIndex = match.index + match[0].length;
  }

  return displayOffset + (rawPos - lastIndex);
}

/**
 * Apply a text change from the display textarea back to the raw value.
 */
function applyDisplayChangeToRaw(oldRaw: string, newDisplay: string, oldDisplay: string, displayCursorPos: number): string {
  // Find what changed between oldDisplay and newDisplay
  // Find common prefix
  let prefixLen = 0;
  while (prefixLen < oldDisplay.length && prefixLen < newDisplay.length && oldDisplay[prefixLen] === newDisplay[prefixLen]) {
    prefixLen++;
  }
  
  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < (oldDisplay.length - prefixLen) && 
    suffixLen < (newDisplay.length - prefixLen) &&
    oldDisplay[oldDisplay.length - 1 - suffixLen] === newDisplay[newDisplay.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deletedDisplayStart = prefixLen;
  const deletedDisplayEnd = oldDisplay.length - suffixLen;
  const insertedText = newDisplay.slice(prefixLen, newDisplay.length - suffixLen);

  // Map display positions to raw positions
  const rawStart = displayPosToRawPos(deletedDisplayStart, oldRaw);
  const rawEnd = displayPosToRawPos(deletedDisplayEnd, oldRaw);

  return oldRaw.slice(0, rawStart) + insertedText + oldRaw.slice(rawEnd);
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  teamMembers,
  autoFocus,
}: MentionTextareaProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastDisplayRef = useRef('');

  const { display } = rawToDisplay(value);
  lastDisplayRef.current = display;

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.full_name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      m.email?.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplay = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Convert display change back to raw
    const newRaw = applyDisplayChangeToRaw(value, newDisplay, lastDisplayRef.current, cursorPos);
    
    // Check for @ mention trigger
    const textBeforeCursor = newDisplay.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ' || textBeforeCursor[atIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionQuery(query);
        setShowMentions(true);
        onChange(newRaw);
        return;
      }
    }

    setShowMentions(false);
    onChange(newRaw);
  };

  const insertMention = (member: MentionMember) => {
    const ta = textareaRef.current;
    const displayCursorPos = ta?.selectionStart || 0;
    
    // Work in display space to find the @ trigger
    const currentDisplay = lastDisplayRef.current;
    const textBeforeCursor = currentDisplay.slice(0, displayCursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    // Map @ position to raw space
    const rawAtIndex = displayPosToRawPos(atIndex, value);
    const rawCursorPos = displayPosToRawPos(displayCursorPos, value);

    const beforeMention = value.slice(0, rawAtIndex);
    const afterCursor = value.slice(rawCursorPos);

    const mentionText = `@[${member.full_name || member.email}](${member.id})`;
    const newRaw = beforeMention + mentionText + ' ' + afterCursor;

    onChange(newRaw);
    setShowMentions(false);

    // Calculate new cursor position in display space
    const displayMention = `@${member.full_name || member.email}`;
    const newDisplayCursorPos = atIndex + displayMention.length + 1; // +1 for space

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newDisplayCursorPos;
        textareaRef.current.selectionEnd = newDisplayCursorPos;
      }
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none",
          className
        )}
        autoFocus={autoFocus}
      />

      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-full bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left transition-colors"
              onClick={() => insertMention(member)}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {(member.full_name || member.email)?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{member.full_name || member.email}</div>
                {member.full_name && (
                  <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
