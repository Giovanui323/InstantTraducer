import { describe, expect, it } from "vitest";
import { normalizePageSplitFootnotes, PAGE_SPLIT, splitColumns } from "../textUtils";

describe("splitColumns", () => {
  it("ritorna un solo blocco quando il marker non è presente", () => {
    expect(splitColumns("ciao")).toEqual(["ciao"]);
  });

  it("splitta in due blocchi quando il marker è presente una volta", () => {
    expect(splitColumns("SINISTRA[[PAGE_SPLIT]]DESTRA")).toEqual(["SINISTRA", "DESTRA"]);
  });

  it("non perde testo quando il marker è duplicato", () => {
    expect(splitColumns("L[[PAGE_SPLIT]]R1[[PAGE_SPLIT]]R2")).toEqual(["L", "R1[[PAGE_SPLIT]]R2"]);
  });
});

describe("normalizePageSplitFootnotes", () => {
  it("sposta le note a piè di pagina nel blocco sinistro quando la destra non ha richiami", () => {
    const input = `Testo sinistra¹\n\n${PAGE_SPLIT}\nTesto destra\n\n---\n1 Nota a piè di pagina`;
    const out = normalizePageSplitFootnotes(input);
    expect(out).toContain(PAGE_SPLIT);
    const [left, right] = splitColumns(out);
    expect(left).toContain("---");
    expect(left).toContain("Nota a piè di pagina");
    expect(right).not.toContain("Nota a piè di pagina");
  });
});
