"use client";

/* Three.js-objecten (camera, refs voor capture) worden in React Three Fiber
   bewust imperatief gemuteerd in effects en useFrame; dat is het gedocumenteerde
   R3F-patroon en valt buiten wat de React Compiler-regel kan beoordelen. */
/* eslint-disable react-hooks/immutability */

import { Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getCatalogItem } from "@/lib/catalog";
import { checkPlacement, snapToWall } from "@/lib/editor/collision";
import type { CameraMode, WallMode } from "@/lib/editor/store";
import {
  add,
  normalize,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  projectOnSegment,
  sub,
  wallAngle,
  wallLength,
  wallPieces,
} from "@/lib/geometry";
import { roomFinish } from "@/lib/project";
import { buildFurniture } from "@/lib/three/furniture";
import { floorMaterial, plainMaterial } from "@/lib/three/materials";
import type { DesignVariant, FloorPlan, FurnitureItem, Opening, Vec2, Wall } from "@/lib/types";

export interface CaptureApi {
  capture(opts?: { width?: number; type?: string; quality?: number }): string;
  /** Wacht tot de volgende frames gerenderd zijn (na een state-wijziging) */
  nextFrame(): Promise<void>;
}

export interface Scene3DProps {
  plan: FloorPlan;
  variant: DesignVariant | null;
  ceilingHeight: number;
  showFurniture: boolean;
  wallMode: WallMode;
  cameraMode: CameraMode;
  selectedItemId?: string | null;
  interactive?: boolean;
  collisions?: boolean;
  /** Eigen GLB/GLTF-modellen: assetId -> object-URL */
  modelUrls?: Record<string, string>;
  onSelectItem?(id: string | null): void;
  onDragStart?(): void;
  onMoveItem?(id: string, patch: Partial<FurnitureItem>): boolean;
  onDragEnd?(): void;
  captureRef?: React.MutableRefObject<CaptureApi | null>;
  className?: string;
}

const WALK_EYE = 1.6;

export function Scene3D(props: Scene3DProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <Canvas
      className={props.className}
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      camera={{ fov: 50, near: 0.05, far: 400, position: [8, 9, 12] }}
      onPointerMissed={() => props.onSelectItem?.(null)}
      data-testid="scene-3d"
    >
      <color attach="background" args={["#f2f1ee"]} />
      <SceneContent {...props} dragging={dragging} setDragging={setDragging} />
    </Canvas>
  );
}

