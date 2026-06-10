import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  BUILDING_COMPONENT,
  DUST_COMPONENT,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  SITE_COMPONENT,
  THERMAL_COMPONENT,
  tileAt,
  type BuildingComponent,
  type ContentPack,
  type DustComponent,
  type EnvironmentComponent,
  type LunarMap,
  type PendingHazardComponent,
  type SiteComponent,
  type ThermalComponent,
  type World,
} from "@lunaris/sim-core";

export const TILE_PX = 10;

const BUILDING_COLORS: Record<string, number> = {
  "foundation-habitat": 0x2dd4bf,
  "solar-array-10kw": 0xfacc15,
  "battery-bank": 0x6fcf97,
  "regen-fuel-cell": 0xa3e635,
  "fission-surface-power": 0xc084fc,
  "rtg-keepalive": 0xfb923c,
  "radiator-wing": 0xe2e8f0,
  "storm-shelter": 0x94a3b8,
  "eclss-core": 0x38bdf8,
  "water-gas-storage": 0x0ea5e9,
  "comms-tower": 0xf472b6,
  "exercise-module": 0xfca5a5,
  clinic: 0xef4444,
  "sabatier-unit": 0x84cc16,
  "field-lab": 0xffffff,
  "ice-harvester": 0x67e8f9,
  "volatile-oven": 0xf97316,
  electrolyzer: 0x60a5fa,
  "cryo-plant": 0xa5f3fc,
  "mre-plant-s": 0x9333ea,
  "mre-plant-l": 0x7e22ce,
  "regolith-printer": 0xb45309,
  "regolith-berm": 0x78716c,
  "landing-pad": 0x44403c,
  "propellant-depot-pad": 0x22c55e,
  "greenhouse-module": 0x4ade80,
  "agri-dome": 0x16a34a,
  "medical-center": 0xdc2626,
  refinery: 0xd97706,
  workshop: 0x92400e,
  "fab-plant": 0x6366f1,
  "water-reclamation-plant": 0x0284c7,
  "printed-habitat-block": 0xc2a37a,
  "mass-driver-segment": 0x818cf8,
  "volatile-combine": 0xf59e0b,
  "solar-farm-field": 0xfde047,
  "beamed-power-pilot": 0xfbbf24,
  "crater-dome-segment": 0x7dd3fc,
  "civic-center": 0xf9a8d4,
};

/** Deterministic per-tile hash for the ART-DIRECTION regolith noise. */
function tileNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 13) - 6; // −6..+6 brightness jitter
}

function tileColor(map: LunarMap, x: number, y: number): number {
  const tile = tileAt(map, x, y);
  // Elevation drives base brightness; class drives hue; noise breaks the grid.
  const relief = Math.max(0, Math.min(1, (tile.elevationM + 4000) / 4800));
  const noise = tileNoise(x, y);
  if (tile.illumClass === "C") {
    // PSR: near-black with a blue-ice speckle where ice is rich.
    const ice = Math.min(1, tile.iceFrac / 0.085);
    const speckle = ice > 0 && tileNoise(y, x) > 3 ? 22 : 0;
    const r = 6 + relief * 10 + noise * 0.5;
    const g = 8 + relief * 12 + ice * 14 + speckle * 0.6;
    const b = 14 + relief * 14 + ice * 26 + speckle;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(Math.min(255, b));
  }
  const base = 52 + relief * 110 + noise;
  if (tile.illumClass === "A") {
    // Eternal-light ridge: warm and bright (the gold wash).
    return (Math.round(base + 60) << 16) | (Math.round(base + 42) << 8) | Math.round(base);
  }
  const slopeDarken = tile.slopeDeg > 10 ? 14 : 0;
  const v = Math.round(base - slopeDarken);
  return (v << 16) | (v << 8) | (v + 8);
}

type Glyph =
  | "dome"
  | "solar"
  | "storage"
  | "radiator"
  | "reactor"
  | "dish"
  | "cross"
  | "miner"
  | "farm"
  | "lab"
  | "pad"
  | "mound"
  | "rail"
  | "box";

function classify(def: ReturnType<ContentPack["building"]>): Glyph {
  if ((def.services.housing ?? 0) > 0 || (def.services.shelter ?? 0) > 0) {
    return "dome";
  }
  if (def.powerScalesWithIllumination) {
    return "solar";
  }
  if (def.storageKwh !== undefined && def.storageKwh > 0) {
    return "storage";
  }
  if (def.radiatorShared) {
    return "radiator";
  }
  if (def.powerKw >= 20) {
    return "reactor";
  }
  if (def.commsRelay) {
    return "dish";
  }
  if ((def.services.medical ?? 0) > 0) {
    return "cross";
  }
  if (def.mining !== undefined) {
    return "miner";
  }
  if (def.farm !== undefined) {
    return "farm";
  }
  if (def.sciencePerDay > 0) {
    return "lab";
  }
  if (def.landingPad || def.propellantDepot) {
    return "pad";
  }
  if (def.shieldingAura) {
    return "mound";
  }
  if (def.massDriver) {
    return "rail";
  }
  return "box";
}

