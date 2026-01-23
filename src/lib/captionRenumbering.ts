/**
 * Utility functions for dynamic renumbering of figure and table captions
 * Captions follow the format: "Figure X.X.x" or "Table X.X.x"
 * where X.X is the section number and x is a lowercase letter (a, b, c, ...)
 */

/**
 * Renumbers all figure captions in the content based on their order
 * @param content HTML content string
 * @param sectionNumber The current section number (e.g., "1.1" or "B1.1")
 * @returns Updated content with renumbered figure captions
 */
export function renumberFigureCaptions(content: string, sectionNumber: string): string {
  // Extract section number without letter prefix (e.g., "1.1" from "B1.1")
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  
  // Pattern to match figure captions with bold label: "<strong>Figure X.X.letter.</strong>" or "<em><strong>Figure..."
  // Also match non-bold patterns for backwards compatibility
  const figurePattern = /(<em>)?(<strong>)?Figure \d+\.\d+\.([a-z])\.(<\/strong>)?(<\/em>)?/gi;
  
  let letterIndex = 0;
  
  return content.replace(figurePattern, (match, emStart, strongStart, _oldLetter, strongEnd, emEnd) => {
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + letterIndex);
    letterIndex++;
    // Preserve the original formatting structure
    const em1 = emStart || '';
    const strong1 = strongStart || '';
    const strong2 = strongEnd || '';
    const em2 = emEnd || '';
    return `${em1}${strong1}Figure ${cleanSectionNum}.${newLetter}.${strong2}${em2}`;
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
  
  // Pattern to match table captions with bold label
  const tablePattern = /(<em>)?(<strong>)?Table \d+\.\d+\.([a-z])\.(<\/strong>)?(<\/em>)?/gi;
  
  let letterIndex = 0;
  
  return content.replace(tablePattern, (match, emStart, strongStart, _oldLetter, strongEnd, emEnd) => {
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + letterIndex);
    letterIndex++;
    const em1 = emStart || '';
    const strong1 = strongStart || '';
    const strong2 = strongEnd || '';
    const em2 = emEnd || '';
    return `${em1}${strong1}Table ${cleanSectionNum}.${newLetter}.${strong2}${em2}`;
  });
}

/**
 * Renumbers all captions (figures and tables) in the content
 * @param content HTML content string
 * @param sectionNumber The current section number (e.g., "1.1" or "B1.1")
 * @returns Updated content with renumbered captions
 */
export function renumberAllCaptions(content: string, sectionNumber: string): string {
  let updated = renumberFigureCaptions(content, sectionNumber);
  updated = renumberTableCaptions(updated, sectionNumber);
  return updated;
}

/**
 * Gets the next available letter for a figure caption in the content
 * @param content HTML content string
 * @param sectionNumber The current section number
 * @returns The next available letter (a, b, c, ...)
 */
export function getNextFigureLetterFromContent(content: string, sectionNumber: string): string {
  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  const figurePattern = new RegExp(`Figure ${cleanSectionNum.replace('.', '\\\\.')}\\.([a-z])`, 'g');
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
  const tablePattern = new RegExp(`Table ${cleanSectionNum.replace('.', '\\\\.')}\\.([a-z])`, 'g');
  const matches = content.match(tablePattern) || [];
  return String.fromCharCode('a'.charCodeAt(0) + matches.length);
}
