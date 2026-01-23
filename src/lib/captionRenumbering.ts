/**
 * Utility functions for dynamic renumbering of figure and table captions
 * Captions follow the format: "Figure X.X.x." or "Table X.X.x."
 * where X.X is the section number and x is a lowercase letter (a, b, c, ...)
 */

/**
 * Renumbers all figure captions in the content based on their order
 * Handles multiple HTML formatting variations (bold, italic, or plain)
 * @param content HTML content string
 * @param sectionNumber The current section number (e.g., "1.1" or "B1.1")
 * @returns Updated content with renumbered figure captions
 */
export function renumberFigureCaptions(content: string, sectionNumber: string): string {
  // Extract section number without letter prefix (e.g., "1.1" from "B1.1")
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  
  // Pattern to match figure captions in various formats:
  // - <em><strong>Figure X.X.x.</strong>...</em>
  // - <strong>Figure X.X.x.</strong>
  // - Figure X.X.x.
  // Uses a broad pattern that captures any figure numbering
  const figurePattern = /(<em>)?(<strong>)?(Figure )\d+\.\d+\.([a-z])\.(<\/strong>)?/gi;
  
  let letterIndex = 0;
  
  return content.replace(figurePattern, (match, emStart, strongStart, figureText, _oldLetter, strongEnd) => {
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + letterIndex);
    letterIndex++;
    
    // Reconstruct with same formatting but new numbering
    const em1 = emStart || '';
    const strong1 = strongStart || '';
    const strong2 = strongEnd || '';
    
    return `${em1}${strong1}${figureText}${cleanSectionNum}.${newLetter}.${strong2}`;
  });
}

/**
 * Renumbers all table captions in the content based on their order
 * @param content HTML content string
 * @param sectionNumber The current section number (e.g., "1.1" or "B1.1")
 * @returns Updated content with renumbered table captions
 */
export function renumberTableCaptions(content: string, sectionNumber: string): string {
  // Extract section number without letter prefix (e.g., "1.1" from "B1.1")
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  
  // Pattern to match table captions in various formats
  const tablePattern = /(<em>)?(<strong>)?(Table )\d+\.\d+\.([a-z])\.(<\/strong>)?/gi;
  
  let letterIndex = 0;
  
  return content.replace(tablePattern, (match, emStart, strongStart, tableText, _oldLetter, strongEnd) => {
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + letterIndex);
    letterIndex++;
    
    const em1 = emStart || '';
    const strong1 = strongStart || '';
    const strong2 = strongEnd || '';
    
    return `${em1}${strong1}${tableText}${cleanSectionNum}.${newLetter}.${strong2}`;
  });
}

/**
 * Renumbers all citation superscripts based on their order of appearance
 * Citations follow the format: <sup>[N]</sup>
 * @param content HTML content string
 * @returns Object containing updated content and a mapping of old to new numbers
 */
export function renumberCitations(content: string): { content: string; mapping: Map<number, number> } {
  // Find all citations and their positions
  const citationPattern = /<sup>\[(\d+)\]<\/sup>/gi;
  const citations: { fullMatch: string; number: number; index: number }[] = [];
  
  let match;
  while ((match = citationPattern.exec(content)) !== null) {
    citations.push({
      fullMatch: match[0],
      number: parseInt(match[1], 10),
      index: match.index
    });
  }
  
  if (citations.length === 0) {
    return { content, mapping: new Map() };
  }
  
  // Create mapping from old numbers to new sequential numbers based on position
  const mapping = new Map<number, number>();
  let nextNumber = 1;
  
  // Sort by position (already in order from regex exec)
  for (const citation of citations) {
    if (!mapping.has(citation.number)) {
      mapping.set(citation.number, nextNumber);
      nextNumber++;
    }
  }
  
  // Replace all citations with their new numbers
  const updatedContent = content.replace(citationPattern, (match, oldNum) => {
    const oldNumber = parseInt(oldNum, 10);
    const newNumber = mapping.get(oldNumber) ?? oldNumber;
    return `<sup>[${newNumber}]</sup>`;
  });
  
  return { content: updatedContent, mapping };
}

/**
 * Renumbers all captions (figures and tables) and citations in the content
 * Also updates cross-references to match new numbering
 * @param content HTML content string
 * @param sectionNumber The current section number (e.g., "1.1" or "B1.1")
 * @returns Updated content with renumbered captions and citations
 */
export function renumberAllCaptions(content: string, sectionNumber: string): string {
  let updated = renumberFigureCaptions(content, sectionNumber);
  updated = renumberTableCaptions(updated, sectionNumber);
  // Also renumber citations
  const citationResult = renumberCitations(updated);
  return citationResult.content;
}

/**
 * Gets the next available letter for a figure caption in the content
 * @param content HTML content string
 * @param sectionNumber The current section number
 * @returns The next available letter (a, b, c, ...)
 */
export function getNextFigureLetterFromContent(content: string, sectionNumber: string): string {
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  // Match both formatted and plain figure references
  const figurePattern = new RegExp(`Figure ${cleanSectionNum.replace('.', '\\.')}\\.([a-z])`, 'gi');
  const matches = content.match(figurePattern) || [];
  return String.fromCharCode('a'.charCodeAt(0) + matches.length);
}

/**
 * Gets the next available letter for a table caption in the content
 * @param content HTML content string
 * @param sectionNumber The current section number
 * @returns The next available letter (a, b, c, ...)
 */
export function getNextTableLetterFromContent(content: string, sectionNumber: string): string {
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  const tablePattern = new RegExp(`Table ${cleanSectionNum.replace('.', '\\.')}\\.([a-z])`, 'gi');
  const matches = content.match(tablePattern) || [];
  return String.fromCharCode('a'.charCodeAt(0) + matches.length);
}
