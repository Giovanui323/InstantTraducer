/**
 * Test automatici per:
 * 1. cleanTranslationText — stripping heading markdown, normalizzazione
 * 2. isMarkdownTable — detection tabelle markdown
 * 3. buildSelectableText — gestione tabelle nel testo selezionabile
 * 4. Presenza regole tabelle in tutti i prompt template
 * 5. Consistenza cross-provider
 */
import { describe, it, expect } from "vitest";
import { cleanTranslationText, stripPreamble } from "../src/services/textClean";
import { isMarkdownTable, buildSelectableText } from "../src/utils/highlightSelectors";
import { getClaudeTranslateSystemPrompt, getClaudeTranslateSystemPromptBlocks } from "../src/services/prompts/claude";
import { getGeminiTranslateSystemPrompt } from "../src/services/prompts/gemini";
import { getOpenAITranslateSystemPrompt } from "../src/services/prompts/openai";
import { getGroqTranslateSystemPrompt } from "../src/services/prompts/groq";
import { getOpenRouterTranslateSystemPrompt } from "../src/services/prompts/openrouter";
import { DEFAULT_TRANSLATION_PROMPT_TEMPLATE, LITE_TRANSLATION_PROMPT_TEMPLATE } from "../src/constants";

// ─── Helper ────────────────────────────────────────────────────────────────

type ProviderPromptFn = (sourceLang: string, prevContext: string, legalContext: boolean, isRetry: boolean, customTemplate?: string, model?: string) => string;

const claudeFn: ProviderPromptFn = (s, p, l, r, _c, m) =>
  getClaudeTranslateSystemPrompt(s, p, l, r ? "retry" : undefined, _c, m);

const geminiFn: ProviderPromptFn = (s, p, l, r, _c, m) =>
  getGeminiTranslateSystemPrompt(s, p, l, r, _c, m);

const openaiFn: ProviderPromptFn = (s, p, l, r, _c, m) =>
  getOpenAITranslateSystemPrompt(s, p, l, r, _c, m);

const groqFn: ProviderPromptFn = (s, p, l, r, _c, m) =>
  getGroqTranslateSystemPrompt(s, p, l, r, _c, m);

const openrouterFn: ProviderPromptFn = (s, p, l, r, _c, m) =>
  getOpenRouterTranslateSystemPrompt(s, p, l, r, _c, m);

// ═══════════════════════════════════════════════════════════════════════════
// 1. cleanTranslationText — Markdown heading stripping + normalizzazione
// ═══════════════════════════════════════════════════════════════════════════

describe("cleanTranslationText — markdown heading stripping", () => {
  it("strips ### heading", () => {
    expect(cleanTranslationText("### Superare il contratto societario")).toBe("Superare il contratto societario");
  });

  it("strips ## heading", () => {
    expect(cleanTranslationText("## Capitolo primo")).toBe("Capitolo primo");
  });

  it("strips # heading", () => {
    expect(cleanTranslationText("# Titolo principale")).toBe("Titolo principale");
  });

  it("strips heading with trailing text preserving newlines", () => {
    const input = "### Introduzione\n\nPrimo paragrafo.";
    expect(cleanTranslationText(input)).toBe("Introduzione\n\nPrimo paragrafo.");
  });

  it("strips multiple headings", () => {
    const input = "### Titolo 1\n\nTesto\n\n### Titolo 2\n\nAltro testo";
    expect(cleanTranslationText(input)).toBe("Titolo 1\n\nTesto\n\nTitolo 2\n\nAltro testo");
  });

  it("does NOT strip ### mid-line", () => {
    expect(cleanTranslationText("testo con ### non heading")).toBe("testo con ### non heading");
  });

  it("strips at start of line only", () => {
    expect(cleanTranslationText("linea\n### Heading\naltra")).toBe("linea\nHeading\naltra");
  });

  it("handles tabs between # and text", () => {
    expect(cleanTranslationText("###\tTitolo")).toBe("Titolo");
  });

  it("does NOT strip #### (4+ hashes)", () => {
    expect(cleanTranslationText("#### Quarto livello")).toBe("#### Quarto livello");
  });

  it("handles empty string", () => {
    expect(cleanTranslationText("")).toBe("");
  });

  it("preserves text without headings", () => {
    expect(cleanTranslationText("Un paragrafo.\n\nAltro.")).toBe("Un paragrafo.\n\nAltro.");
  });

  it("strips preamble + headings together", () => {
    expect(cleanTranslationText("Ecco la traduzione:\n\n### Capitolo\n\nTesto")).toBe("Capitolo\n\nTesto");
  });

  it("does NOT strip markdown table pipes", () => {
    const table = "| Nome | Valore |\n|------|--------|\n| Primo | 42 |";
    expect(cleanTranslationText(table)).toBe(table);
  });

  it("strips heading before a table", () => {
    const input = "### Dati\n\n| Nome | Valore |\n|------|--------|\n| Primo | 42 |";
    const result = cleanTranslationText(input);
    expect(result).toContain("Dati");
    expect(result).toContain("| Nome | Valore |");
    expect(result).not.toContain("###");
  });
});

