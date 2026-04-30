/**
 * Test automatici per:
 * 1. cleanTranslationText — stripping degli heading markdown (###, ##, #)
 * 2. Presenza regole tabelle e esempio tabella in tutti i prompt template
 * 3. Consistenza cross-provider (PAGE_SPLIT, tabella, lingua output)
 */
import { describe, it, expect } from "vitest";
import { cleanTranslationText, stripPreamble } from "../src/services/textClean";
import { getClaudeTranslateSystemPrompt, getClaudeTranslateSystemPromptBlocks } from "../src/services/prompts/claude";
import { getGeminiTranslateSystemPrompt } from "../src/services/prompts/gemini";
import { getOpenAITranslateSystemPrompt } from "../src/services/prompts/openai";
import { getGroqTranslateSystemPrompt } from "../src/services/prompts/groq";
import { getOpenRouterTranslateSystemPrompt } from "../src/services/prompts/openrouter";
import { DEFAULT_TRANSLATION_PROMPT_TEMPLATE, LITE_TRANSLATION_PROMPT_TEMPLATE } from "../src/constants";

// ─── Helper ────────────────────────────────────────────────────────────────

/** Genera un prompt per un dato provider, parametrizzato. */
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

// Default e Lite sono template string, non funzioni — le verifichiamo direttamente.

// ═══════════════════════════════════════════════════════════════════════════
// 1. cleanTranslationText — Markdown heading stripping
// ═══════════════════════════════════════════════════════════════════════════

