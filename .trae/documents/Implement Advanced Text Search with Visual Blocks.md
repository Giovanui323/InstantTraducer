I will implement the text search feature with visual blocks and filters as requested.

**Plan:**

1.  **Update `hooks/useSearch.ts`**
    *   Add state for search filters: `searchInTitle` (boolean) and `searchFirstTwoPages` (boolean).
    *   Expose these states and their setters.

2.  **Create `components/SearchResults.tsx`**
    *   Create a new component to render search results as a list of "visual blocks" (cards).
    *   Each block will show:
        *   Context (Book name if in global search, Page number).
        *   A text snippet with the highlighted search term.
    *   Handle clicks to navigate to the specific book/page.

3.  **Update `components/Header.tsx`**
    *   Add a "Filter" button inside the search area to toggle the search options (`searchInTitle`, `searchFirstTwoPages`).
    *   Render the `SearchResults` component as a dropdown/overlay when the search is active.

4.  **Update `App.tsx`**
    *   Implement the unified search logic:
        *   **Reader Mode**: Search within the current `translationMap` and `metadata.name`.
        *   **Library (Home) Mode**: Search across all `recentBooks`.
    *   Apply the filters:
        *   If `searchInTitle` is active, include/exclude title matches.
        *   If `searchFirstTwoPages` is active, limit translation search to page numbers <= 2.
    *   Generate a list of `SearchResult` objects containing snippets and metadata.
    *   Pass these results to the `Header` component.
    *   Handle navigation logic:
        *   In Reader Mode: Jump to page.
        *   In Library Mode: Open the book, then jump to the page.
