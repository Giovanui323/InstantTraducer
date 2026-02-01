I have identified the cause of the slowdown.

### Analysis of the Slowness
The slowdown is caused by the **AI Model configuration**:
1.  **Hardcoded "Pro" Model**: The app is currently hardcoded to use `gemini-3-pro-preview` (in `App.tsx`), which is a more complex and slower model than the "Flash" version.
2.  **"Thinking" Mode Enabled**: In `services/geminiService.ts`, whenever a "pro" model is used, the code automatically enables a **"Thinking Config"** (Chain of Thought) with a budget of 1024 tokens.
    ```typescript
    thinkingConfig: model.includes('pro') ? { thinkingBudget: 1024 } : undefined,
    ```
    This process significantly improves translation quality but takes much longer to generate the response.
3.  **Search is NOT the cause**: Although there is a `useSearch` parameter, it is currently **ignored** in the actual API call, so web search is not contributing to the delay.

### Proposed Solution
To resolve this and give you control over the speed/quality balance, I will:

1.  **Add Model Selection to Settings**: Update the Settings modal to allow you to choose between:
    *   **Flash (Veloce)**: `gemini-3-flash-preview` - Much faster, good for quick translations.
    *   **Pro (Alta Qualità)**: `gemini-3-pro-preview` - Slower but more accurate (current behavior).
2.  **Persist Choice**: Save your preference so it remembers which model you want to use.

This way, you can switch to "Flash" when you want speed, and "Pro" when you need maximum quality.

### Plan
1.  **Modify `components/SettingsModal.tsx`**: Add a dropdown to select the model.
2.  **Update `App.tsx`**:
    *   Load the saved model preference from `localStorage`.
    *   Pass the selected model to the `SettingsModal` and `processPageTranslation`.
3.  **Verify**: Ensure the translation uses the selected model and that "Flash" is significantly faster.