describe("cleanTranslationText — markdown heading stripping", () => {
  it("strip ### heading syntax", () => {
    expect(cleanTranslationText("### Superare il contratto societario")).toBe("Superare il contratto societario");
  });

  it("strip ## heading syntax", () => {
    expect(cleanTranslationText("## Capitolo primo")).toBe("Capitolo primo");
  });

  it("strip # heading syntax", () => {
    expect(cleanTranslationText("# Titolo principale")).toBe("Titolo principale");
  });

  it("strip heading with trailing text", () => {
    const input = "### Introduzione\n\nPrimo paragrafo del testo.";
    const result = cleanTranslationText(input);
    expect(result).toBe("Introduzione\n\nPrimo paragrafo del testo.");
  });

  it("strip multiple headings in the same text", () => {
    const input = "### Titolo 1\n\nTesto\n\n### Titolo 2\n\nAltro testo";
    const result = cleanTranslationText(input);
    expect(result).toBe("Titolo 1\n\nTesto\n\nTitolo 2\n\nAltro testo");
  });

  it("does not strip ### inside a word or mid-line", () => {
    expect(cleanTranslationText("testo normale con ### non heading")).toBe("testo normale con ### non heading");
  });

  it("strips heading at start of line only (not mid-line)", () => {
    const input = "linea normale\n### Heading\naltra linea";
    const result = cleanTranslationText(input);
    expect(result).toBe("linea normale\nHeading\naltra linea");
  });

  it("handles tabs between # and text", () => {
    expect(cleanTranslationText("###\tTitolo con tab")).toBe("Titolo con tab");
  });

  it("does not strip #### (4+ hashes)", () => {
    expect(cleanTranslationText("#### Quarto livello")).toBe("#### Quarto livello");
  });

  it("handles empty string", () => {
    expect(cleanTranslationText("")).toBe("");
  });

  it("preserves text without headings", () => {
    const input = "Un paragrafo normale.\n\nAltro paragrafo.";
    expect(cleanTranslationText(input)).toBe(input);
  });

  it("strips preamble and headings together", () => {
    const input = "Ecco la traduzione:\n\n### Capitolo\n\nTesto";
    const result = cleanTranslationText(input);
    expect(result).toBe("Capitolo\n\nTesto");
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
// 2. Regole tabelle nei prompt — tutti i provider
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt templates — table rules presence", () => {
  const providers: { name: string; fn: ProviderPromptFn }[] = [
    { name: "Claude", fn: claudeFn },
    { name: "Gemini", fn: geminiFn },
    { name: "OpenAI", fn: openaiFn },
    { name: "Groq", fn: groqFn },
    { name: "OpenRouter", fn: openrouterFn },
  ];

  providers.forEach(({ name, fn }) => {
    describe(`${name}`, () => {
      it("contains table rules (cella per cella or tabella keyword)", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        const lower = prompt.toLowerCase();
        const hasTableRules =
          lower.includes("cella per cella") ||
          lower.includes("tabella") ||
          lower.includes("tabelle");
        expect(hasTableRules).toBe(true);
      });

      it("contains Markdown table syntax example (| Col | Col |)", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        expect(prompt).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
      });

      it("contains [TABELLA CONTINUA] marker rule", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        expect(prompt).toContain("[TABELLA CONTINUA]");
      });

      it("contains table separator syntax (|---|)", () => {
        const prompt = fn("Tedesco", "contesto", true, false);
        expect(prompt).toMatch(/\|[-]+\|/);
      });
    });
  });

  // Default e Lite template (string constants)
  describe("DEFAULT template", () => {
    it("contains table rules", () => {
      const lower = DEFAULT_TRANSLATION_PROMPT_TEMPLATE.toLowerCase();
      expect(lower).toContain("tabell");
      expect(lower).toContain("cella per cella");
    });

    it("contains Markdown table syntax", () => {
      expect(DEFAULT_TRANSLATION_PROMPT_TEMPLATE).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
    });

    it("contains [TABELLA CONTINUA]", () => {
      expect(DEFAULT_TRANSLATION_PROMPT_TEMPLATE).toContain("[TABELLA CONTINUA]");
    });
  });

  describe("LITE template", () => {
    it("contains table rules", () => {
      const lower = LITE_TRANSLATION_PROMPT_TEMPLATE.toLowerCase();
      expect(lower).toContain("tabell");
    });

    it("contains Markdown table syntax", () => {
      expect(LITE_TRANSLATION_PROMPT_TEMPLATE).toMatch(/\|\s*\w+.*\|\s*\w+.*\|/);
    });

    it("contains [TABELLA CONTINUA]", () => {
      expect(LITE_TRANSLATION_PROMPT_TEMPLATE).toContain("[TABELLA CONTINUA]");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Consistenza cross-provider — elementi fondamentali sempre presenti
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-provider prompt consistency", () => {
  const providers: { name: string; fn: ProviderPromptFn }[] = [
    { name: "Claude", fn: claudeFn },
    { name: "Gemini", fn: geminiFn },
    { name: "OpenAI", fn: openaiFn },
    { name: "Groq", fn: groqFn },
    { name: "OpenRouter", fn: openrouterFn },
  ];

  providers.forEach(({ name, fn }) => {
    describe(`${name}`, () => {
      it("contains [[PAGE_SPLIT]] marker", () => {
        const prompt = fn("Francese", "", true, false);
        expect(prompt).toContain("[[PAGE_SPLIT]]");
      });

      it("contains 'due colonne' layout instruction", () => {
        const prompt = fn("Francese", "", true, false);
        expect(prompt.toLowerCase()).toContain("due colonne");
      });

      it("contains anti-transcription rule (italiano, not source lang)", () => {
        const prompt = fn("Tedesco", "", true, false);
        const lower = prompt.toLowerCase();
        expect(lower).toContain("italiano");
        // Deve vietare la trascrizione nella lingua originale
        expect(
          lower.includes("non trascrivere") ||
          lower.includes("mai trascrivere") ||
          lower.includes("non trascriv") ||
          lower.includes("sempre italiano")
        ).toBe(true);
      });

      it("contains illegible text placeholder rule", () => {
        const prompt = fn("Tedesco", "", true, false);
        expect(prompt).toContain("[ILLEGIBILE]");
      });

      it("contains footnote rule (---)", () => {
        const prompt = fn("Tedesco", "", true, false);
        expect(prompt).toContain("---");
      });

      it("contains sourceLang placeholder resolved", () => {
        const prompt = fn("Tedesco", "", true, false);
        // getArticledLanguage("Tedesco") → "del Tedesco"
        expect(prompt.toLowerCase()).toContain("tedesco");
      });

      it("resolves legal context when enabled", () => {
        const prompt = fn("Tedesco", "", true, false);
        expect(prompt.toLowerCase()).toContain("giuridic");
      });

      it("omits legal context when disabled", () => {
        const prompt = fn("Tedesco", "", false, false);
        expect(prompt.toLowerCase()).not.toContain("giuridic");
      });

      it("includes retry mode when isRetry=true", () => {
        const prompt = fn("Tedesco", "", true, true);
        const lower = prompt.toLowerCase();
        expect(
          lower.includes("ritraduzione") ||
          lower.includes("retry") ||
          lower.includes("rifiutato")
        ).toBe(true);
      });

      it("omits retry mode when isRetry=false", () => {
        const prompt = fn("Tedesco", "", true, false);
        const lower = prompt.toLowerCase();
        expect(
          lower.includes("ritraduzione") ||
          lower.includes("retry mode")
        ).toBe(false);
      });
    });
  });

  // Claude-specific: split blocks
  describe("Claude split blocks", () => {
    it("stable block contains table rules", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesto", true);
      expect(stable).toContain("[TABELLA CONTINUA]");
      expect(stable).toMatch(/\|[-]+\|/);
    });

    it("variable block contains prevContext", () => {
      const { variable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesso di test", true);
      expect(variable).toContain("contesso di test");
    });

    it("stable block does NOT contain prevContext", () => {
      const { stable } = getClaudeTranslateSystemPromptBlocks("Tedesco", "contesso segreto", true);
      expect(stable).not.toContain("contesso segreto");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. French false friends — presente solo per lingua francese
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

    it(`${name}: does NOT include false friends for German`, () => {
      const prompt = fn("Tedesco", "", true, false);
      expect(prompt).not.toContain("Arrêter");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. cleanTranslationText — altri casi di pulizia
// ═══════════════════════════════════════════════════════════════════════════

describe("cleanTranslationText — other cleaning rules", () => {
  it("strips <br> tags", () => {
    expect(cleanTranslationText("linea1<br>linea2")).toBe("linea1\nlinea2");
  });

  it("strips <br/> tags", () => {
    expect(cleanTranslationText("linea1<br/>linea2")).toBe("linea1\nlinea2");
  });

  it("replaces &nbsp; with space", () => {
    expect(cleanTranslationText("parola1&nbsp;parola2")).toBe("parola1 parola2");
  });

  it("normalizes \\r\\n to \\n", () => {
    expect(cleanTranslationText("riga1\r\nriga2")).toBe("riga1\nriga2");
  });

  it("collapses 3+ consecutive newlines into 2", () => {
    expect(cleanTranslationText("a\n\n\nb")).toBe("a\n\nb");
  });

  it("strips trailing spaces before newline", () => {
    expect(cleanTranslationText("riga  \n")).toBe("riga\n");
  });

  it("strips leading spaces after newline", () => {
    expect(cleanTranslationText("\n  riga")).toBe("\nriga");
  });

  it("removes spaced initials (e.g. 'A B C' → 'ABC')", () => {
    expect(cleanTranslationText("L A C I T A")).toBe("LACITA");
  });

  it("does not affect normal text", () => {
    expect(cleanTranslationText("Testo normale con parole")).toBe("Testo normale con parole");
  });
});
