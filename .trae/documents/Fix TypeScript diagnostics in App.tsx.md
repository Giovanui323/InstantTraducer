## What’s failing
- `Cannot find module './components/ImageCropModal'`: the file exists at [ImageCropModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ImageCropModal.tsx), so this is a resolution issue (often path/extension/case sensitivity or stale TS resolution).
- `setCroppedImages does not exist in type UseAppTranslationProps`: [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts#L12-L40) doesn’t define `setCroppedImages`, and the hook doesn’t use `setCroppedImages`/`croppedImagesRef` at all.

## Code changes
1. Make the `ImageCropModal` import unambiguous by importing with an explicit extension in:
   - [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L17)
   - [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx)
   This avoids TS “cannot find module” edge-cases under ESM/bundler resolution.
2. Fix the `UseAppTranslationProps` mismatch by removing unused props from the call site in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L477-L514):
   - Remove `setCroppedImages` and `croppedImagesRef` from the object passed to `useAppTranslation`.
   (Alternative would be extending the interface and refactoring the hook signature, but removing unused props is the smallest, safest fix.)

## Verification
- Run `npx tsc -p tsconfig.json --noEmit` to ensure both diagnostics are gone.
- If needed, also run `npm run dev` to confirm the app starts and the crop modal import resolves at runtime.

## Notes (non-blocking)
- `ImageCropModal` is currently a stub and never calls `onConfirm`; the crop flow won’t actually produce crops until a crop UI is implemented. This is separate from the TypeScript errors.
