import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WordCountBadgeProps {
  content: string;
  wordLimit?: number;
  className?: string;
}

export function WordCountBadge({ content, wordLimit, className }: WordCountBadgeProps) {
  // Strip HTML and count words
  const plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const wordCount = plainText.length === 0 ? 0 : plainText.split(/\s+/).length;
  
  const isOverLimit = wordLimit && wordCount > wordLimit;
  const isNearLimit = wordLimit && wordCount > wordLimit * 0.9;
  
  return (
    <Badge 
      variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}
      className={cn("font-mono text-xs", className)}
    >
      {wordCount}{wordLimit ? ` / ${wordLimit}` : ''} words
    </Badge>
  );
}
