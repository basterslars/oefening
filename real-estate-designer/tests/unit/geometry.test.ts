import { describe, expect, it } from "vitest";
import { convexOverlap, openingFits, orthoSnap, pointInPolygon, polygonArea, polygonCentroid, rectPolygon, snapPoint, wallPieces } from "@/lib/geometry";
import type { Opening, Wall } from "@/lib/types";

const wall: Wall = { id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.12, source: "user" };
const op = (o: Partial<Opening>): Opening => ({ id: "o", wallId: "w", type: "window", offset: 2, width: 1, height: 1.2, sill: 0.9, source: "user", ...o });

describe("polygonen", () => {
  it("berekent oppervlakte en zwaartepunt van een rechthoek", () => {
    const r = rectPolygon(1, 2, 4, 3);
    expect(polygonArea(r)).toBeCloseTo(12);
    expect(polygonCentroid(r)).toEqual({ x: 3, y: 3.5 });
    expect(polygonArea([...r].reverse())).toBeCloseTo(12);
  });
  it("berekent oppervlakte van een L-vorm", () => {
    const l = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
    expect(polygonArea(l)).toBeCloseTo(12);
    expect(pointInPolygon({ x: 3, y: 3 }, l)).toBe(false);
    expect(pointInPolygon({ x: 1, y: 3 }, l)).toBe(true);
  });
});

describe("muren met openingen", () => {
  it("geeft één massief stuk zonder openingen", () => {
    expect(wallPieces(4, 2.6, [])).toEqual([{ from: 0, to: 4, bottom: 0, top: 2.6 }]);
  });
  it("spaart een raam uit met borstwering en bovenstuk", () => {
    const p = wallPieces(4, 2.6, [op({})]);
    expect(p).toContainEqual({ from: 0, to: 1.5, bottom: 0, top: 2.6 });
    expect(p).toContainEqual({ from: 1.5, to: 2.5, bottom: 0, top: 0.9 });
    const above = p.find((x) => x.bottom > 0)!;
    expect(above.from).toBe(1.5);
    expect(above.bottom).toBeCloseTo(2.1);
    expect(p).toContainEqual({ from: 2.5, to: 4, bottom: 0, top: 2.6 });
    // totale massieve oppervlakte = muur minus raam
    const area = p.reduce((s, x) => s + (x.to - x.from) * (x.top - x.bottom), 0);
    expect(area).toBeCloseTo(4 * 2.6 - 1 * 1.2);
  });
  it("deur tot het plafond laat geen bovenstuk achter", () => {
    const p = wallPieces(4, 2.1, [op({ type: "door", sill: 0, height: 2.1 })]);
    expect(p).toHaveLength(2);
  });
  it("controleert of openingen passen en niet overlappen", () => {
    expect(openingFits(op({}), wall, [])).toBe(true);
    expect(openingFits(op({ offset: 0.2 }), wall, [])).toBe(false);
    expect(openingFits(op({ id: "b", offset: 2.5 }), wall, [op({})])).toBe(false);
    expect(openingFits(op({ id: "b", offset: 3.4 }), wall, [op({})])).toBe(true);
  });
});

describe("uitlijning", () => {
  it("snapt naar raster", () => {
    expect(snapPoint({ x: 1.234, y: 0.051 }, 0.1)).toEqual({ x: 1.2, y: 0.1 });
  });
  it("trekt bijna-horizontale lijnen recht", () => {
    expect(orthoSnap({ x: 0, y: 0 }, { x: 3, y: 0.1 })).toEqual({ x: 3, y: 0 });
    expect(orthoSnap({ x: 0, y: 0 }, { x: 3, y: 2 })).toEqual({ x: 3, y: 2 });
  });
  it("SAT detecteert overlap en gescheiden rechthoeken", () => {
    expect(convexOverlap(rectPolygon(0, 0, 1, 1), rectPolygon(0.5, 0.5, 1, 1))).toBe(true);
    expect(convexOverlap(rectPolygon(0, 0, 1, 1), rectPolygon(1.2, 0, 1, 1))).toBe(false);
    // raken zonder overlap telt niet als botsing
    expect(convexOverlap(rectPolygon(0, 0, 1, 1), rectPolygon(1, 0, 1, 1))).toBe(false);
  });
});
