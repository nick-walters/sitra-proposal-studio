import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export interface TableFormulaOptions {
  onFormulaResult?: (result: { cellPos: number; value: number | string }) => void;
}

// Parse a cell reference like "A1" or "B3"
function parseCellRef(ref: string): { col: number; row: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  
  const colStr = match[1].toUpperCase();
  const row = parseInt(match[2], 10) - 1; // 0-indexed
  
  // Convert column letters to number (A=0, B=1, ..., Z=25, AA=26, etc.)
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // 0-indexed
  
  return { col, row };
}

// Parse a range like "A1:B3"
function parseRange(range: string): { start: { col: number; row: number }; end: { col: number; row: number } } | null {
  const parts = range.split(':');
  if (parts.length !== 2) return null;
  
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  
  if (!start || !end) return null;
  return { start, end };
}

// Get numeric value from cell text
function getCellValue(text: string): number {
  const cleaned = text.replace(/[€$£,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Extract table data from a table node
function getTableData(tableNode: any): string[][] {
  const data: string[][] = [];
  
  tableNode.content.forEach((row: any) => {
    const rowData: string[] = [];
    row.content.forEach((cell: any) => {
      let cellText = '';
      cell.content.forEach((node: any) => {
        if (node.isText) {
          cellText += node.text;
        } else if (node.content) {
          node.content.forEach((child: any) => {
            if (child.isText) {
              cellText += child.text;
            }
          });
        }
      });
      rowData.push(cellText.trim());
    });
    data.push(rowData);
  });
  
  return data;
}

// Evaluate a formula
export function evaluateFormula(formula: string, tableData: string[][]): number | string {
  const upperFormula = formula.toUpperCase().trim();
  
  // SUM formula
  const sumMatch = upperFormula.match(/^=SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
  if (sumMatch) {
    const range = parseRange(`${sumMatch[1]}:${sumMatch[2]}`);
    if (!range) return '#REF!';
    
    let sum = 0;
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        const value = tableData[row]?.[col];
        if (value !== undefined) {
          sum += getCellValue(value);
        }
      }
    }
    return sum;
  }
  
  // COUNT formula
  const countMatch = upperFormula.match(/^=COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
  if (countMatch) {
    const range = parseRange(`${countMatch[1]}:${countMatch[2]}`);
    if (!range) return '#REF!';
    
    let count = 0;
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        const value = tableData[row]?.[col];
        if (value !== undefined && value.trim() !== '' && !isNaN(getCellValue(value))) {
          count++;
        }
      }
    }
    return count;
  }
  
  // AVERAGE formula
  const avgMatch = upperFormula.match(/^=AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
  if (avgMatch) {
    const range = parseRange(`${avgMatch[1]}:${avgMatch[2]}`);
    if (!range) return '#REF!';
    
    let sum = 0;
    let count = 0;
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        const value = tableData[row]?.[col];
        if (value !== undefined && value.trim() !== '' && !isNaN(getCellValue(value))) {
          sum += getCellValue(value);
          count++;
        }
      }
    }
    return count > 0 ? sum / count : 0;
  }
  
  // Single cell reference
  const cellRef = parseCellRef(upperFormula.replace('=', ''));
  if (cellRef) {
    const value = tableData[cellRef.row]?.[cellRef.col];
    if (value === undefined) return '#REF!';
    return getCellValue(value);
  }
  
  return '#ERROR!';
}

export const tableFormulaPluginKey = new PluginKey('tableFormula');

export const TableFormula = Extension.create<TableFormulaOptions>({
  name: 'tableFormula',

  addOptions() {
    return {
      onFormulaResult: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableFormulaPluginKey,
        
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorationSet, oldState, newState) => {
            const decorations: Decoration[] = [];
            
            // Find all tables and evaluate formulas
            newState.doc.descendants((node, pos) => {
              if (node.type.name === 'table') {
                const tableData = getTableData(node);
                
                // Find cells with formulas
                let cellIndex = 0;
                node.content.forEach((row, rowOffset, rowIndex) => {
                  row.content.forEach((cell, cellOffset, colIndex) => {
                    let cellText = '';
                    cell.content.forEach((p) => {
                      if (p.isText) {
                        cellText += p.text;
                      } else if (p.content) {
                        p.content.forEach((child) => {
                          if (child.isText) {
                            cellText += child.text;
                          }
                        });
                      }
                    });
                    
                    const trimmedText = cellText.trim();
                    if (trimmedText.startsWith('=')) {
                      const result = evaluateFormula(trimmedText, tableData);
                      const cellPos = pos + rowOffset + cellOffset + 1;
                      
                      // Add a widget decoration to show the result
                      decorations.push(
                        Decoration.widget(cellPos + cell.nodeSize - 1, () => {
                          const span = document.createElement('span');
                          span.className = 'formula-result';
                          span.style.cssText = 'color: hsl(var(--muted-foreground)); font-size: 10px; margin-left: 4px;';
                          span.textContent = `= ${result}`;
                          return span;
                        })
                      );
                    }
                    cellIndex++;
                  });
                });
              }
            });
            
            return DecorationSet.create(newState.doc, decorations);
          },
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
