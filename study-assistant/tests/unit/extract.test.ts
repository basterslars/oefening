import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractDocument } from "@/lib/docs/extract";
import { chunkSegments } from "@/lib/docs/text";
import { extractKeyTerms } from "@/lib/docs/analyze";
import { detectFileType } from "@/lib/docs/file-types";

const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "../fixtures", name)));

describe("documenten uitlezen (echte bestanden)", () => {
  it("PDF: tekst per pagina met paginanummers", async () => {
    const r = await extractDocument(fixture("statistiek.pdf"), "pdf");
    expect(r.pageCount).toBe(2);
    expect(r.segments.map((s) => s.location)).toEqual(["p. 1", "p. 2"]);
    expect(r.segments[0].text).toContain("standaarddeviatie");
    expect(r.warnings).toEqual([]);
  });
  it("DOCX: koppen, lijsten en tabellen", async () => {
    const r = await extractDocument(fixture("hoofdstuk3.docx"), "docx");
    expect(r.segments.map((s) => s.heading)).toEqual(["Hoofdstuk 3 Vermogenskosten", "3.1 CAPM"]);
    const all = r.segments.map((s) => s.text).join("\n");
    expect(all).toContain("• Bèta meet het systematisch risico");
    expect(all).toContain("Rf | 3%");
    expect(extractKeyTerms(r.segments).find((t) => t.term === "WACC")?.definition).toContain("gewogen gemiddelde");
  });
  it("PPTX: tekst per slide inclusief sprekersnotities", async () => {
    const r = await extractDocument(fixture("college1.pptx"), "pptx");
    expect(r.pageCount).toBe(2);
    expect(r.segments[0].location).toBe("slide 1");
    expect(r.segments[0].heading).toBe("Marketingmix");
    expect(r.segments[0].text).toContain("Notities: Benadruk");
    const chunks = chunkSegments(r.segments);
    expect(chunks[0].location).toBe("slide 1–2");
  });
  it("XLSX: bladen, cellen en formules", async () => {
    const r = await extractDocument(fixture("ncw-model.xlsx"), "xlsx");
    expect(r.segments.map((s) => s.location)).toEqual(["blad NCW", "blad Toelichting"]);
    expect(r.segments[0].text).toContain("Jaar | Kasstroom | Disconteringsfactor");
    expect(r.segments[0].text).toContain("(=B2*C2)");
    expect(r.segments[1].text).toContain("Netto contante waarde & rendement");
  });
  it("tekstbestanden en bestandstypen", async () => {
    const r = await extractDocument(new TextEncoder().encode("# Titel\nInhoud over regressie."), "md");
    expect(r.segments[0].heading).toBe("Titel");
    expect(detectFileType("Week1.PPTX")).toBe("pptx");
    expect(detectFileType("oud.doc")).toBeNull();
  });
});
