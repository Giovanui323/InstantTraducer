## Goals
- Resolve linter warning about missing standard property alongside vendor prefix
- Improve cross-browser hyphenation behavior while retaining WebKit support

## Changes
1. In .app-region-drag, add the standard user-select property matching the vendor-prefixed value.
2. In .book-text, add standard hyphenation limit properties to complement existing -webkit- ones:
   - hyphenate-limit-chars: 3 3
   - hyphenate-limit-lines: 2
3. Keep existing vendor-prefixed properties for Safari/WebKit.

## Proposed Patch
```css
.app-region-drag {
  -webkit-app-region: drag;
  user-select: none;
  -webkit-user-select: none;
}

.app-region-no-drag {
  -webkit-app-region: no-drag;
}

.book-text {
  hyphens: auto;
  -webkit-hyphens: auto;
  overflow-wrap: break-word;
  word-break: normal;
  hyphenate-limit-chars: 3 3;
  hyphenate-limit-lines: 2;
  -webkit-hyphenate-limit-before: 3;
  -webkit-hyphenate-limit-after: 3;
  -webkit-hyphenate-limit-lines: 2;
}
```

## Notes
- -webkit-app-region is Electron-specific; there is no standard equivalent, so it remains unchanged.
- Order of standard vs vendor-prefixed properties is not critical here since they are different property names, but both are included for maximum compatibility.
- After applying, re-run the linter to confirm the warning is cleared.

## Reference
- File: [index.css](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/index.css#L1-L18)