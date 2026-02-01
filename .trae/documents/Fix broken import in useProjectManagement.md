## Overview
The Vite error occurs because hooks/useProjectManagement.ts imports from "../utils/fileUtils", but the actual module is at src/utils/fileUtils.ts. Other files (e.g., App.tsx) correctly import it via "./src/utils/fileUtils" from the project root.

## Changes
1. Update the import in hooks/useProjectManagement.ts:
   - From: ../utils/fileUtils
   - To: ../src/utils/fileUtils

## Verification
- Restart the dev server and ensure the Vite import-analysis error disappears.
- Open any UI flows using useProjectManagement to confirm functionality (computeFileId used for IDs).

## Optional Improvements (separate follow-up)
- Map alias "@" to "src" in Vite config and migrate imports to use "@/utils/fileUtils" for consistency.
- Remove the duplicated computeFileId implementation in src/hooks/useProjectLibrary.ts and import it from src/utils/fileUtils for a single source of truth.

## References
- Problematic import: [useProjectManagement.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/hooks/useProjectManagement.ts#L4-L7)
- Target module: [fileUtils.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/fileUtils.ts#L10-L19)
- Existing correct usage: [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L24)