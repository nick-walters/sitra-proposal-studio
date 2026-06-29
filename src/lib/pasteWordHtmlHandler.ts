/**
 * Shared onPaste handler for bare contentEditable surfaces.
 * Strips Word/MSO junk via stripWordHtml while preserving custom
 * badges/classes/data-* attrs in the allow-list.
 *
 * Falls back to text/plain (with <br> for newlines) when the
 * clipboard carries no HTML payload.
 */
import type React from 'react';
import { stripWordHtml } from '@/lib/stripWordHtml';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function handleWordPaste(e: React.ClipboardEvent<HTMLElement>): void {
  const cd = e.clipboardData;
  if (!cd) return;
  const html = cd.getData('text/html');
  const text = cd.getData('text/plain');
  if (!html && !text) return;
  e.preventDefault();
  const payload = html
    ? stripWordHtml(html)
    : escapeHtml(text).replace(/\r?\n/g, '<br>');
  document.execCommand('insertHTML', false, payload);
}

/**
 * Plain-text-only paste handler — strips ALL HTML, inserts the
 * clipboard's text/plain payload (with <br> for newlines).
 * Use on contentEditable surfaces that ultimately persist as
 * textContent/innerText so MSO junk never enters the DOM.
 */
export function handlePlainTextPaste(e: React.ClipboardEvent<HTMLElement>): void {
  const cd = e.clipboardData;
  if (!cd) return;
  const text = cd.getData('text/plain');
  if (!text) return;
  e.preventDefault();
  document.execCommand('insertText', false, text);
}
