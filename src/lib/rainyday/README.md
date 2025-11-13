# RainyDay.js Integration for lisocal

This directory contains the TypeScript integration for rainyday.js, a lightweight rain effect library.

## Files Structure

```
src/lib/rainyday/
├── index.ts              # Main module with helper functions
├── rainyday.d.ts         # TypeScript declarations
└── RainEffect.svelte     # Image-based rain component
```

## Usage in Svelte Components

### Basic Usage (Images)

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

### HTML Element Rain Effect

Apply rain effects to any HTML element or the entire page:

```typescript
import { createHTMLRain, createFullPageRain } from '$lib/rainyday/html-rain';

// Rain on a specific element
const result = await createHTMLRain({
  element: document.querySelector('.my-content'),
  blur: 10,
  fps: 30,
  scale: 0.75, // Lower scale = better performance
  refreshInterval: 5000 // Auto-refresh every 5 seconds (optional)
});

result.rain.rain([[3, 2, 0.6]], 100);

// Clean up when done
result.destroy();

// Or rain on the entire page
const fullPageRain = await createFullPageRain({
  blur: 15,
  scale: 0.5
});

fullPageRain.rain.rain([[4, 2, 1]], 80);
```

### Using the HTMLRainEffect Component

```svelte
<script>
  import HTMLRainEffect from '$lib/rainyday/HTMLRainEffect.svelte';
  
  let contentElement;
  let rainComponent;
</script>

<!-- Rain on a specific element -->
<div bind:this={contentElement}>
  <h1>Your content here</h1>
  <p>This will have rain effects!</p>
</div>

<HTMLRainEffect 
  bind:this={rainComponent}
  targetElement={contentElement}
  blur={10}
  fps={30}
  scale={0.75}
  refreshInterval={5000}
/>

<!-- Or full-page rain -->
<HTMLRainEffect 
  fullPage={true}
  blur={15}
  scale={0.5}
/>

<!-- Control the rain -->
<button on:click={() => rainComponent.startRain()}>Start Rain</button>
<button on:click={() => rainComponent.stopRain()}>Stop Rain</button>
```

### Using the RainEffect Component (Images)

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

### RainyDayOptions (for images)
See the full `RainyDayOptions` interface in `rainyday.d.ts` for all available options.

### HTMLRainOptions (for HTML elements)
- `element`: The HTML element to apply rain effect to (required unless using fullPage)
- `opacity`: Canvas opacity (default: 1)
- `blur`: Blur amount for background (default: 10)
- `fps`: Frames per second (default: 30)
- `fillStyle`: Fill style for drops (default: "#8ED6FF")
- `enableCollisions`: Enable collision detection (default: true)
- `refreshInterval`: Auto-refresh interval in ms, 0 = no auto-refresh (default: 0)
- `scale`: Scale factor for performance, lower = better performance (default: 1)

## How HTML Rain Works

The RainyDay library was originally designed for images only. To make it work with HTML elements:

1. **DOM to Canvas**: We capture the HTML element by converting it to an SVG foreignObject, then rendering that to a canvas
2. **Canvas to Image**: The canvas is converted to an image that RainyDay can use
3. **Reflection Magic**: RainyDay creates tiny inverted reflections within each water droplet using the captured image
4. **Optional Refresh**: For dynamic content, you can set a `refreshInterval` to periodically re-capture the element

### Performance Considerations

- **Scale factor**: Lower values (0.5-0.75) significantly improve performance
- **Full page effects**: Use lower scale for full-page rain (0.5 recommended)
- **Refresh interval**: Only enable if content changes; adds overhead
- **Element complexity**: Simpler DOM structures perform better

### Limitations

- **External images**: Images must be CORS-enabled or same-origin
- **CSS animations**: May not capture ongoing animations perfectly
- **Dynamic content**: Requires manual refresh or setting `refreshInterval`
- **Browser support**: Requires modern browser with canvas and SVG support

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