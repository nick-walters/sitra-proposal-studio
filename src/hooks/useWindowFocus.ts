import { useSyncExternalStore } from 'react';

// Global state tracked outside React for synchronous updates
let windowHasFocus = true;
const listeners: Set<() => void> = new Set();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return windowHasFocus;
}

// Initialize listeners once
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    windowHasFocus = false;
    listeners.forEach(l => l());
  });
  window.addEventListener('focus', () => {
    windowHasFocus = true;
    listeners.forEach(l => l());
  });
}

export function useWindowFocus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

// Direct function for use in event handlers (non-hook)
export function isWindowFocused() {
  return windowHasFocus;
}