function SceneContent(props: Scene3DProps & { dragging: boolean; setDragging(v: boolean): void }) {
  const { plan, variant, ceilingHeight, wallMode, cameraMode, showFurniture } = props;
  const bounds = useMemo(() => planBounds(plan), [plan]);
  const { gl, invalidate } = useThree();

  useEffect(() => {
    if (!props.captureRef) return;
    props.captureRef.current = {
      capture: ({ width, type = "image/png", quality = 0.92 } = {}) => {
        const src = gl.domElement;
        if (!width || width >= src.width) return src.toDataURL(type, quality);
        const c = document.createElement("canvas");
        c.width = width;
        c.height = Math.round((src.height / src.width) * width);
        c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL(type, quality);
      },
      nextFrame: () =>
        new Promise((resolve) => {
          invalidate();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    };
    return () => {
      if (props.captureRef) props.captureRef.current = null;
    };
  }, [gl, invalidate, props.captureRef]);

  const cutHeight = wallMode === "cutaway" ? Math.min(1.1, ceilingHeight) : ceilingHeight;

  return (
    <>
      <hemisphereLight args={["#ffffff", "#d9d1c3", 0.75]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[bounds.cx + bounds.size * 0.6, bounds.size * 1.2 + 6, bounds.cz + bounds.size * 0.4]}
        intensity={2.1}
        color="#fff4e3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-bounds.size, bounds.size, bounds.size, -bounds.size, 0.1, bounds.size * 4 + 20]} />
      </directionalLight>
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer intensity={0.6} position={[-10, 3, 0]} rotation-y={Math.PI / 2} scale={[20, 6, 1]} color="#fff4e6" />
        <Lightformer intensity={0.5} position={[10, 3, 0]} rotation-y={-Math.PI / 2} scale={[20, 6, 1]} color="#e8f0ff" />
      </Environment>

      {/* Grondvlak */}
      <mesh rotation-x={-Math.PI / 2} position={[bounds.cx, -0.02, bounds.cz]} receiveShadow>
        <planeGeometry args={[bounds.size * 4 + 30, bounds.size * 4 + 30]} />
        <meshStandardMaterial color="#e9e6df" roughness={1} />
      </mesh>

      <Floors plan={plan} variant={variant} />
      {wallMode !== "hidden" && plan.walls.map((w) => <WallMesh key={w.id} wall={w} plan={plan} variant={variant} height={w.height ?? ceilingHeight} cut={cutHeight} />)}
      {cameraMode === "walk" && wallMode === "full" && <Ceiling plan={plan} height={ceilingHeight} />}

      {showFurniture &&
        variant?.furniture.map((it) => (
          <FurnitureObject key={it.id} item={it} {...props} />
        ))}

      {cameraMode === "top" &&
        plan.rooms.map((r) => {
          const c = polygonCentroid(r.polygon);
          return (
            <Html key={r.id} position={[c.x, ceilingHeight + 0.2, c.y]} center zIndexRange={[10, 0]}>
              <div className="pointer-events-none whitespace-nowrap rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm">{r.name}</div>
            </Html>
          );
        })}

      <CameraRig mode={cameraMode} bounds={bounds} plan={plan} dragging={props.dragging} furniture={showFurniture ? (variant?.furniture ?? []) : []} />
    </>
  );
}

// ---------- Hulpfuncties ----------

function planBounds(plan: FloorPlan) {
  const pts: Vec2[] = [...plan.walls.flatMap((w) => [w.a, w.b]), ...plan.rooms.flatMap((r) => r.polygon)];
  if (pts.length === 0) return { cx: 0, cz: 0, size: 6, minX: -3, minY: -3, maxX: 3, maxY: 3 };
  const b = polygonBounds(pts);
  return { cx: b.minX + b.width / 2, cz: b.minY + b.height / 2, size: Math.max(4, Math.max(b.width, b.height) / 2 + 1), ...b };
}

function roomColorAt(plan: FloorPlan, variant: DesignVariant | null, p: Vec2) {
  for (const r of plan.rooms) if (pointInPolygon(p, r.polygon)) return roomFinish(r, variant).wallColor;
  return "#f1efea";
}

// ---------- Vloeren ----------

function Floors({ plan, variant }: { plan: FloorPlan; variant: DesignVariant | null }) {
  return (
    <>
      {plan.rooms.map((r) => {
        if (r.polygon.length < 3) return null;
        const fin = roomFinish(r, variant);
        return <RoomFloor key={r.id} polygon={r.polygon} material={floorMaterial(fin.floor)} />;
      })}
    </>
  );
}

function RoomFloor({ polygon, material }: { polygon: Vec2[]; material: THREE.Material }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, -p.y)));
    return new THREE.ShapeGeometry(shape);
  }, [polygon]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={material} rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow />;
}

function Ceiling({ plan, height }: { plan: FloorPlan; height: number }) {
  return (
    <>
      {plan.rooms.map((r) => {
        const shape = new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(p.x, -p.y)));
        return (
          <mesh key={r.id} rotation-x={-Math.PI / 2} position-y={height}>
            <shapeGeometry args={[shape]} />
            {/* Plafond krijgt nauwelijks direct licht; licht emissief zodat het niet grauw oogt */}
            <meshStandardMaterial color="#f7f6f2" emissive="#ebe8e1" emissiveIntensity={0.55} roughness={0.95} side={THREE.BackSide} />
          </mesh>
        );
      })}
    </>
  );
}

