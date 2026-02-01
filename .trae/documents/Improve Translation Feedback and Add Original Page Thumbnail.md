I will improve the translation progress feedback and add a thumbnail feature for the original page.

### 1. Improve Translation Feedback (Loading Screen)
- **Status Tracking**:
  - In `App.tsx`, I will add a `loadingStatus` state (Map of page number -> status message) to track granular progress steps (e.g., "Generazione immagine...", "Invio richiesta AI...", "Elaborazione traduzione...").
  - Update `processPageTranslation` to update this status at key points.
- **UI Update**:
  - In `ReaderView.tsx`, I will replace the generic "Elaborazione AI..." message with the specific status message from `loadingStatus`.
  - I will add a simple "seconds elapsed" timer to show how long the process has been running for that page.

### 2. Original Page Thumbnail & Preview
- **Image Storage**:
  - In `App.tsx`, I will add an `originalImages` state to store the base64 snapshot of the original PDF page when it is rendered for translation.
  - This ensures we have a high-quality image of the original page available even when the canvas is hidden or replaced by text.
- **Thumbnail UI**:
  - In `ReaderView.tsx`, when in "Translated Mode" and the translation is visible:
    - I will render a **floating thumbnail** of the original page in the bottom-right corner.
    - The thumbnail will have a hover effect and a "Zoom" icon.
- **Full Screen Preview (Modal)**:
  - Clicking the thumbnail will open a **modal overlay** displaying the original page image at full size, allowing the user to compare the layout or check the original text.
  - The modal will have a close button and click-outside-to-close behavior.

### Files to Modify:
- `App.tsx`: Manage new states (`loadingStatus`, `originalImages`) and pass them to `ReaderView`.
- `components/ReaderView.tsx`: Implement the detailed loading feedback, the floating thumbnail, and the preview modal.
