declare interface RainyDayOptions {
  /** Required: The image element to apply rain effect to */
  image: HTMLImageElement;
  /** Canvas opacity (default: 1) */
  opacity?: number;
  /** Blur amount for background (default: 10) */
  blur?: number;
  /** Crop area [x, y, width, height] (default: full image) */
  crop?: [number, number, number, number];
  /** Enable size change handling (default: true) */
  enableSizeChange?: boolean;
  /** Parent element to attach canvas (default: document.body) */
  parentElement?: HTMLElement;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Fill style for drops (default: "#8ED6FF") */
  fillStyle?: string;
  /** Enable collision detection (default: true) */
  enableCollisions?: boolean;
  /** Gravity threshold for drops (default: 3) */
  gravityThreshold?: number;
  /** Gravity angle (default: Math.PI/2) */
  gravityAngle?: number;
  /** Gravity angle variance (default: 0) */
  gravityAngleVariance?: number;
}

declare interface Drop {
  x: number;
  y: number;
  r: number;
  momentum?: number;
  spreadX?: number;
  spreadY?: number;
}

declare type RainPreset = [
  /** Minimum radius */
  number,
  /** Radius variance */
  number, 
  /** Rate (probability if <= 1, count if > 1) */
  number,
  /** Optional delay frames */
  number?
];

declare type ReflectionStrategy = () => void | ((drop: Drop) => void);
declare type TrailStrategy = (drop: Drop) => void;
declare type GravityStrategy = (drop: Drop) => void;
declare type CollisionStrategy = (drop: Drop, neighbors: Drop[]) => void;

declare class RainyDay {
  constructor(options: RainyDayOptions, canvas?: HTMLCanvasElement);
  
  /** Start the rain effect */
  rain(presets: RainPreset[], spawnIntervalMs: number): void;
  
  /** Options used to create this instance */
  options: RainyDayOptions;
  
  /** Main visible canvas */
  canvas: HTMLCanvasElement;
  
  /** Glass layer for drop rendering */
  glass: HTMLCanvasElement;
  
  /** Background canvas (blurred) */
  background: HTMLCanvasElement;
  
  /** Clear background canvas (unblurred) */
  clearbackground: HTMLCanvasElement;
  
  /** Reflected/scaled image for reflections */
  reflected: HTMLCanvasElement;
  
  /** Array of active drops */
  drops: Drop[];
  
  // Strategy assignments
  reflection: ReflectionStrategy;
  trail: TrailStrategy;
  gravity: GravityStrategy;
  collision: CollisionStrategy;
  
  // Strategy constants - Reflection
  readonly REFLECTION_NONE: ReflectionStrategy;
  readonly REFLECTION_MINIATURE: ReflectionStrategy;
  
  // Strategy constants - Trail
  readonly TRAIL_NONE: TrailStrategy;
  readonly TRAIL_DROPS: TrailStrategy;
  readonly TRAIL_SMUDGE: TrailStrategy;
  
  // Strategy constants - Gravity
  readonly GRAVITY_NONE: GravityStrategy;
  readonly GRAVITY_LINEAR: GravityStrategy;
  readonly GRAVITY_NON_LINEAR: GravityStrategy;
  
  // Strategy constants - Collision
  readonly COLLISION_SIMPLE: CollisionStrategy;
}

declare global {
  interface Window {
    RainyDay: typeof RainyDay;
  }
}

export default RainyDay;
export { RainyDay, type RainyDayOptions, type Drop, type RainPreset };