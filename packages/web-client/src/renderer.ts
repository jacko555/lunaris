import { Application, Container, Graphics } from "pixi.js";
import {
  BUILDING_COMPONENT,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  SITE_COMPONENT,
  THERMAL_COMPONENT,
  tileAt,
  type BuildingComponent,
  type ContentPack,
  type EnvironmentComponent,
  type LunarMap,
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
};

function tileColor(map: LunarMap, x: number, y: number): number {
  const tile = tileAt(map, x, y);
  // Elevation drives base brightness; class drives hue.
  const relief = Math.max(0, Math.min(1, (tile.elevationM + 4000) / 4800));
  if (tile.illumClass === "C") {
    // PSR: near-black with a cyan cast where ice is rich.
    const ice = Math.min(1, tile.iceFrac / 0.085);
    const r = 6 + relief * 10;
    const g = 8 + relief * 12 + ice * 14;
    const b = 14 + relief * 14 + ice * 26;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  const base = 52 + relief * 110;
  if (tile.illumClass === "A") {
    // Eternal-light ridge: warm and bright.
    return (Math.round(base + 60) << 16) | (Math.round(base + 42) << 8) | Math.round(base);
  }
  const slopeDarken = tile.slopeDeg > 10 ? 14 : 0;
  const v = Math.round(base - slopeDarken);
  return (v << 16) | (v << 8) | (v + 8);
}

export class MapRenderer {
  readonly app: Application;
  private readonly map: LunarMap;
  private readonly pack: ContentPack;
  private buildingLayer = new Graphics();
  private nightTint = new Graphics();
  private ready = false;

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
      antialias: false,
    });
    parent.appendChild(this.app.canvas);

    const tileLayer = new Graphics();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        tileLayer.rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX).fill(tileColor(this.map, x, y));
      }
    }
    const root = new Container();
    root.addChild(tileLayer);
    root.addChild(this.buildingLayer);
    root.addChild(this.nightTint);
    this.app.stage.addChild(root);
    this.ready = true;
  }

  draw(world: World): void {
    if (!this.ready) {
      return;
    }
    const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
    const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
    const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);

    this.buildingLayer.clear();
    for (const [entity, building] of buildings.entries()) {
      const def = this.pack.building(building.defId);
      const [w, h] = def.footprint;
      const px = building.x * TILE_PX;
      const py = building.y * TILE_PX;
      const color = BUILDING_COLORS[building.defId] ?? 0xffffff;
      this.buildingLayer
        .rect(px + 1, py + 1, w * TILE_PX - 2, h * TILE_PX - 2)
        .fill({ color, alpha: 0.55 + 0.45 * building.condition });
      const thermal = thermals.get(entity);
      const outline =
        thermal?.state === "freeze" ? 0x3b82f6 : thermal?.state === "overheat" ? 0xeb5757 : null;
      if (outline !== null) {
        this.buildingLayer
          .rect(px + 1, py + 1, w * TILE_PX - 2, h * TILE_PX - 2)
          .stroke({ color: outline, width: 2 });
      }
      if (building.poweredFraction < 1 && def.powerKw < 0) {
        this.buildingLayer
          .rect(px + 3, py + 3, w * TILE_PX - 6, h * TILE_PX - 6)
          .stroke({ color: 0xf2c94c, width: 1 });
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
  }
}