/** Flat vector silhouette + 1px rim light (ART-DIRECTION building spec). */
function drawGlyph(
  g: Graphics,
  glyph: Glyph,
  px: number,
  py: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): void {
  const cx = px + w / 2;
  const cy = py + h / 2;
  switch (glyph) {
    case "dome":
      g.rect(px + 1, py + h * 0.55, w - 2, h * 0.45 - 1).fill({ color, alpha: alpha * 0.7 });
      g.circle(cx, py + h * 0.58, w * 0.34).fill({ color, alpha });
      break;
    case "solar":
      g.rect(px + 1, py + 1, w - 2, h - 2).fill({ color: 0x10141f, alpha });
      for (let i = 0; i < 3; i++) {
        g.rect(px + 2, py + 2 + (i * (h - 4)) / 3, w - 4, (h - 4) / 3 - 1).fill({ color, alpha });
      }
      break;
    case "storage":
      g.circle(cx, cy, Math.min(w, h) * 0.36).fill({ color, alpha });
      g.circle(cx, cy, Math.min(w, h) * 0.18).fill({ color: 0x10141f, alpha });
      break;
    case "radiator":
      for (let i = 0; i < 4; i++) {
        g.rect(px + 1 + (i * (w - 2)) / 4, py + 2, (w - 2) / 4 - 1, h - 4).fill({ color, alpha });
      }
      break;
    case "reactor":
      g.rect(px + 1, py + 1, w - 2, h - 2).fill({ color, alpha: alpha * 0.35 });
      g.circle(cx, cy, Math.min(w, h) * 0.3).fill({ color, alpha });
      g.circle(cx, cy, Math.min(w, h) * 0.12).fill({ color: 0x10141f, alpha });
      break;
    case "dish":
      g.moveTo(cx, py + 2)
        .lineTo(px + 2, py + h - 2)
        .lineTo(px + w - 2, py + h - 2)
        .fill({
          color,
          alpha,
        });
      g.circle(cx, py + h * 0.35, w * 0.18).fill({ color: 0xffffff, alpha: alpha * 0.8 });
      break;
    case "cross":
      g.rect(cx - w * 0.12, py + 2, w * 0.24, h - 4).fill({ color, alpha });
      g.rect(px + 2, cy - h * 0.12, w - 4, h * 0.24).fill({ color, alpha });
      break;
    case "miner":
      g.rect(px + 1, py + h * 0.4, w - 2, h * 0.6 - 1).fill({ color, alpha });
      for (let i = 0; i < 3; i++) {
        g.moveTo(px + 2 + (i * (w - 4)) / 3, py + h * 0.4)
          .lineTo(px + 2 + ((i + 0.5) * (w - 4)) / 3, py + 2)
          .lineTo(px + 2 + ((i + 1) * (w - 4)) / 3, py + h * 0.4)
          .fill({ color, alpha });
      }
      break;
    case "farm":
      g.rect(px + 1, py + 1, w - 2, h - 2).fill({ color: 0x14331f, alpha });
      for (let i = 0; i < 3; i++) {
        g.rect(px + 3, py + 3 + (i * (h - 6)) / 3, w - 6, 2).fill({ color, alpha });
      }
      break;
    case "lab":
      g.moveTo(cx, py + 2)
        .lineTo(px + 2, py + h - 2)
        .lineTo(px + w - 2, py + h - 2)
        .fill({
          color,
          alpha,
        });
      break;
    case "pad":
      g.rect(px + 1, py + 1, w - 2, h - 2).fill({ color, alpha: alpha * 0.8 });
      g.circle(cx, cy, Math.min(w, h) * 0.3).stroke({ color: 0xe2e8f0, width: 1, alpha });
      break;
    case "mound":
      g.moveTo(px + 1, py + h - 1)
        .lineTo(cx, py + h * 0.3)
        .lineTo(px + w - 1, py + h - 1)
        .fill({ color, alpha });
      break;
    case "rail":
      g.rect(px + w * 0.3, py + 1, w * 0.4, h - 2).fill({ color, alpha });
      for (let i = 0; i < 3; i++) {
        g.rect(px + 2, py + 2 + (i * (h - 4)) / 3, w - 4, 2).fill({ color, alpha: alpha * 0.7 });
      }
      break;
    default:
      g.rect(px + 1, py + 1, w - 2, h - 2).fill({ color, alpha });
  }
  // 1px rim light, top-left.
  g.moveTo(px + 1, py + h - 1)
    .lineTo(px + 1, py + 1)
    .lineTo(px + w - 1, py + 1)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });
}