// ---------- Muren ----------

function WallMesh({ wall, plan, variant, height, cut }: { wall: Wall; plan: FloorPlan; variant: DesignVariant | null; height: number; cut: number }) {
  const l = wallLength(wall);
  const openings = plan.openings.filter((o) => o.wallId === wall.id);
  const angle = wallAngle(wall);
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const n = normalize({ x: -(wall.b.y - wall.a.y), y: wall.b.x - wall.a.x });
  const probe = wall.thickness / 2 + 0.15;
  const colorPos = wall.color ?? roomColorAt(plan, variant, add(mid, { x: n.x * probe, y: n.y * probe }));
  const colorNeg = wall.color ?? roomColorAt(plan, variant, sub(mid, { x: n.x * probe, y: n.y * probe }));
  const mats = useMemo(() => {
    const edge = plainMaterial("#e9e6e0", 0.9);
    const pos = plainMaterial(colorPos, 0.92);
    const neg = plainMaterial(colorNeg, 0.92);
    // volgorde BoxGeometry-groepen: +x, -x, +y, -y, +z, -z
    return [edge, edge, edge, edge, pos, neg];
  }, [colorPos, colorNeg]);
  const top = Math.min(height, cut);
  const pieces = wallPieces(l, height, openings)
    .map((p) => ({ ...p, top: Math.min(p.top, top) }))
    .filter((p) => p.top - p.bottom > 0.005);
  // Laat muren 'in elkaar' lopen op de hoeken door de halve dikte te verlengen aan uiteinden zonder opening
  const ext = wall.thickness / 2;
  return (
    <group position={[wall.a.x, 0, wall.a.y]} rotation-y={-angle}>
      {pieces.map((p, i) => {
        const from = p.from === 0 ? -ext : p.from;
        const to = Math.abs(p.to - l) < 1e-6 ? l + ext : p.to;
        return (
          <mesh key={i} position={[(from + to) / 2, (p.bottom + p.top) / 2, 0]} material={mats} castShadow receiveShadow>
            <boxGeometry args={[to - from, p.top - p.bottom, wall.thickness]} />
          </mesh>
        );
      })}
      {openings.map((o) => (
        <OpeningMesh key={o.id} o={o} thickness={wall.thickness} cut={top} />
      ))}
    </group>
  );
}

function OpeningMesh({ o, thickness, cut }: { o: Opening; thickness: number; cut: number }) {
  const frame = plainMaterial("#f5f4f0", 0.5);
  const top = Math.min(o.sill + o.height, cut);
  if (top <= o.sill + 0.02) return null;
  const h = top - o.sill;
  const f = 0.05;
  if (o.type === "window") {
    return (
      <group position={[o.offset, o.sill, 0]}>
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[o.width - f * 2, h - f * 2, 0.01]} />
          <meshPhysicalMaterial color="#cfe3ea" roughness={0.05} transmission={0.9} transparent opacity={0.3} />
        </mesh>
        <mesh position={[0, 0.01, 0]} material={frame} castShadow>
          <boxGeometry args={[o.width, 0.02, thickness + 0.04]} />
        </mesh>
        <mesh position={[0, h - f / 2, 0]} material={frame}>
          <boxGeometry args={[o.width, f, thickness * 0.4]} />
        </mesh>
        <mesh position={[-o.width / 2 + f / 2, h / 2, 0]} material={frame}>
          <boxGeometry args={[f, h, thickness * 0.4]} />
        </mesh>
        <mesh position={[o.width / 2 - f / 2, h / 2, 0]} material={frame}>
          <boxGeometry args={[f, h, thickness * 0.4]} />
        </mesh>
      </group>
    );
  }
  const sw = o.swing ?? 1;
  return (
    <group position={[o.offset, 0, 0]}>
      <mesh position={[-o.width / 2 + f / 2, h / 2, 0]} material={frame}>
        <boxGeometry args={[f, h, thickness + 0.02]} />
      </mesh>
      <mesh position={[o.width / 2 - f / 2, h / 2, 0]} material={frame}>
        <boxGeometry args={[f, h, thickness + 0.02]} />
      </mesh>
      {top >= o.height && (
        <mesh position={[0, h - f / 2, 0]} material={frame}>
          <boxGeometry args={[o.width, f, thickness + 0.02]} />
        </mesh>
      )}
      {/* Deurblad, half geopend */}
      <group position={[-o.width / 2 + f, 0, (sw * thickness) / 2]} rotation-y={(-sw * Math.PI) / 3}>
        <mesh position={[(o.width - f * 2) / 2, Math.min(h, o.height - 0.01) / 2, (sw * 0.02)]} castShadow>
          <boxGeometry args={[o.width - f * 2, Math.min(h, o.height - 0.01), 0.04]} />
          <meshStandardMaterial color="#efece6" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- Meubels ----------

const gltfCache = new Map<string, Promise<THREE.Group>>();
function loadGltf(url: string) {
  let p = gltfCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene);
    gltfCache.set(url, p);
  }
  return p;
}

