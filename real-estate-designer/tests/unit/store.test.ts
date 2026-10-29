import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "@/lib/editor/store";
import { activeVariant, createProject, normalizeProject } from "@/lib/project";
import { rectPolygon, wallLength } from "@/lib/geometry";

function fresh() {
  const p = createProject({
    name: "Test",
    propertyType: "appartement",
    address: "",
    furnishing: "leeg",
    inputMethod: "manual",
    roomCount: 2,
    totalArea: null,
    ceilingHeight: { value: 2.6, source: "default" },
    rooms: [{ name: "Woonkamer", length: 6, width: 4 }],
  });
  useEditor.getState().load(p);
  return p;
}

describe("editor-store", () => {
  beforeEach(() => fresh());

  it("maakt ruimtes met muren uit de wizard-invoer", () => {
    const p = useEditor.getState().project!;
    expect(p.plan.rooms).toHaveLength(1);
    expect(p.plan.walls).toHaveLength(4);
    expect(p.plan.rooms[0].source).toBe("user");
  });

  it("voegt muren toe en maakt dat ongedaan/opnieuw", () => {
    const s = useEditor.getState();
    s.addWall({ x: 10, y: 0 }, { x: 13, y: 0 }, 0.12);
    expect(useEditor.getState().project!.plan.walls).toHaveLength(5);
    useEditor.getState().undo();
    expect(useEditor.getState().project!.plan.walls).toHaveLength(4);
    useEditor.getState().redo();
    expect(useEditor.getState().project!.plan.walls).toHaveLength(5);
  });

  it("verplaatst aangesloten muurhoeken mee", () => {
    const walls = useEditor.getState().project!.plan.walls;
    const w = walls[0];
    useEditor.getState().moveWallEndpoint(w.id, "b", { x: 7, y: 0 });
    const after = useEditor.getState().project!.plan.walls;
    expect(after[0].b).toEqual({ x: 7, y: 0 });
    expect(after[1].a).toEqual({ x: 7, y: 0 }); // volgende muur deelde dit punt
  });

  it("stelt een exacte muurlengte in", () => {
    const w = useEditor.getState().project!.plan.walls[0];
    useEditor.getState().setWallLength(w.id, 5.25);
    expect(wallLength(useEditor.getState().project!.plan.walls[0])).toBeCloseTo(5.25);
  });

  it("verwijdert openingen samen met hun muur", () => {
    const w = useEditor.getState().project!.plan.walls[0];
    useEditor.getState().addOpening({ wallId: w.id, type: "door", offset: 1, width: 0.9, height: 2.1, sill: 0, source: "user" });
    useEditor.getState().select({ kind: "wall", id: w.id });
    useEditor.getState().deleteSelection();
    expect(useEditor.getState().project!.plan.openings).toHaveLength(0);
  });

  it("weigert een meubelverplaatsing door een muur", () => {
    const id = useEditor.getState().addItem("sofa-3", { x: 3, y: 2 })!;
    expect(id).toBeTruthy();
    const ok = useEditor.getState().updateItem(id, { x: 3, y: -0.2 });
    expect(ok).toBe(false);
    const it = activeVariant(useEditor.getState().project!).furniture[0];
    expect(it.y).toBeCloseTo(2);
  });

  it("varianten hebben eigen inrichting en afwerking", () => {
    const s = useEditor.getState();
    s.addItem("sofa-3", { x: 3, y: 2 });
    const roomId = s.project!.plan.rooms[0].id;
    s.addVariant("Leeg", "Modern", "empty");
    useEditor.getState().setRoomFinish(roomId, { floor: "marble" });
    const p = useEditor.getState().project!;
    expect(p.variants).toHaveLength(2);
    expect(activeVariant(p).furniture).toHaveLength(0);
    expect(activeVariant(p).finishes[roomId].floor).toBe("marble");
    expect(p.variants[0].finishes[roomId]).toBeUndefined();
  });

  it("schaalt een rechthoekige ruimte", () => {
    const r = useEditor.getState().project!.plan.rooms[0];
    useEditor.getState().updateRoom(r.id, { polygon: rectPolygon(0, 0, 3, 3) });
    expect(useEditor.getState().project!.plan.rooms[0].polygon[2]).toEqual({ x: 3, y: 3 });
  });

  it("serialiseert en herstelt een project", () => {
    const p = useEditor.getState().project!;
    const back = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
  });

  it("herstelt onvolledige documenten en verwijdert wees-openingen", () => {
    const p = normalizeProject({ id: "x", plan: { walls: [], openings: [{ id: "o", wallId: "weg" }] } });
    expect(p.plan.openings).toHaveLength(0);
    expect(p.variants).toHaveLength(1);
    expect(p.ceilingHeight.source).toBe("default");
  });
});
