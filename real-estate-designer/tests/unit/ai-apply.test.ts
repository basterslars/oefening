import { describe, expect, it } from "vitest";
import { applyProposal, buildDesignContext, floorPlanFromAnalysis } from "@/lib/ai/apply";
import { DesignProposalSchema, type DesignProposal, type FloorPlanAnalysis } from "@/lib/ai/schemas";
import { checkPlacement } from "@/lib/editor/collision";
import { createProject, newFurniture } from "@/lib/project";
import { pointInPolygon } from "@/lib/geometry";
import { roomsCsv } from "@/lib/export/csv";

function project() {
  return createProject({
    name: "Test",
    propertyType: "appartement",
    address: "",
    furnishing: "leeg",
    inputMethod: "manual",
    roomCount: 2,
    totalArea: null,
    ceilingHeight: { value: 2.6, source: "user" },
    rooms: [
      { name: "Woonkamer", length: 6, width: 4 },
      { name: "Slaapkamer", length: 3.5, width: 3 },
    ],
  });
}

const variant = (over: Partial<DesignProposal["variants"][number]>): DesignProposal["variants"][number] => ({
  name: "Scandinavisch",
  style: "Scandinavisch",
  rationale: "",
  roomFinishes: [],
  remove: [],
  recolor: [],
  add: [],
  ...over,
});

describe("AI-voorstellen toepassen", () => {
  it("bouwt context met ruimtes, muren en meubels", () => {
    const p = project();
    p.variants[0].furniture.push(newFurniture("sofa-3", 3, 2));
    const ctx = buildDesignContext(p, p.variants[0], "modern", 1, null);
    expect(ctx.rooms).toHaveLength(2);
    expect(ctx.furniture[0].roomId).toBe(p.plan.rooms[0].id);
  });

  it("plaatst geldige objecten en corrigeert botsingen binnen de ruimte", () => {
    const p = project();
    const room = p.plan.rooms[0];
    const res = applyProposal(
      p,
      p.variants[0],
      variant({
        add: [
          { catalogId: "sofa-3", roomId: room.id, x: 3, y: 0.3, rotationDeg: 0, color: "#cccccc", finish: "fabric", reason: "" }, // door de muur
          { catalogId: "coffee-table", roomId: room.id, x: 3, y: 2, rotationDeg: 0, color: "#a47b55", finish: "wood", reason: "" },
        ],
        roomFinishes: [{ roomId: room.id, floor: "herringbone", wallColor: "#ece6dc" }],
      }),
    );
    expect(res.added).toBe(2);
    expect(res.moved).toBeGreaterThanOrEqual(1);
    for (const f of res.variant.furniture) {
      expect(checkPlacement(f, res.variant.furniture, p.plan.walls).ok).toBe(true);
      expect(pointInPolygon(f, room.polygon)).toBe(true);
      expect(f.source).toBe("ai_proposal");
    }
    expect(res.variant.finishes[room.id]).toEqual({ floor: "herringbone", wallColor: "#ece6dc" });
  });

  it("verwijdert en herkleurt alleen bestaande objecten", () => {
    const p = project();
    const a = newFurniture("sofa-3", 3, 2);
    const b = newFurniture("armchair", 1.2, 1.2);
    p.variants[0].furniture.push(a, b);
    const res = applyProposal(p, p.variants[0], variant({ remove: [a.id], recolor: [{ itemId: b.id, color: "#112233", finish: "leather" }, { itemId: "bestaat-niet", color: "#000000", finish: null }] }));
    expect(res.variant.furniture).toHaveLength(1);
    expect(res.variant.furniture[0].color).toBe("#112233");
    expect(res.variant.furniture[0].finish).toBe("leather");
    // basisvariant blijft onaangetast
    expect(p.variants[0].furniture).toHaveLength(2);
  });

  it("schema weigert onbekende catalogus-id's", () => {
    const bad = { summary: "", limitations: [], variants: [variant({ add: [{ catalogId: "ruimteschip", roomId: "r", x: 0, y: 0, rotationDeg: 0, color: "#fff", finish: "wood", reason: "" }] as never })] };
    expect(DesignProposalSchema.safeParse(bad).success).toBe(false);
  });
});

describe("plattegrondanalyse omzetten", () => {
  const analysis: FloorPlanAnalysis = {
    walls: [
      { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, exterior: true },
      { x1: 0.9, y1: 0.1, x2: 0.9, y2: 0.9, exterior: true },
    ],
    openings: [{ type: "door", x: 0.5, y: 0.1, widthNorm: 0.09 }],
    rooms: [{ name: "Woonkamer", polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }], labelledAreaM2: null }],
    dimensions: [{ text: "8.00", meters: 8, x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.05 }],
    confidence: "middel",
    caveats: [],
  };
  it("gebruikt maatvoering op de tekening als er geen kalibratie is", () => {
    const r = floorPlanFromAnalysis(analysis, { widthPx: 1000, heightPx: 1000 }, null, { x: 0, y: 0 });
    expect(r.scaleSource).toBe("ai_dimensions");
    expect(r.pxPerMeter).toBeCloseTo(100);
    expect(r.plan.walls[0].b.x - r.plan.walls[0].a.x).toBeCloseTo(8);
    expect(r.plan.walls.every((w) => w.source === "ai_estimate")).toBe(true);
    expect(r.plan.openings).toHaveLength(1);
    expect(r.plan.openings[0].width).toBeCloseTo(0.9);
  });
  it("gaat voor op de kalibratie van de gebruiker", () => {
    const r = floorPlanFromAnalysis(analysis, { widthPx: 1000, heightPx: 1000 }, 50, { x: 0, y: 0 });
    expect(r.scaleSource).toBe("calibration");
    expect(r.plan.walls[0].b.x - r.plan.walls[0].a.x).toBeCloseTo(16);
  });
  it("levert niets op zonder schaal", () => {
    const r = floorPlanFromAnalysis({ ...analysis, dimensions: [] }, { widthPx: 1000, heightPx: 1000 }, null, { x: 0, y: 0 });
    expect(r.scaleSource).toBe("none");
    expect(r.plan.walls).toHaveLength(0);
  });
});

describe("CSV-export", () => {
  it("bevat ruimtes met decimale komma en herkomst", () => {
    const csv = roomsCsv(project());
    expect(csv).toContain("Woonkamer;24,0;6,00;4,00;4;Ingevoerd");
    expect(csv).toContain("Plafondhoogte (m);2,60");
  });
});
