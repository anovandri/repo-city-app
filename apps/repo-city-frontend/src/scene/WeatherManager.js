import * as THREE from 'three';

/**
 * WeatherManager — manages weather effects (sunny, cloudy, rain, fog)
 * Lightweight implementation for visual atmosphere without heavy performance cost.
 */
export class WeatherManager {
  constructor(scene, camera) {
    this._scene = scene;
    this._camera = camera;
    this._currentWeather = 'sunny';
    this._weatherTimer = 0;
    this._nextWeatherChange = this._randomInterval();
    
    // Weather objects
    this._clouds = [];
    this._rainParticles = null;
    this._originalFog = {
      color: scene.fog ? scene.fog.color.clone() : new THREE.Color(0x87ceeb),
      near: scene.fog ? scene.fog.near : 80,
      far: scene.fog ? scene.fog.far : 220,
    };
    
    // Store original sky color
    this._originalSkyColor = scene.background ? scene.background.clone() : new THREE.Color(0x87ceeb);
    
    // Initialize with sunny weather
    this._initClouds();
    this._initRain();
  }

  /**
   * Get current weather type
   * @returns {'sunny' | 'cloudy' | 'rain' | 'fog'}
   */
  get currentWeather() {
    return this._currentWeather;
  }

  /**
   * Manually set weather (used by UI toggle)
   * @param {'sunny' | 'cloudy' | 'rain' | 'fog'} weather
   */
  setWeather(weather) {
    if (!['sunny', 'cloudy', 'rain', 'fog'].includes(weather)) {
      console.warn(`[WeatherManager] Invalid weather type: ${weather}`);
      return;
    }
    
    if (this._currentWeather === weather) return;
    
    console.log(`[WeatherManager] Weather changing: ${this._currentWeather} → ${weather}`);
    this._currentWeather = weather;
    this._applyWeather();
  }

  /**
   * Update weather system (call in animation loop)
   * @param {number} delta - time in seconds since last frame
   */
  update(delta) {
    // NOTE: Auto weather change disabled - weather is now manually controlled via UI button
    // If you want auto weather changes, uncomment the code below:
    /*
    this._weatherTimer += delta;
    if (this._weatherTimer >= this._nextWeatherChange) {
      this._weatherTimer = 0;
      this._nextWeatherChange = this._randomInterval();
      this._randomWeather();
    }
    */

    // Update active weather effects
    if (this._currentWeather === 'cloudy') {
      this._updateClouds(delta);
    } else if (this._currentWeather === 'rain') {
      this._updateRain(delta);
    }
  }

  /**
   * Cleanup resources
   */
  dispose() {
    this._clouds.forEach(cloud => {
      this._scene.remove(cloud);
      cloud.geometry.dispose();
      cloud.material.dispose();
    });
    this._clouds = [];

    if (this._rainParticles) {
      this._scene.remove(this._rainParticles);
      this._rainParticles.geometry.dispose();
      this._rainParticles.material.dispose();
      this._rainParticles = null;
    }
  }

  // ── Private Methods ──────────────────────────────────────────────────────

  _randomInterval() {
    return 60 + Math.random() * 60; // 60-120 seconds
  }

  _randomWeather() {
    const weathers = ['sunny', 'cloudy', 'rain', 'fog'];
    const current = this._currentWeather;
    // Pick a different weather than current
    const available = weathers.filter(w => w !== current);
    const next = available[Math.floor(Math.random() * available.length)];
    this.setWeather(next);
  }

  _applyWeather() {
    // Hide all weather effects first
    this._clouds.forEach(cloud => cloud.visible = false);
    if (this._rainParticles) this._rainParticles.visible = false;

    // Reset to original fog
    if (this._scene.fog) {
      this._scene.fog.color.copy(this._originalFog.color);
      this._scene.fog.near = this._originalFog.near;
      this._scene.fog.far = this._originalFog.far;
    }

    // Apply weather-specific effects
    switch (this._currentWeather) {
      case 'sunny':
        this._applySunny();
        break;
      case 'cloudy':
        this._applyCloudy();
        break;
      case 'rain':
        this._applyRain();
        break;
      case 'fog':
        this._applyFog();
        break;
    }
  }

