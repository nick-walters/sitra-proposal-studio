// Global state tracked outside React for synchronous updates
let windowHasFocus = true;

// Initialize listeners once
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    windowHasFocus = false;
  });
  window.addEventListener('focus', () => {
    windowHasFocus = true;
  });
}

// Direct function for use in event handlers (non-hook)
export function isWindowFocused() {
  return windowHasFocus;
}
