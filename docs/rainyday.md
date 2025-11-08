# rainyday.js — Unofficial Guide (v0.1.2)

A lightweight raindrop effect over an image using `<canvas>` (2014, Marek Brodziak). This document summarizes the runtime API and practical usage inferred from the minified source.

---

## What it does

* Renders your image to an offscreen canvas (with optional blur)
* Simulates falling drops with optional reflections
* Supports gravity, trails, and collisions
* Composites drops over the blurred background

---

## Quick start

```html
<img id="photo" src="photo.jpg" style="display:none" />
<script src="rainyday.min.js"></script>
<script>
  const img = document.getElementById('photo');
  img.addEventListener('load', () => {
    const rd = new RainyDay({ image: img, blur: 8, fps: 30 });
    rd.reflection = rd.REFLECTION_MINIATURE;
    rd.trail = rd.TRAIL_DROPS;
    rd.gravity = rd.GRAVITY_NON_LINEAR;
    rd.collision = rd.COLLISION_SIMPLE;
    rd.rain([[3,2,0.6],[6,3,2,40]], 80);
  });
</script>
```

---

## Constructor

```js
const rd = new RainyDay(options[, canvas]);
```

### Options (defaults)

* `image` (required)
* `opacity: 1`
* `blur: 10`
* `crop: [0,0,image.naturalWidth,image.naturalHeight]`
* `enableSizeChange: true`
* `parentElement: document.body`
* `fps: 30`
* `fillStyle: "#8ED6FF"`
* `enableCollisions: true`
* `gravityThreshold: 3`
* `gravityAngle: Math.PI/2`
* `gravityAngleVariance: 0`
* reflection scaling + mapping sizes
* canvas dimensions from the image

---

## Starting the rain

```js
rd.rain(presets, spawnIntervalMs);
```

### Preset format

```
[minRadius, radiusVariance, rate, delayFrames?]
```

* `rate > 1`: spawn that many drops each cycle
* `0 < rate <= 1`: spawn 1 drop with that probability
* `delayFrames`: frames to wait before activating

---

## Behavior strategies

Assignable function properties:

### Reflection

* `REFLECTION_NONE()`
* `REFLECTION_MINIATURE(drop)`

### Trail

* `TRAIL_NONE(drop)`
* `TRAIL_DROPS(drop)`
* `TRAIL_SMUDGE(drop)`

### Gravity

* `GRAVITY_NONE(drop)`
* `GRAVITY_LINEAR(drop)`
* `GRAVITY_NON_LINEAR(drop)`

### Collision

* `COLLISION_SIMPLE(drop, neighbors)`

---

## Important instance properties

* `canvas` — visible layer
* `glass` — drop rendering layer
* `background` / `clearbackground` — blurred/unblurred image buffers
* `reflected` — scaled-down image for reflections
* `drops` — active drops

---

## Rendering pipeline

1. Draw blurred background
2. Spawn drops
3. Animate each drop (gravity, collision, trail)
4. Composite the drop layer

---

## Recipes

### Flat-color drops

```js
rd.reflection = rd.REFLECTION_NONE;
rd.options.fillStyle = 'rgba(255,255,255,0.6)';
```

### Gentle drizzle

```js
rd.gravity = rd.GRAVITY_LINEAR;
rd.trail = rd.TRAIL_NONE;
rd.rain([[2,1,0.25]], 120);
```

### Heavy storm

```js
rd.gravity = rd.GRAVITY_NON_LINEAR;
rd.trail = rd.TRAIL_DROPS;
rd.options.gravityAngleVariance = 0.02;
rd.rain([[4,2,1],[7,3,3]], 60);
```

### Condensation

```js
rd.gravity = rd.GRAVITY_NONE;
rd.trail = rd.TRAIL_SMUDGE;
rd.rain([[3,2,0.8]], 100);
```

---

## Troubleshooting

* Ensure image is fully loaded
* Small drops below `gravityThreshold` do not fall
* Reduce blur or collisions for performance
* Keep `enableSizeChange` on if the image layout changes

---

## License note

Keep the original rainyday.js license header when redistributing.
