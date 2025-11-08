# RainyDay.js Integration for lisocal

This directory contains the TypeScript integration for rainyday.js, a lightweight rain effect library.

## Files Structure

```
src/lib/rainyday/
├── index.ts          # Main module with helper functions
├── rainyday.d.ts     # TypeScript declarations
└── RainEffect.svelte # Example Svelte component
```

## Usage in Svelte Components

### Basic Usage

```typescript
import { createRainyDay, type RainyDayOptions } from '$lib/rainyday';

// In your component
const options: RainyDayOptions = {
  image: imageElement,
  blur: 10,
  fps: 30
};

const rain = await createRainyDay(options);
rain.rain([[3, 2, 0.6]], 100); // Start gentle rain
```

### Using the RainEffect Component

```svelte
<script>
  import RainEffect from '$lib/rainyday/RainEffect.svelte';
</script>

<RainEffect 
  imageSrc="/path/to/image.jpg"
  blur={10}
  fps={30}
/>
```

## Configuration Options

See the full `RainyDayOptions` interface in `rainyday.d.ts` for all available options.

## Static Files

Make sure `rainyday.min.js` is in your `static/` folder so it can be loaded at `/rainyday.min.js`.

## Rain Presets

Rain presets are arrays of `[minRadius, radiusVariance, rate, delayFrames?]`:
- `rate > 1`: spawn that many drops each cycle  
- `0 < rate <= 1`: spawn 1 drop with that probability
- `delayFrames`: frames to wait before activating (optional)

Example presets:
```typescript
// Gentle drizzle
[[2, 1, 0.25]]

// Heavy storm  
[[4, 2, 1], [7, 3, 3]]

// Mixed rain with delayed large drops
[[3, 2, 0.6], [6, 3, 0.3, 40]]
```