describe("cleanTranslationText — other cleaning", () => {
  it("strips <br> tags", () => {
    expect(cleanTranslationText("a<br>b")).toBe("a\nb");
  });

  it("strips <br/> tags", () => {
    expect(cleanTranslationText("a<br/>b")).toBe("a\nb");
  });

  it("replaces &nbsp; with space", () => {
    expect(cleanTranslationText("a&nbsp;b")).toBe("a b");
  });

  it("normalizes \\r\\n to \\n", () => {
    expect(cleanTranslationText("a\r\nb")).toBe("a\nb");
  });

  it("collapses 3+ newlines to 2", () => {
    expect(cleanTranslationText("a\n\n\nb")).toBe("a\n\nb");
  });

  it("strips trailing spaces before newline", () => {
    expect(cleanTranslationText("a  \n")).toBe("a\n");
  });

  it("strips leading spaces after newline", () => {
    expect(cleanTranslationText("\n  b")).toBe("\nb");
  });

  it("removes spaced initials (A B C → ABC)", () => {
    expect(cleanTranslationText("L A C I T A")).toBe("LACITA");
  });
});

describe("stripPreamble", () => {
  it("strips 'Ecco' preamble", () => {
    expect(stripPreamble("Ecco la traduzione:\n\nTesto")).toBe("Testo");
  });

  it("strips 'Certamente' preamble", () => {
    expect(stripPreamble("Certamente!\n\nTesto")).toBe("Testo");
  });

  it("leaves clean text untouched", () => {
    expect(stripPreamble("Testo pulito")).toBe("Testo pulito");
  });

  it("handles empty string", () => {
    expect(stripPreamble("")).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. isMarkdownTable
// ═══════════════════════════════════════════════════════════════════════════

describe("isMarkdownTable — detection", () => {
  it("standard table with pipes", () => {
    expect(isMarkdownTable("| A | B |\n|---|---|\n| 1 | 2 |")).toBe(true);
  });

  it("table without leading/trailing pipes", () => {
    expect(isMarkdownTable("A | B\n---|---\n1 | 2")).toBe(true);
  });

  it("table with alignment colons", () => {
    expect(isMarkdownTable("| Left | Center | Right |\n|:-----|:------:|------:|\n| a | b | c |")).toBe(true);
  });

  it("minimal 2-line table (header + separator)", () => {
    expect(isMarkdownTable("| A | B |\n|---|---|")).toBe(true);
  });

  it("rejects single line", () => {
    expect(isMarkdownTable("| A | B |")).toBe(false);
  });

  it("rejects two lines without separator", () => {
    expect(isMarkdownTable("| A | B |\n| 1 | 2 |")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isMarkdownTable("Testo normale")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isMarkdownTable("")).toBe(false);
  });

  it("rejects pipes without dashes", () => {
    expect(isMarkdownTable("| A | B |\n| x | y |")).toBe(false);
  });

  it("large table with many columns", () => {
    expect(isMarkdownTable("| A | B | C | D | E |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |")).toBe(true);
  });

  it("table with spaces in separator", () => {
    expect(isMarkdownTable("| A | B |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. buildSelectableText — tabelle
// ═══════════════════════════════════════════════════════════════════════════

describe("buildSelectableText — tables preserved", () => {
  it("preserves table content (not collapsed into single line)", () => {
    const table = "| Nome | Valore |\n|------|--------|\n| Primo | 42 |";
    const out = buildSelectableText(table, false);
    expect(out).toContain("Nome");
    expect(out).toContain("Valore");
    expect(out).toContain("Primo");
    expect(out).toContain("42");
  });

  it("table + regular text: both preserved", () => {
    const input = "Testo sopra\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nTesto sotto";
    const out = buildSelectableText(input, false);
    expect(out).toContain("Testo sopra");
    expect(out).toContain("Testo sotto");
    expect(out).toContain("A");
    expect(out).toContain("1");
  });

  it("table with bold/italic in cells: content extracted", () => {
    const input = "| Term | Value |\n|-----|-------|\n| **bold** | *italic* |";
    const out = buildSelectableText(input, false);
    expect(out).toContain("bold");
    expect(out).toContain("italic");
  });

  it("multiple tables separated by text", () => {
    const input = "| A | B |\n|---|---|\n| 1 | 2 |\n\nTra le tabelle\n\n| C | D |\n|---|---|\n| 3 | 4 |";
    const out = buildSelectableText(input, false);
    expect(out).toContain("A");
    expect(out).toContain("Tra le tabelle");
    expect(out).toContain("C");
  });

  it("table with [[word|note]] syntax after it", () => {
    const input = "| A | B |\n|---|---|\n| 1 | 2 |\n\nDopo [[parola|nota]] testo";
    const out = buildSelectableText(input, false);
    expect(out).toContain("parola");
    expect(out).toContain("Dopo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Prompt templates — regole tabelle
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt templates — table rules", () => {
  const providers: { name: string; fn: ProviderPromptFn }[] = [
    { name: "Claude", fn: claudeFn },
    { name: "Gemini", fn: geminiFn },
    { name: "OpenAI", fn: openaiFn },
    { name: "Groq", fn: groqFn },
    { name: "OpenRouter", fn: openrouterFn },
  ];

  providers.forEach(({ name, fn }) => {
    describe(name, () => {
      it("contains table rules", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        const lower = prompt.toLowerCase();
        expect(lower.includes("cella per cella") || lower.includes("tabella") || lower.includes("tabelle")).toBe(true);
      });

      it("contains Markdown table syntax example", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        expect(prompt).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
      });

      it("contains [TABELLA CONTINUA]", () => {
        expect(fn("Tedesco", "contesto", true, false)).toContain("[TABELLA CONTINUA]");
      });

      it("contains separator syntax", () => {
        expect(fn("Tedesco", "contesto", true, false)).toMatch(/\|[-]+\|/);
      });
    });
  });

  describe("DEFAULT template", () => {
    it("has table rules", () => {
      expect(DEFAULT_TRANSLATION_PROMPT_TEMPLATE.toLowerCase()).toContain("cella per cella");
    });

    it("has Markdown syntax", () => {
      expect(DEFAULT_TRANSLATION_PROMPT_TEMPLATE).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
    });

    it("has [TABELLA CONTINUA]", () => {
      expect(DEFAULT_TRANSLATION_PROMPT_TEMPLATE).toContain("[TABELLA CONTINUA]");
    });
  });

  describe("LITE template", () => {
    it("has table rules", () => {
      expect(LITE_TRANSLATION_PROMPT_TEMPLATE.toLowerCase()).toContain("tabell");
    });

    it("has Markdown syntax", () => {
      expect(LITE_TRANSLATION_PROMPT_TEMPLATE).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
    });

    it("has [TABELLA CONTINUA]", () => {
      expect(LITE_TRANSLATION_PROMPT_TEMPLATE).toContain("[TABELLA CONTINUA]");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Consistenza cross-provider
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-provider consistency", () => {
  const providers: { name: string; fn: ProviderPromptFn }[] = [
    { name: "Claude", fn: claudeFn },
    { name: "Gemini", fn: geminiFn },
    { name: "OpenAI", fn: openaiFn },
    { name: "Groq", fn: groqFn },
    { name: "OpenRouter", fn: openrouterFn },
  ];

  providers.forEach(({ name, fn }) => {
    describe(name, () => {
      it("contains [[PAGE_SPLIT]]", () => {
        expect(fn("Francese", "", true, false)).toContain("[[PAGE_SPLIT]]");
      });

      it("contains 'due colonne'", () => {
        expect(fn("Francese", "", true, false).toLowerCase()).toContain("due colonne");
      });

      it("contains anti-transcription rule", () => {
        const lower = fn("Tedesco", "", true, false).toLowerCase();
        expect(lower).toContain("italiano");
        expect(lower.includes("non trascrivere") || lower.includes("mai trascrivere") || lower.includes("non trascriv") || lower.includes("sempre italiano")).toBe(true);
      });

      it("contains [ILLEGIBILE]", () => {
        expect(fn("Tedesco", "", true, false)).toContain("[ILLEGIBILE]");
      });

      it("contains footnote rule (---)", () => {
        expect(fn("Tedesco", "", true, false)).toContain("---");
      });

      it("resolves sourceLang", () => {
        expect(fn("Tedesco", "", true, false).toLowerCase()).toContain("tedesco");
      });

      it("includes legal context when enabled", () => {
        expect(fn("Tedesco", "", true, false).toLowerCase()).toContain("giuridic");
      });

      it("omits legal context when disabled", () => {
        expect(fn("Tedesco", "", false, false).toLowerCase()).not.toContain("giuridic");
      });

      it("includes retry mode when isRetry=true", () => {
        const lower = fn("Tedesco", "", true, true).toLowerCase();
        expect(lower.includes("ritraduzione") || lower.includes("retry") || lower.includes("rifiutato")).toBe(true);
      });

      it("omits retry mode when isRetry=false", () => {
        const lower = fn("Tedesco", "", true, false).toLowerCase();
        expect(lower.includes("ritraduzione") || lower.includes("retry mode")).toBe(false);
      });

      it("does NOT contain unresolved {{sourceLang}} in body (may appear in final_check)", () => {
        const prompt = fn("Tedesco", "", true, false);
        // Il body del prompt NON deve avere placeholder (il primo {{sourceLang}} è risolto).
        // Nota: Claude usa .replace singolo, quindi {{sourceLang}} può apparire nel <final_check>
        // come riferimento al modello — questo è intenzionale.
        const bodyBeforeFinalCheck = prompt.split(/<final_check>/i)[0];
        expect(bodyBeforeFinalCheck).not.toContain("{{sourceLang}}");
      });
    });
  });

  describe("Claude split blocks", () => {
    it("stable block contains table rules", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesto", true);
      expect(stable).toContain("[TABELLA CONTINUA]");
      expect(stable).toMatch(/\|[-]+\|/);
    });

    it("variable block contains prevContext", () => {
      const { variable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesto segreto", true);
      expect(variable).toContain("contesto segreto");
    });

    it("stable block does NOT contain prevContext", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesto segreto", true);
      expect(stable).not.toContain("contesto segreto");
    });

    it("stable block contains [[PAGE_SPLIT]]", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "", true);
      expect(stable).toContain("[[PAGE_SPLIT]]");
    });

    it("stable block contains table example", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "", true);
      expect(stable).toContain("Nome");
      expect(stable).toContain("Valore");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. French false friends
// ═══════════════════════════════════════════════════════════════════════════

describe("French false friends in legal context", () => {
  const providers: { name: string; fn: ProviderPromptFn }[] = [
    { name: "Claude", fn: claudeFn },
    { name: "Gemini", fn: geminiFn },
    { name: "OpenAI", fn: openaiFn },
    { name: "Groq", fn: groqFn },
    { name: "OpenRouter", fn: openrouterFn },
  ];

  providers.forEach(({ name, fn }) => {
    it(`${name}: includes false friends for French`, () => {
      const prompt = fn("Francese", "", true, false);
      expect(prompt).toContain("Arrêter");
      expect(prompt).toContain("Sentenza");
    });

    it(`${name}: NO false friends for German`, () => {
      expect(fn("Tedesco", "", true, false)).not.toContain("Arrêter");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. End-to-end: translation output with table → cleanText → selectableText
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E: AI output with table → clean → selectable", () => {
  it("table survives cleanTranslationText and is detected by isMarkdownTable", () => {
    const aiOutput = "### Dati\n\n| Nome | Valore |\n|------|--------|\n| Primo | 42 |\n\nTesto dopo.";
    const cleaned = cleanTranslationText(aiOutput);

    // Heading stripped
    expect(cleaned).not.toContain("###");
    expect(cleaned).toContain("Dati");

    // Table preserved
    expect(cleaned).toContain("| Nome | Valore |");
    expect(cleaned).toContain("| Primo | 42 |");

    // Table detected in the text
    // isMarkdownTable works on trimmed paragraph blocks
    const paragraphs = cleaned.split(/\n\s*\n/);
    const tablePara = paragraphs.find(p => p.includes("| Nome |"));
    expect(tablePara).toBeDefined();
    expect(isMarkdownTable(tablePara!)).toBe(true);
  });

  it("full pipeline: clean → detect → build selectable text", () => {
    const aiOutput = "Ecco la traduzione:\n\n### Risultati\n\n| Misura | Valore |\n|--------|--------|\n| Peso | 10 kg |\n| Altezza | 5 m |\n\nConclusione del testo.";
    const cleaned = cleanTranslationText(aiOutput);

    expect(cleaned).not.toContain("Ecco");
    expect(cleaned).not.toContain("###");

    const selectable = buildSelectableText(cleaned, false);
    expect(selectable).toContain("Risultati");
    expect(selectable).toContain("Peso");
    expect(selectable).toContain("Altezza");
    expect(selectable).toContain("Conclusione");
  });

  it("table with [TABELLA CONTINUA] preserved through pipeline", () => {
    const aiOutput = "| A | B |\n|---|---|\n| 1 | 2 |\n[TABELLA CONTINUA]";
    const cleaned = cleanTranslationText(aiOutput);
    expect(cleaned).toContain("[TABELLA CONTINUA]");
    expect(cleaned).toContain("| A | B |");
  });

  it("table with inline notes [[word|comment]]", () => {
    const aiOutput = "| Termine | Definizione |\n|---------|-------------|\n| Contratto | [[accordo|patto giuridico]] |";
    const cleaned = cleanTranslationText(aiOutput);
    expect(cleaned).toContain("accordo");
    expect(cleaned).toContain("patto giuridico");

    const selectable = buildSelectableText(cleaned, false);
    expect(selectable).toContain("accordo");
  });
});
