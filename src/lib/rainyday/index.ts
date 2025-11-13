import type { RainyDayOptions, Drop, RainPreset } from './rainyday.d.ts';

// Import the RainyDay class type
declare class RainyDay {
  constructor(options: RainyDayOptions, canvas?: HTMLCanvasElement);
  rain(presets: RainPreset[], spawnIntervalMs: number): void;
  [key: string]: any;
}

/**
 * Dynamically loads the rainyday.js library and returns the RainyDay class
 * This ensures the script is only loaded when needed
 */
export async function loadRainyDay(): Promise<typeof RainyDay> {
  // Check if already loaded
  if (typeof window !== 'undefined' && (window as any).RainyDay) {
    return (window as any).RainyDay;
  }
  
  // Dynamically load the script
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/rainyday.min.js';
    script.onload = () => {
      if ((window as any).RainyDay) {
        resolve((window as any).RainyDay);
      } else {
        reject(new Error('RainyDay failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load rainyday.min.js'));
    document.head.appendChild(script);
  });
}

/**
 * Create a new RainyDay instance with type safety
 */
export async function createRainyDay(
  options: RainyDayOptions, 
  canvas?: HTMLCanvasElement
): Promise<RainyDay> {
  // Validate options before creating instance
  if (!options.image) {
    throw new Error('RainyDay: image option is required');
  }
  
  if (!options.image.naturalWidth || !options.image.naturalHeight) {
    throw new Error('RainyDay: image must be loaded and have valid dimensions');
  }
  
  // Validate dimensions are reasonable
  const maxDimension = 2048; // Reasonable limit
  if (options.image.naturalWidth > maxDimension || options.image.naturalHeight > maxDimension) {
    console.warn('Large image detected, this may cause performance issues');
  }
  
  console.log('Creating RainyDay with options:', {
    imageSize: `${options.image.naturalWidth}x${options.image.naturalHeight}`,
    blur: options.blur,
    fps: options.fps,
    parentElement: options.parentElement?.tagName
  });
  
  const RainyDayClass = await loadRainyDay();
  
  try {
    return new RainyDayClass(options, canvas);
  } catch (error) {
    console.error('RainyDay constructor failed:', error);
    throw new Error(`Failed to create RainyDay instance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Re-export types for convenience
export type { RainyDayOptions, Drop, RainPreset };