function CustomModel({ url, size }: { url: string; size: { w: number; d: number; h: number } }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadGltf(url)
      .then((scene) => {
        if (!alive) return;
        const clone = scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const s = box.getSize(new THREE.Vector3());
        const k = Math.min(size.w / (s.x || 1), size.h / (s.y || 1), size.d / (s.z || 1));
        clone.scale.setScalar(k);
        const box2 = new THREE.Box3().setFromObject(clone);
        const c = box2.getCenter(new THREE.Vector3());
        clone.position.sub(new THREE.Vector3(c.x, box2.min.y, c.z));
        clone.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        setObj(clone);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url, size.w, size.d, size.h]);
  if (failed)
    return (
      <mesh position-y={size.h / 2}>
        <boxGeometry args={[size.w, size.h, size.d]} />
        <meshStandardMaterial color="#e57373" wireframe />
      </mesh>
    );
  return obj ? <primitive object={obj} /> : null;
}

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpV = new THREE.Vector3();

function FurnitureObject(props: Scene3DProps & { item: FurnitureItem; dragging: boolean; setDragging(v: boolean): void }) {
  const { item, interactive, selectedItemId, plan, variant, ceilingHeight } = props;
  const cat = getCatalogItem(item.catalogId);
  const size = item.size ?? cat.size;
  const group = useMemo(
    () => (cat.shape === "custom_model" ? null : buildFurniture(cat, { color: item.color, finish: item.finish, size: item.size })),
    [cat, item.color, item.finish, item.size],
  );
  const grab = useRef<{ dx: number; dz: number } | null>(null);
  const selected = selectedItemId === item.id;
  const colliding = useMemo(() => (variant ? !checkPlacement(item, variant.furniture, plan.walls).ok : false), [item, variant, plan.walls]);
  const y = cat.layer === "ceiling" ? ceilingHeight - size.h : item.elevation;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    props.onSelectItem?.(item.id);
    if (e.ray.intersectPlane(dragPlane, tmpV)) grab.current = { dx: item.x - tmpV.x, dz: item.y - tmpV.z };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    props.setDragging(true);
    props.onDragStart?.();
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return;
    e.stopPropagation();
    if (!e.ray.intersectPlane(dragPlane, tmpV)) return;
    const x = Math.round((tmpV.x + grab.current.dx) / 0.05) * 0.05;
    const z = Math.round((tmpV.z + grab.current.dz) / 0.05) * 0.05;
    if (cat.layer === "wall") {
      const sw = snapToWall({ x, y: z }, size.d, plan.walls);
      if (sw && props.onMoveItem?.(item.id, sw)) return;
    }
    if (!props.onMoveItem?.(item.id, { x, y: z })) if (!props.onMoveItem?.(item.id, { x, y: item.y })) props.onMoveItem?.(item.id, { x: item.x, y: z });
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return;
    e.stopPropagation();
    grab.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    props.setDragging(false);
    props.onDragEnd?.();
  };

  return (
    <group position={[item.x, y, item.y]} rotation-y={-item.rotation} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      {group ? <primitive object={group} /> : item.modelAssetId && props.modelUrls?.[item.modelAssetId] ? (
        <Suspense fallback={null}>
          <CustomModel url={props.modelUrls[item.modelAssetId]} size={size} />
        </Suspense>
      ) : (
        <mesh position-y={size.h / 2}>
          <boxGeometry args={[size.w, size.h, size.d]} />
          <meshStandardMaterial color="#bbbbbb" />
        </mesh>
      )}
      {(selected || colliding) && (
        <lineSegments position-y={size.h / 2}>
          <edgesGeometry args={[new THREE.BoxGeometry(size.w + 0.04, size.h + 0.04, size.d + 0.04)]} />
          <lineBasicMaterial color={colliding ? "#dc2626" : "#1f3a34"} />
        </lineSegments>
      )}
    </group>
  );
}

