<script lang="ts">
  import { onMount } from 'svelte';
  import HTMLRainEffect from '$lib/rainyday/HTMLRainEffect.svelte';

  let contentElement: HTMLElement;
  let rainComponent: any;
  let isRaining = false;
  let mode: 'element' | 'fullpage' = 'element';

  function toggleRain() {
    if (isRaining) {
      rainComponent?.stopRain();
    } else {
      rainComponent?.startRain();
    }
    isRaining = !isRaining;
  }
</script>

<div class="demo-container">
  <div class="controls">
    <h1>HTML Rain Effect Demo</h1>
    <div class="button-group">
      <button on:click={() => mode = 'element'} class:active={mode === 'element'}>
        Element Mode
      </button>
      <button on:click={() => mode = 'fullpage'} class:active={mode === 'fullpage'}>
        Full Page Mode
      </button>
      <button on:click={toggleRain} class="rain-toggle">
        {isRaining ? 'Stop Rain' : 'Start Rain'} 🌧️
      </button>
    </div>
    
    <p class="info">
      {#if mode === 'element'}
        Rain effect will be applied to the colored box below
      {:else}
        Rain effect will be applied to the entire page
      {/if}
    </p>
  </div>

  {#if mode === 'element'}
    <div class="content-box" bind:this={contentElement}>
      <h2>Sample Content</h2>
      <p>This is a div with some styled content.</p>
      <ul>
        <li>List item 1</li>
        <li>List item 2</li>
        <li>List item 3</li>
      </ul>
      <div class="gradient-box">
        <p>A box with gradient background</p>
      </div>
    </div>
  {/if}

  <HTMLRainEffect 
    bind:this={rainComponent}
    targetElement={mode === 'element' ? contentElement : null}
    fullPage={mode === 'fullpage'}
    blur={12}
    fps={30}
    scale={0.75}
    rainPresets={[[3, 2, 0.6], [5, 3, 0.3, 40]]}
    spawnInterval={100}
  />
</div>

<style>
  .demo-container {
    padding: 2rem;
    min-height: 100vh;
  }

  .controls {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 1rem 0;
    color: #333;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    border: 2px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  button:hover {
    border-color: #4a90e2;
    background: #f0f7ff;
  }

  button.active {
    border-color: #4a90e2;
    background: #4a90e2;
    color: white;
  }

  button.rain-toggle {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
  }

  button.rain-toggle:hover {
    background: #357abd;
    border-color: #357abd;
  }

  .info {
    color: #666;
    font-size: 0.9rem;
    margin: 0;
  }

  .content-box {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 3rem;
    border-radius: 12px;
    max-width: 600px;
    margin: 0 auto;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  }

  .content-box h2 {
    margin-top: 0;
  }

  .content-box ul {
    padding-left: 1.5rem;
  }

  .content-box li {
    margin: 0.5rem 0;
  }

  .gradient-box {
    margin-top: 2rem;
    padding: 1.5rem;
    background: rgba(255,255,255,0.2);
    border-radius: 8px;
    backdrop-filter: blur(10px);
  }

  .gradient-box p {
    margin: 0;
  }
</style>
