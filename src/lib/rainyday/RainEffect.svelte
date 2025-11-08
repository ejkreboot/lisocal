<script lang="ts">
  import { onMount } from 'svelte';
  import { createRainyDay, type RainyDayOptions } from '$lib/rainyday';

  export let imageSrc: string = '';
  export let blur: number = 10;
  export let fps: number = 30;
  
  let imageElement: HTMLImageElement;
  let rainyDayInstance: any;
  let canvasContainer: HTMLElement;
  let isLoaded = false;
  let error: string | null = null;

  async function createResizedImage(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      // Create a canvas to resize the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Cannot create canvas context'));
        return;
      }

      // Calculate target dimensions (limit to reasonable size)
      const maxWidth = Math.min(canvasContainer.offsetWidth, 1200);
      const maxHeight = Math.min(canvasContainer.offsetHeight, 800);
      
      const aspectRatio = imageElement.naturalWidth / imageElement.naturalHeight;
      let targetWidth = maxWidth;
      let targetHeight = maxWidth / aspectRatio;
      
      if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = maxHeight * aspectRatio;
      }

      // Set canvas size
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      // Draw resized image
      ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
      
      // Create new image element from resized canvas
      const resizedImg = new Image();
      resizedImg.onload = () => resolve(resizedImg);
      resizedImg.onerror = () => reject(new Error('Failed to create resized image'));
      resizedImg.src = canvas.toDataURL('image/jpeg', 0.8);
    });
  }

  async function initRainEffect() {
    if (!imageElement || !isLoaded) return;
    
    try {
      // Ensure image has valid dimensions
      if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
        throw new Error('Image has invalid dimensions');
      }

      // Ensure container has dimensions
      if (!canvasContainer.offsetWidth || !canvasContainer.offsetHeight) {
        // Set minimum dimensions if container has no size
        canvasContainer.style.width = `${Math.min(imageElement.naturalWidth, 800)}px`;
        canvasContainer.style.height = `${Math.min(imageElement.naturalHeight, 600)}px`;
      }

      console.log('Original image dimensions:', imageElement.naturalWidth, 'x', imageElement.naturalHeight);
      console.log('Container dimensions:', canvasContainer.offsetWidth, 'x', canvasContainer.offsetHeight);

      // Create resized image for rainyday.js
      const resizedImage = await createResizedImage();
      console.log('Resized image dimensions:', resizedImage.naturalWidth, 'x', resizedImage.naturalHeight);

      const options: RainyDayOptions = {
        image: resizedImage,
        blur: Math.max(0, Math.min(blur, 15)), // Clamp blur between 0-15 (lower max)
        fps: Math.max(15, Math.min(fps, 30)), // Clamp fps between 15-30
        parentElement: canvasContainer,
        fillStyle: 'rgba(174, 194, 224, 0.6)',
        enableCollisions: true,
        gravityThreshold: 3,
        enableSizeChange: false, // Disable size change to avoid issues
        opacity: 1
      };

      // Clear any existing instance
      if (rainyDayInstance) {
        try {
          // Try to clean up previous instance if possible
          if (rainyDayInstance.canvas && rainyDayInstance.canvas.parentNode) {
            rainyDayInstance.canvas.parentNode.removeChild(rainyDayInstance.canvas);
          }
        } catch (cleanupErr) {
          console.warn('Cleanup error:', cleanupErr);
        }
      }

      try {
        rainyDayInstance = await createRainyDay(options);
      } catch (rainError) {
        // Fallback: try with no blur and minimal settings
        console.warn('First attempt failed, trying fallback settings:', rainError);
        
        const fallbackOptions: RainyDayOptions = {
          image: resizedImage,
          blur: 0, // No blur to avoid stackBlur issues
          fps: 20,
          parentElement: canvasContainer,
          fillStyle: 'rgba(174, 194, 224, 0.4)',
          enableCollisions: false, // Disable collisions for performance
          gravityThreshold: 5,
          enableSizeChange: false,
          opacity: 0.8
        };
        
        rainyDayInstance = await createRainyDay(fallbackOptions);
      }
      
      // Configure rain behavior
      rainyDayInstance.reflection = rainyDayInstance.REFLECTION_NONE; // Use simpler reflection
      rainyDayInstance.trail = rainyDayInstance.TRAIL_DROPS;
      rainyDayInstance.gravity = rainyDayInstance.GRAVITY_LINEAR; // Use simpler gravity
      rainyDayInstance.collision = rainyDayInstance.COLLISION_SIMPLE;

      // Start gentle rain
      rainyDayInstance.rain([
        [2, 1, 0.4],    // Smaller, gentler drops
        [4, 2, 0.2, 30] // Fewer large drops
      ], 150);

      error = null;
      console.log('Rain effect initialized successfully');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to initialize rain effect';
      console.error('Rain effect error:', err);
    }
  }

  function handleImageLoad() {
    console.log('Image loaded, dimensions:', imageElement.naturalWidth, 'x', imageElement.naturalHeight);
    isLoaded = true;
    
    // Add a small delay to ensure DOM is ready
    setTimeout(() => {
      initRainEffect();
    }, 100);
  }

  function handleImageError() {
    error = 'Failed to load image';
    isLoaded = false;
  }

  onMount(() => {
    if (imageElement && imageElement.complete) {
      handleImageLoad();
    }
  });

  // Reactive statement to reinitialize when parameters change
  $: if (isLoaded && (blur || fps)) {
    initRainEffect();
  }
</script>

<div class="rain-container">
  {#if imageSrc}
    <!-- Hidden image element for rainyday.js -->
    <img 
      bind:this={imageElement}
      src={imageSrc} 
      alt="Rain effect background"
      style="display: none;"
      on:load={handleImageLoad}
      on:error={handleImageError}
    />
  {/if}

  <!-- Container for the rain canvas -->
  <div bind:this={canvasContainer} class="canvas-container">
    {#if error}
      <div class="error-message">
        <p>⚠️ {error}</p>
      </div>
    {:else if !isLoaded}
      <div class="loading-message">
        <p>Loading rain effect...</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .rain-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 300px;
    min-width: 400px;
  }

  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 300px;
    min-width: 400px;
    overflow: hidden;
    background: #f0f0f0; /* Fallback background */
  }

  .error-message,
  .loading-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 1rem;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    text-align: center;
    font-family: var(--font-secondary);
  }

  .error-message {
    color: #d32f2f;
    border: 1px solid #ffcdd2;
  }

  .loading-message {
    color: #666;
  }

  /* Ensure canvas positioning */
  :global(.rain-container canvas) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
</style>