  _applySunny() {
    // Bright lighting, normal sky color
    this._scene.background = this._originalSkyColor.clone();
  }

  _applyCloudy() {
    // Slightly darker sky
    const cloudySky = this._originalSkyColor.clone().multiplyScalar(0.85);
    this._scene.background = cloudySky;
    
    // Show clouds
    this._clouds.forEach(cloud => cloud.visible = true);
  }

  _applyRain() {
    // Darker sky
    const rainySky = this._originalSkyColor.clone().multiplyScalar(0.7);
    this._scene.background = rainySky;
    
    // Show rain particles
    if (this._rainParticles) {
      this._rainParticles.visible = true;
    }
  }

  _applyFog() {
    // Grey sky
    const foggySky = new THREE.Color(0xa0a0a0);
    this._scene.background = foggySky;
    
    // Apply dense fog
    if (this._scene.fog) {
      this._scene.fog.color.set(0xa0a0a0);
      this._scene.fog.near = 20;
      this._scene.fog.far = 80;
    }
  }

  // ── Cloud System ─────────────────────────────────────────────────────────

  _initClouds() {
    // Create 5 large simple cloud meshes
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 5; i++) {
      const cloudGeo = new THREE.SphereGeometry(8 + Math.random() * 4, 8, 6);
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      
      // Position clouds high in the sky, spread out
      const angle = (i / 5) * Math.PI * 2;
      const radius = 40 + Math.random() * 20;
      cloud.position.set(
        Math.cos(angle) * radius,
        25 + Math.random() * 10,
        Math.sin(angle) * radius
      );
      
      cloud.scale.set(1.5, 0.8, 1.2); // Flatten slightly for cloud shape
      cloud.visible = false; // Hidden by default
      
      // Store initial angle for rotation
      cloud.userData.angle = angle;
      cloud.userData.radius = radius;
      cloud.userData.speed = 0.05 + Math.random() * 0.05;
      
      this._scene.add(cloud);
      this._clouds.push(cloud);
    }
  }

  _updateClouds(delta) {
    // Slowly rotate clouds around the scene center
    this._clouds.forEach(cloud => {
      cloud.userData.angle += cloud.userData.speed * delta;
      cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.radius;
      cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.radius;
    });
  }

  // ── Rain System ──────────────────────────────────────────────────────────

  _initRain() {
    // Lightweight rain particle system (500 particles)
    const particleCount = 500;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount);

    // Create rain particles in a volume above camera
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread around camera view (±60 units in x/z)
      positions[i3 + 0] = (Math.random() - 0.5) * 120; // x
      positions[i3 + 1] = Math.random() * 40 + 10;     // y (10-50 height)
      positions[i3 + 2] = (Math.random() - 0.5) * 120; // z
      
      // Random fall speed
      velocities[i] = 15 + Math.random() * 10; // 15-25 units/sec
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData.velocities = velocities;

    const material = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
    });

    this._rainParticles = new THREE.Points(geometry, material);
    this._rainParticles.visible = false;
    this._scene.add(this._rainParticles);
  }

  _updateRain(delta) {
    if (!this._rainParticles) return;

    const positions = this._rainParticles.geometry.attributes.position.array;
    const velocities = this._rainParticles.geometry.userData.velocities;
    const particleCount = positions.length / 3;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Move particle downward
      positions[i3 + 1] -= velocities[i] * delta;
      
      // Reset to top when hitting ground
      if (positions[i3 + 1] < 0.5) {
        positions[i3 + 0] = (Math.random() - 0.5) * 120;
        positions[i3 + 1] = 40 + Math.random() * 10;
        positions[i3 + 2] = (Math.random() - 0.5) * 120;
      }
    }

    this._rainParticles.geometry.attributes.position.needsUpdate = true;
  }
}
