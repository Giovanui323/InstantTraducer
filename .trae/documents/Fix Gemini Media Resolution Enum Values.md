## Fix Gemini 3 API Media Resolution Values

### Technical Implementation:
1.  **Update `mediaResolution` in `src/services/geminiService.ts`**:
    -   Modify the `parts` array in `translateWithGemini` to use the full enum strings required by the Gemini 3 API:
        -   **Context Pages**: Change `{ level: "MEDIUM" }` to `{ level: "MEDIA_RESOLUTION_MEDIUM" }`.
        -   **Main Page**: Change `{ level: "ULTRA_HIGH" }` to `{ level: "MEDIA_RESOLUTION_ULTRA_HIGH" }`.
2.  **Rationale**: 
    -   The Gemini 3 API (v1beta) requires the full `MEDIA_RESOLUTION_` prefix for the `level` enum values. 
    -   `ULTRA_HIGH` is a valid level for Gemini 3 models but must be specified as `MEDIA_RESOLUTION_ULTRA_HIGH`.

## Milestone
- Resolve the 400 Bad Request error by providing valid enum values for image resolution levels.
