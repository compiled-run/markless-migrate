// The old preview page's beforeInteractive scripts (app/(app)/(create)/preview), as the converted page serves them.
(function() {
              // Forward Cmd/Ctrl + K (and P) to parent
              document.addEventListener('keydown', function(e) {
                if ((e.key === 'k' || e.key === 'p') && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: 'cmd-k-forward',
                      key: e.key
                    }, '*');
                  }
                }
              });

            })();
(function() {
              // Forward O key.
              document.addEventListener('keydown', function(e) {
                if (e.key === 'o' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
                      type: 'open-preset-forward',
                      key: e.key
                    }, '*');
                  }
                }
              });

            })();
(function() {
              // Forward r key (shuffle) and Shift+R (reset).
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
                    var type = e.shiftKey
                      ? 'reset-forward'
                      : 'randomize-forward';
                    window.parent.postMessage({
                      type: type,
                      key: e.key
                    }, '*');
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
                if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) {
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'redo-forward' }, '*');
                  }
                } else if (key === 'z') {
                  e.preventDefault();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'undo-forward' }, '*');
                  }
                }
              });
            })();
(function() {
              // Forward D key
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
                      type: 'dark-mode-forward',
                      key: e.key
                    }, '*');
                  }
                }
              });

            })();