// ---------- Camera ----------

function CameraRig({ mode, bounds, plan, dragging, furniture }: { mode: CameraMode; bounds: ReturnType<typeof planBounds>; plan: FloorPlan; dragging: boolean; furniture: FurnitureItem[] }) {
  const { camera } = useThree();
  const furnitureRef = useRef(furniture);
  useEffect(() => {
    furnitureRef.current = furniture;
  }, [furniture]);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const key = `${mode}|${bounds.cx.toFixed(1)}|${bounds.cz.toFixed(1)}|${bounds.size.toFixed(1)}`;
  const lastKey = useRef<string>("");

  useEffect(() => {
    // Herpositioneren bij een andere modus; in bovenaanzicht ook als de plattegrond flink van grootte verandert
    if (lastKey.current === key) return;
    if (lastKey.current !== "" && lastKey.current.split("|")[0] === mode && mode !== "top") {
      lastKey.current = key;
      return;
    }
    lastKey.current = key;
    const { cx, cz, size } = bounds;
    if (mode === "orbit") {
      camera.position.set(cx + size * 1.1, size * 1.5 + 2, cz + size * 1.6);
      controls.current?.target.set(cx, 0.6, cz);
    } else if (mode === "top") {
      camera.position.set(cx, size * 2.6 + 4, cz + 0.001);
      controls.current?.target.set(cx, 0, cz);
    } else {
      const start = walkStart(plan, furnitureRef.current) ?? { x: cx, y: cz, yaw: 0 };
      camera.position.set(start.x, WALK_EYE, start.y);
      camera.rotation.set(0, start.yaw, 0, "YXZ");
    }
    camera.updateProjectionMatrix();
    controls.current?.update();
  }, [mode, key, bounds, camera, plan]);

  if (mode === "walk") return <WalkControls plan={plan} />;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      enableRotate={mode === "orbit"}
      enableDamping
      dampingFactor={0.1}
      maxPolarAngle={mode === "orbit" ? Math.PI / 2 - 0.05 : 0.0001}
      minDistance={1}
      maxDistance={80}
      screenSpacePanning={mode === "top"}
    />
  );
}

/**
 * Rondlopen op ooghoogte: WASD/pijltjes om te lopen, slepen om rond te kijken.
 * Muren blokkeren, deuropeningen niet.
 */
