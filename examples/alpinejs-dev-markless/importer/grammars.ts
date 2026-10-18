// TextMate grammars that reproduce how Torchlight highlighted alpinejs.dev: Alpine attribute values as JavaScript, built-ins as support names.
const P = 'entity.other.attribute-name.html';
const segs = { patterns: [{ match: '[A-Za-z0-9][\\w-]*', name: P }] };
export const alpine = {
  name: 'alpine',
  scopeName: 'text.html.alpine',
  embeddedLangs: ['html', 'javascript'],
  injections: {
    'L:meta.tag -comment -string -source': {
      patterns: [
        { match: '(?<=\\s)\\.\\.\\.', name: 'text.ellipsis.alpine' },
        {
          begin: '(?<=\\s)(?:(x-[\\w-]+)(?:(:)([\\w-]+))?|([@:])([\\w-]+))(?:((?:\\.[A-Za-z][\\w-]*)*\\.)([A-Za-z][\\w-]*))?\\s*(=)\\s*(")',
          beginCaptures: { 1: { name: P }, 3: { name: P }, 5: { name: P }, 7: { name: P }, 9: { name: 'string.quoted.double.html' } },
          end: '"',
          endCaptures: { 0: { name: 'string.quoted.double.html' } },
          contentName: 'source.js.embedded.alpine',
          patterns: [{ include: '#builtins' }, { include: 'source.js#expression' }],
        },
        {
          match: '(?<=\\s)([@:]?)((?:x-)?[\\w-]+(?::[\\w-]+)?)((?:\\.[\\w%-]+)+|(?=[\\s>/]))(?:\\s*(=)\\s*("[^"]*"))?',
          captures: { 2: { name: P }, 3: segs, 5: { name: 'string.quoted.double.html' } },
        },
      ],
    },
    'L:source.js -comment -string': { patterns: [{ include: '#builtins' }] },
  },
  repository: {
    builtins: {
      patterns: [
        { match: '\\b(Math|JSON)(\\.)([A-Za-z_$][\\w$]*)', captures: { 1: { name: 'support.constant.math' }, 3: { name: 'support.constant.math' } } },
        { match: '\\b(Date|Array)\\b', name: 'support.class.builtin.alpine' },
        { match: '\\b(setInterval|setTimeout|clearInterval|clearTimeout|parseInt|parseFloat|decodeURIComponent|encodeURIComponent)\\b', name: 'support.function.builtin.alpine' },
      ],
    },
  },
  patterns: [{ include: 'text.html.basic' }],
};

export const tljs = {
  name: 'tljs',
  scopeName: 'source.js.tl',
  embeddedLangs: ['javascript'],
  injections: { 'L:source.js -comment -string': { patterns: [{ include: 'text.html.alpine#builtins' }] } },
  patterns: [{ include: 'source.js' }],
};
