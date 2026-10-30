import { describe, expect, it } from "vitest";
import { checkPlacement, findFreeSpot, snapToWall } from "@/lib/editor/collision";
import { newFurniture } from "@/lib/project";
import type { Wall } from "@/lib/types";

const walls: Wall[] = [
  { id: "n", a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness: 0.12, source: "user" },
  { id: "w", a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, thickness: 0.12, source: "user" },
];

describe("botsingsdetectie", () => {
  it("weigert een bank door een muur", () => {
    const sofa = newFurniture("sofa-3", 1.5, 0.2);
    const r = checkPlacement(sofa, [], walls);
    expect(r.ok).toBe(false);
    expect(r.wallIds).toContain("n");
  });
  it("staat een bank vrij in de kamer toe", () => {
    expect(checkPlacement(newFurniture("sofa-3", 2.5, 2), [], walls).ok).toBe(true);
  });
  it("houdt rekening met rotatie", () => {
    // 2,2 m brede bank 90° gedraaid naast de westmuur: past als diepte < afstand
    const sofa = newFurniture("sofa-3", 0.6, 2, Math.PI / 2);
    expect(checkPlacement(sofa, [], walls).ok).toBe(true);
    expect(checkPlacement({ ...sofa, rotation: 0 }, [], walls).ok).toBe(false);
  });
  it("detecteert overlappende meubels maar staat stoelen onder tafels toe", () => {
    const table = newFurniture("dining-6", 2.5, 2);
    const chair = newFurniture("chair", 2.5, 2.3);
    const bed = newFurniture("bed-double", 2.5, 2);
    expect(checkPlacement(chair, [table], walls).ok).toBe(true);
    expect(checkPlacement(bed, [table], walls).itemIds).toContain(table.id);
  });
  it("vloerkleden en wandobjecten botsen niet", () => {
    const sofa = newFurniture("sofa-3", 2.5, 2);
    expect(checkPlacement(newFurniture("rug-rect", 2.5, 2), [sofa], walls).ok).toBe(true);
    expect(checkPlacement(newFurniture("painting", 2.5, 0.08), [], walls).ok).toBe(true);
  });
  it("zoekt een nabije vrije plek", () => {
    const sofa = newFurniture("sofa-3", 2.5, 2);
    const other = newFurniture("sofa-3", 2.5, 2.2);
    const free = findFreeSpot(other, [sofa], walls)!;
    expect(free).not.toBeNull();
    expect(checkPlacement(free, [sofa], walls).ok).toBe(true);
  });
  it("plaatst wandobjecten tegen de muur, met de voorkant de kamer in", () => {
    const s = snapToWall({ x: 2, y: 0.4 }, 0.04, walls)!;
    expect(s.y).toBeCloseTo(0.06 + 0.02 + 0.005);
    expect(s.rotation).toBeCloseTo(0); // voorkant wijst naar +y
    const sw = snapToWall({ x: 0.3, y: 2 }, 0.04, walls)!;
    // voorkant moet naar +x wijzen: (-sin r, cos r) = (1, 0)
    expect(-Math.sin(sw.rotation)).toBeCloseTo(1);
    expect(Math.cos(sw.rotation)).toBeCloseTo(0);
  });
});
