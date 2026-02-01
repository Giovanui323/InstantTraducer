# Refactoring Verification and Completion Plan (Revised)

After a detailed comparison between `App.tsx` and `App.tsx.bak`, I have identified several critical regressions and missing logic that need to be addressed to achieve parity with the original implementation.

## Detailed Regression Analysis

1.  **AI Annotations (`annotationMap`)**:
    *   **Regression**: This state, which stores AI-detected errors and suggestions, is completely missing from the new `App.tsx`.
    *   **Impact**: AI feedback generated during translation or quality checks is discarded and not displayed in the Reader.

2.  **Project Loading (`handleOpenProject`)**:
    *   **Regression**: The logic to load a project's translations, annotations, and the actual PDF file from disk is missing.
    *   **Impact**: Selecting a project from the Home view does nothing beyond setting a file ID; the reader remains empty or in an inconsistent state.

3.  **PDF Upload Flow (`continueUploadWithLanguage`)**:
    *   **Regression**: The logic to process a newly uploaded PDF (extracting metadata, copying the file to the project directory, and initializing the library entry) is missing.
    *   **Impact**: Users cannot start new translation projects.

4.  **API Mismatches**:
    *   **Regression**: `handleExport` and `handleImportProject` use non-existent methods like `saveProjectExport` and `openProjectImport`.
    *   **Impact**: Exporting and importing projects (.gpt files) is currently broken.

5.  **State Synchronization**:
    *   **Regression**: `previewThumbnails` state is missing, and the logic to calculate page status for the preview strip is incomplete.
    *   **Impact**: The page preview functionality is likely broken or incomplete.

## Proposed Implementation Steps

### 1. State and Hook Restoration
- Re-introduce `annotationMap` and `previewThumbnails` state in [App.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx).
- Correctly wire the `setAnnotationMap` and `setTranslationMap` setters to the `useAppQuality` and `useAppTranslation` hooks.

### 2. Implement Project Loading and Upload Flows
- Implement `handleOpenProject` to load all project data and the PDF document into the session.
- Implement `continueUploadWithLanguage` to handle the end-to-end flow of creating a new project from a PDF.

### 3. Fix Electron API Integration
- Update export/import handlers to use `exportProjectPackage` and `importProjectPackage`.
- Ensure `handleImportProject` correctly triggers a project load after successful import.

### 4. Component Prop Wiring
- Ensure `HomeView`, `ReaderView`, and `MainToolbar` receive all the state and handlers they expect (e.g., passing `annotationMap` and correctly handling search results).

### 5. Validation
- Test the full lifecycle: Upload PDF -> Translate -> Annotate -> Save -> Close -> Reopen -> Export -> Import.

Do you want me to proceed with these specific fixes?
