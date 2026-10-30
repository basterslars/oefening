import { describe, expect, it } from "vitest";
import { chunkSegments, decodeXml, htmlToSegments, markdownToSegments, countWords } from "@/lib/docs/text";
import { categorize, extractKeyTerms } from "@/lib/docs/analyze";
import { buildTsQuery } from "@/lib/search-query";

describe("tekstverwerking", () => {
  it("decodeert XML-entiteiten", () => {
    expect(decodeXml("R&amp;D &lt;5% &#8364; &#x20AC;")).toBe("R&D <5% € €");
  });
  it("splitst HTML per kop met tabellen en lijsten", () => {
    const segs = htmlToSegments("<h1>Hoofdstuk 1</h1><p>Intro</p><ul><li>punt</li></ul><h2>1.1 WACC</h2><table><tr><td>a</td><td>b</td></tr></table>");
    expect(segs).toHaveLength(2);
    expect(segs[0].heading).toBe("Hoofdstuk 1");
    expect(segs[0].text).toContain("• punt");
    expect(segs[1].location).toBe("§ 1.1 WACC");
    expect(segs[1].text).toContain("a | b");
  });
  it("splitst markdown per kop", () => {
    const segs = markdownToSegments("# A\ntekst\n## B\nmeer");
    expect(segs.map((s) => s.heading)).toEqual(["A", "B"]);
  });
  it("voegt korte slides samen met locatiebereik", () => {
    const chunks = chunkSegments(
      [1, 2, 3].map((n) => ({ location: `slide ${n}`, heading: null, text: `Dit is de tekst van slide nummer ${n} met inhoud.` })),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].location).toBe("slide 1–3");
  });
  it("splitst lange tekst met overlap en behoudt alle inhoud", () => {
    const para = (i: number) => `Alinea ${i}. ` + "De netto contante waarde wordt berekend door kasstromen te disconteren. ".repeat(8);
    const text = Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n");
    const chunks = chunkSegments([{ location: "p. 4", heading: null, text }], 1400, 2000, 200);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(2100);
    for (let i = 0; i < 12; i++) expect(chunks.some((c) => c.content.includes(`Alinea ${i}.`))).toBe(true);
    expect(chunks.every((c) => c.location === "p. 4")).toBe(true);
  });
  it("telt woorden", () => {
    expect(countWords("Eén, twee — drie 4")).toBe(4);
  });
});

describe("lokale analyse", () => {
  it("categoriseert op naam en type", () => {
    expect(categorize("Week 3 lecture.pptx", "pptx", "")).toBe("collegeslides");
    expect(categorize("oefententamen 2024.pdf", "pdf", "")).toBe("oefenmateriaal");
    expect(categorize("model.xlsx", "xlsx", "")).toBe("data/rekenmodel");
    expect(categorize("paper.pdf", "pdf", "Abstract. This study... References")).toBe("artikel");
    expect(categorize("H4 Kostprijs.pdf", "pdf", "")).toBe("boek/hoofdstuk");
  });
  it("herkent definities en afkortingen", () => {
    const terms = extractKeyTerms([
      { location: null, heading: null, text: "Liquiditeit is het vermogen om op korte termijn aan verplichtingen te voldoen. De WACC wordt gebruikt. WACC en WACC opnieuw." },
    ]);
    expect(terms.find((t) => t.term === "Liquiditeit")?.definition).toContain("vermogen");
    expect(terms.some((t) => t.term === "WACC")).toBe(true);
  });
});

describe("zoekquery", () => {
  it("maakt een veilige OR-prefixquery zonder stopwoorden", () => {
    expect(buildTsQuery("Wat is het verschil tussen de WACC en het CAPM?")).toBe("wacc:* | capm:*");
  });
  it("verwijdert tsquery-operatoren", () => {
    expect(buildTsQuery("a & b | !c ) (:* 'x'")).toBe("");
    expect(buildTsQuery("NPV 2024 & beta")).toBe("npv:* | 2024:* | beta:*");
  });
});