// ── Mission Ops sprite pipeline (ASSET-PLAN §1): assets are optional — the
// glob is empty until Codex output lands, and every defId without a sprite
// falls back to its vector glyph so the game always runs asset-less.
const SPRITE_URLS = import.meta.glob("../../../assets/gen/buildings/iso/*__base@1x.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const TERRAIN_URLS = import.meta.glob("../../../assets/gen/terrain/baseplate__*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function spriteUrl(defId: string): string | null {
  for (const [path, url] of Object.entries(SPRITE_URLS)) {
    if (path.endsWith(`/${defId}__base@1x.png`)) {
      return url;
    }
  }
  return null;
}

export class MapRenderer {
  readonly app: Application;
  private readonly map: LunarMap;
  private readonly pack: ContentPack;
  private world = new Container();
  private networkLayer = new Graphics();
  private buildingLayer = new Graphics();
  private spriteLayer = new Container();
  private nightTint = new Graphics();
  private ready = false;
  /** defId → loaded texture, or null when missing / not yet loaded. */
  private textures = new Map<string, Texture | null>();
  private spritePool = new Map<number, Sprite>();
  /** True while (or just after) the pointer dragged the camera. */
  wasDrag = false;

  constructor(map: LunarMap, pack: ContentPack) {
    this.map = map;
    this.pack = pack;
    this.app = new Application();
  }

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      width: this.map.width * TILE_PX,
      height: this.map.height * TILE_PX,
      background: 0x05070b,
      antialias: true,
    });
    parent.appendChild(this.app.canvas);

    // Terrain: pre-rendered plate when generated, vector tiles otherwise.
    const dayPlate = Object.entries(TERRAIN_URLS).find(([p]) =>
      p.endsWith("baseplate__day.png"),
    )?.[1];
    if (dayPlate !== undefined) {
      const tex = await Assets.load<Texture>(dayPlate);
      const plate = new Sprite(tex);
      plate.width = this.map.width * TILE_PX;
      plate.height = this.map.height * TILE_PX;
      this.world.addChild(plate);
    } else {
      const tileLayer = new Graphics();
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          tileLayer
            .rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX)
            .fill(tileColor(this.map, x, y));
        }
      }
      this.world.addChild(tileLayer);
    }
    this.world.addChild(this.networkLayer);
    this.world.addChild(this.spriteLayer);
    this.world.addChild(this.buildingLayer); // glyphs + badges overlay sprites
    this.world.addChild(this.nightTint);
    this.app.stage.addChild(this.world);
    this.installCamera();
    this.ready = true;
  }

  /** Wheel zoom (cursor-centered) + drag pan; sets wasDrag for click logic. */
  private installCamera(): void {
    const canvas = this.app.canvas;
    const minZoom = 1;
    const maxZoom = 6;
    const clampPan = (): void => {
      const w = this.map.width * TILE_PX;
      const s = this.world.scale.x;
      this.world.x = Math.min(0, Math.max(this.app.renderer.width - w * s, this.world.x));
      this.world.y = Math.min(0, Math.max(this.app.renderer.height - w * s, this.world.y));
    };
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = ((event.clientX - rect.left) / rect.width) * this.app.renderer.width;
        const cy = ((event.clientY - rect.top) / rect.height) * this.app.renderer.height;
        const old = this.world.scale.x;
        const next = Math.min(maxZoom, Math.max(minZoom, old * (event.deltaY < 0 ? 1.18 : 0.85)));
        // Keep the world point under the cursor stationary.
        this.world.x = cx - ((cx - this.world.x) / old) * next;
        this.world.y = cy - ((cy - this.world.y) / old) * next;
        this.world.scale.set(next);
        clampPan();
      },
      { passive: false },
    );
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      this.wasDrag = false;
    });
    window.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const sx = this.app.renderer.width / rect.width;
      this.world.x += (event.clientX - lastX) * sx;
      this.world.y += (event.clientY - lastY) * sx;
      moved += Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      if (moved > 6) {
        this.wasDrag = true;
      }
      clampPan();
    });
    window.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  /** Map a DOM click to a tile under the current camera transform. */
  tileAtClient(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const gx = ((clientX - rect.left) / rect.width) * this.app.renderer.width;
    const gy = ((clientY - rect.top) / rect.height) * this.app.renderer.height;
    const wx = (gx - this.world.x) / this.world.scale.x;
    const wy = (gy - this.world.y) / this.world.scale.y;
    return { x: Math.floor(wx / TILE_PX), y: Math.floor(wy / TILE_PX) };
  }

  /** Resolve (and lazily load) the sprite texture for a building def. */
  private textureFor(defId: string): Texture | null {
    if (this.textures.has(defId)) {
      return this.textures.get(defId) as Texture | null;
    }
    const url = spriteUrl(defId);
    this.textures.set(defId, null);
    if (url !== null) {
      void Assets.load<Texture>(url).then((tex) => {
        this.textures.set(defId, tex);
      });
    }
    return null;
  }

  draw(world: World): void {
    if (!this.ready) {
      return;
    }
    const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
    const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
    const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);
    const dusts = world.store<DustComponent>(DUST_COMPONENT);

    this.buildingLayer.clear();
    // Sun azimuth from the synodic phase: the long shadow IS the day/night
    // tell (ART-DIRECTION map spec).
    const sunAngle = env.lunarPhase * Math.PI * 2;
    const shadowDx = Math.cos(sunAngle + Math.PI) * 0.5;
    const shadowDy = Math.sin(sunAngle + Math.PI) * 0.5 + 0.3;
    for (const [, building] of buildings.entries()) {
      if (env.litB === 1) {
        const def = this.pack.building(building.defId);
        const [w, h] = def.footprint;
        this.buildingLayer
          .rect(
            building.x * TILE_PX + shadowDx * TILE_PX,
            building.y * TILE_PX + shadowDy * TILE_PX,
            w * TILE_PX - 2,
            h * TILE_PX - 2,
          )
          .fill({ color: 0x000000, alpha: 0.22 });
      }
    }
    // ── connection network (Mission Ops): a minimum-spanning tree over
    // building centers drawn as layered strokes — reads as roads/cable
    // trays without needing path sprites for arbitrary layouts. ──
    this.networkLayer.clear();
    const centers: { x: number; y: number }[] = [];
    for (const [, building] of buildings.entries()) {
      const [w, h] = this.pack.building(building.defId).footprint;
      centers.push({
        x: (building.x + w / 2) * TILE_PX,
        y: (building.y + h / 2) * TILE_PX,
      });
    }
    if (centers.length > 1) {
      const inTree = new Set<number>([0]);
      const lineColor = env.litB === 1 ? 0x8a93a6 : 0xf2a65a;
      while (inTree.size < centers.length) {
        let best: [number, number, number] = [-1, -1, Infinity];
        for (const a of inTree) {
          for (let b = 0; b < centers.length; b++) {
            if (inTree.has(b)) {
              continue;
            }
            const pa = centers[a] as { x: number; y: number };
            const pb = centers[b] as { x: number; y: number };
            const d = (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2;
            if (d < best[2]) {
              best = [a, b, d];
            }
          }
        }
        const pa = centers[best[0]] as { x: number; y: number };
        const pb = centers[best[1]] as { x: number; y: number };
        this.networkLayer
          .moveTo(pa.x, pa.y)
          .lineTo(pb.x, pb.y)
          .stroke({ color: 0x10141c, width: 3.5, alpha: 0.65 });
        this.networkLayer
          .moveTo(pa.x, pa.y)
          .lineTo(pb.x, pb.y)
          .stroke({ color: lineColor, width: 1.2, alpha: env.litB === 1 ? 0.5 : 0.9 });
        inTree.add(best[1]);
      }
    }

    const liveEntities = new Set<number>();
    for (const [entity, building] of buildings.entries()) {
      const def = this.pack.building(building.defId);
      const [w, h] = def.footprint;
      const px = building.x * TILE_PX;
      const py = building.y * TILE_PX;
      const wpx = w * TILE_PX;
      const hpx = h * TILE_PX;
      const color = BUILDING_COLORS[building.defId] ?? 0xffffff;
      const texture = this.textureFor(building.defId);
      if (texture !== null) {
        // Sprite path: bottom-anchored on the footprint, free to overflow
        // upward (3/4-view art is taller than its ground plan).
        liveEntities.add(entity);
        let sprite = this.spritePool.get(entity);
        if (sprite === undefined || sprite.texture !== texture) {
          sprite?.destroy();
          sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 1);
          this.spritePool.set(entity, sprite);
          this.spriteLayer.addChild(sprite);
        }
        sprite.width = wpx * 1.15;
        sprite.height = (texture.height / texture.width) * wpx * 1.15;
        sprite.position.set(px + wpx / 2, py + hpx);
        sprite.alpha = 0.6 + 0.4 * building.condition;
      } else {
        drawGlyph(
          this.buildingLayer,
          classify(def),
          px,
          py,
          wpx,
          hpx,
          color,
          0.55 + 0.45 * building.condition,
        );
      }
      const thermal = thermals.get(entity);
      const outline =
        thermal?.state === "freeze" ? 0x3b82f6 : thermal?.state === "overheat" ? 0xeb5757 : null;
      if (outline !== null) {
        this.buildingLayer
          .rect(px + 1, py + 1, wpx - 2, hpx - 2)
          .stroke({ color: outline, width: 2 });
      }
      // Corner state badges (shape + color, colorblind-safe): ◤ amber =
      // underpowered, ◣ grey = worn, ▪ tan = dusty.
      if (building.poweredFraction < 1 && def.powerKw < 0) {
        this.buildingLayer
          .moveTo(px + wpx - 1, py + 1)
          .lineTo(px + wpx - 5, py + 1)
          .lineTo(px + wpx - 1, py + 5)
          .fill(0xf2c94c);
      }
      if (building.condition < 0.7) {
        this.buildingLayer
          .moveTo(px + 1, py + hpx - 1)
          .lineTo(px + 5, py + hpx - 1)
          .lineTo(px + 1, py + hpx - 5)
          .fill(0x9ca3af);
      }
      const dust = dusts.get(entity);
      if (dust !== undefined && dust.frac > 0.15) {
        this.buildingLayer.rect(px + 1, py + 1, 4, 4).fill(0xd2b48c);
      }
    }

    // Reclaim sprites whose buildings are gone (or lost their texture).
    for (const [entity, sprite] of this.spritePool) {
      if (!liveEntities.has(entity)) {
        sprite.destroy();
        this.spritePool.delete(entity);
      }
    }

    // Construction sites: dashed-feel outline filling up with progress.
    const sites = world.store<SiteComponent>(SITE_COMPONENT);
    for (const [, site] of sites.entries()) {
      const def = this.pack.building(site.defId);
      const [w, h] = def.footprint;
      const px = site.x * TILE_PX;
      const py = site.y * TILE_PX;
      const progress = Math.min(1, site.progressHours / site.totalHours);
      this.buildingLayer
        .rect(px + 1, py + 1, w * TILE_PX - 2, h * TILE_PX - 2)
        .stroke({ color: 0x6c9ef8, width: 1 });
      if (progress > 0) {
        this.buildingLayer
          .rect(
            px + 2,
            py + 2 + (h * TILE_PX - 4) * (1 - progress),
            w * TILE_PX - 4,
            (h * TILE_PX - 4) * progress,
          )
          .fill({ color: 0x6c9ef8, alpha: 0.4 });
      }
    }

    // Day/night tint follows class-B illumination; the eternal-light ridge
    // (class A) keeps a faint glow during its lit night hours.
    this.nightTint.clear();
    if (env.litB === 0) {
      this.nightTint
        .rect(0, 0, this.map.width * TILE_PX, this.map.height * TILE_PX)
        .fill({ color: 0x020308, alpha: 0.55 });
      if (env.litA === 1) {
        for (let y = 0; y < this.map.height; y++) {
          for (let x = 0; x < this.map.width; x++) {
            if (tileAt(this.map, x, y).illumClass === "A") {
              this.nightTint
                .rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX)
                .fill({ color: 0xffe9b0, alpha: 0.18 });
            }
          }
        }
      }
    }

    // SPE vignette: subtle magenta frame while a storm is inbound
    // (ART-DIRECTION map & motion spec).
    let speInbound = false;
    for (const [, pending] of world
      .store<PendingHazardComponent>(PENDING_HAZARD_COMPONENT)
      .entries()) {
      if (pending.eventId.startsWith("spe")) {
        speInbound = true;
      }
    }
    if (speInbound) {
      const W = this.map.width * TILE_PX;
      const H = this.map.height * TILE_PX;
      const t = 6;
      this.nightTint.rect(0, 0, W, t).fill({ color: 0xd946ef, alpha: 0.35 });
      this.nightTint.rect(0, H - t, W, t).fill({ color: 0xd946ef, alpha: 0.35 });
      this.nightTint.rect(0, 0, t, H).fill({ color: 0xd946ef, alpha: 0.35 });
      this.nightTint.rect(W - t, 0, t, H).fill({ color: 0xd946ef, alpha: 0.35 });
    }
  }
}