function WalkControls({ plan }: { plan: FloorPlan }) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  // yaw wordt in het eerste frame overgenomen van de camera (die CameraRig dan al heeft geplaatst)
  const look = useRef({ yaw: 0, pitch: 0, down: false, x: 0, y: 0, init: false });

  useEffect(() => {
    camera.rotation.order = "YXZ";
    const el = gl.domElement;
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      keys.current[e.key.toLowerCase()] = e.type === "keydown";
    };
    const pd = (e: PointerEvent) => Object.assign(look.current, { down: true, x: e.clientX, y: e.clientY });
    const pm = (e: PointerEvent) => {
      const l = look.current;
      if (!l.down) return;
      l.yaw -= (e.clientX - l.x) * 0.004;
      l.pitch = Math.max(-1.2, Math.min(1.2, l.pitch - (e.clientY - l.y) * 0.004));
      l.x = e.clientX;
      l.y = e.clientY;
    };
    const pu = () => (look.current.down = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", kd);
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", kd);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const k = keys.current;
    const l = look.current;
    if (!l.init) {
      l.yaw = camera.rotation.y;
      l.init = true;
    }
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");
    const f = (k["w"] || k["arrowup"] ? 1 : 0) - (k["s"] || k["arrowdown"] ? 1 : 0);
    const s = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
    if (!f && !s) return;
    const speed = (k["shift"] ? 3 : 1.6) * Math.min(dt, 0.05);
    const fwd = { x: -Math.sin(l.yaw), y: -Math.cos(l.yaw) };
    const right = { x: Math.cos(l.yaw), y: -Math.sin(l.yaw) };
    const next = { x: camera.position.x + (fwd.x * f + right.x * s) * speed, y: camera.position.z + (fwd.y * f + right.y * s) * speed };
    if (!blockedByWall(plan, next)) {
      camera.position.x = next.x;
      camera.position.z = next.y;
    }
    camera.position.y = WALK_EYE;
  });
  return null;
}

/**
 * Startpunt voor rondlopen: in de grootste ruimte, op een vrije plek bij een
 * van de wanden, met de blik naar het midden van de ruimte.
 */
function walkStart(plan: FloorPlan, furniture: FurnitureItem[]): { x: number; y: number; yaw: number } | null {
  const rooms = [...plan.rooms].sort((a, b) => polygonBounds(b.polygon).width * polygonBounds(b.polygon).height - polygonBounds(a.polygon).width * polygonBounds(a.polygon).height);
  for (const r of rooms) {
    const b = polygonBounds(r.polygon);
    const c = polygonCentroid(r.polygon);
    const inset = Math.min(0.7, Math.min(b.width, b.height) / 3);
    const candidates = [
      { x: c.x, y: b.maxY - inset },
      { x: c.x, y: b.minY + inset },
      { x: b.minX + inset, y: c.y },
      { x: b.maxX - inset, y: c.y },
      { x: b.minX + inset, y: b.maxY - inset },
      { x: b.maxX - inset, y: b.minY + inset },
    ];
    for (const p of candidates) {
      if (!pointInPolygon(p, r.polygon)) continue;
      const blocked = furniture.some((f) => {
        const cat = getCatalogItem(f.catalogId);
        if (cat.layer !== "floor") return false;
        const s = f.size ?? cat.size;
        return Math.hypot(f.x - p.x, f.y - p.y) < Math.max(s.w, s.d) / 2 + 0.35;
      });
      if (blocked || blockedByWall(plan, p)) continue;
      // camera kijkt standaard naar -z (= -y op de plattegrond); yaw draait naar het midden
      const yaw = Math.atan2(-(c.x - p.x), -(c.y - p.y));
      return { ...p, yaw };
    }
  }
  return null;
}

function blockedByWall(plan: FloorPlan, p: Vec2) {
  const r = 0.2;
  for (const w of plan.walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.distance > w.thickness / 2 + r) continue;
    const along = pr.t * wallLength(w);
    const inDoor = plan.openings.some((o) => o.wallId === w.id && o.type === "door" && Math.abs(along - o.offset) < o.width / 2 - 0.05);
    if (!inDoor) return true;
  }
  return false;
}
