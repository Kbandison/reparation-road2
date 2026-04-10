'use client';

import { useEffect } from 'react';

export function CopyProtection() {
  useEffect(() => {
    function preventContext(e: MouseEvent) {
      e.preventDefault();
    }

    function preventCopy(e: KeyboardEvent) {
      // Block Ctrl+C, Ctrl+U (view source), Ctrl+S (save), Ctrl+Shift+I (dev tools)
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'u', 's', 'p'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        ['i', 'j', 'c'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
    }

    function preventDrag(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener('contextmenu', preventContext);
    document.addEventListener('keydown', preventCopy);
    document.addEventListener('dragstart', preventDrag);

    // Disable text selection via CSS
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    return () => {
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('keydown', preventCopy);
      document.removeEventListener('dragstart', preventDrag);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, []);

  return null;
}
