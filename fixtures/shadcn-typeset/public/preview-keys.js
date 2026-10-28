// The old typeset preview's beforeInteractive scripts (app/(app)/(typeset)/components/forward-scripts.tsx), as the converted page serves them.
(function() {
              // D toggles the theme.
              document.addEventListener('keydown', function(e) {
                if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  if (
                    (e.target instanceof HTMLElement && e.target.isContentEditable) ||
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLTextAreaElement ||
                    e.target instanceof HTMLSelectElement
                  ) {
                    return;
                  }
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'typeset-command',
                      command: 'toggle-theme'
                    }, window.location.origin);
                  }
                }
              });

            })();
(function() {
              // r shuffles, Shift+R resets.
              document.addEventListener('keydown', function(e) {
                if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
                  if (
                    (e.target instanceof HTMLElement && e.target.isContentEditable) ||
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLTextAreaElement ||
                    e.target instanceof HTMLSelectElement
                  ) {
                    return;
                  }
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'typeset-command',
                      command: e.shiftKey ? 'reset' : 'shuffle'
                    }, window.location.origin);
                  }
                }
              });

            })();
(function() {
              document.addEventListener('keydown', function(e) {
                if (!e.metaKey && !e.ctrlKey) return;
                if (
                  (e.target instanceof HTMLElement && e.target.isContentEditable) ||
                  e.target instanceof HTMLInputElement ||
                  e.target instanceof HTMLTextAreaElement ||
                  e.target instanceof HTMLSelectElement
                ) {
                  return;
                }
                var key = e.key.toLowerCase();
                var command = null;
                if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) {
                  command = 'redo';
                } else if (key === 'z') {
                  command = 'undo';
                }
                if (command) {
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'typeset-command',
                      command: command
                    }, window.location.origin);
                  }
                }
              });
            })();
