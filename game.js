(() => {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const SKY_COLOR = 0x9fd3ff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 18, 90);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 200);

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xbcd9ff, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6de, 1.0);
  sun.position.set(-15, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.camera.far = 60;
  scene.add(sun);

  function makeSnowTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5fbff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(180, 210, 235, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(90 + i * 70, 0);
      ctx.lineTo(90 + i * 70, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210, 230, 245, 0.5)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 2 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 40);
    return tex;
  }

  const snowTex = makeSnowTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 400),
    new THREE.MeshStandardMaterial({ map: snowTex, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -100;
  ground.receiveShadow = true;
  scene.add(ground);

  function addMountain(x, z, scale, color) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(10 * scale, 16 * scale, 5),
      new THREE.MeshStandardMaterial({ color, flatShading: true })
    );
    m.position.set(x, 6 * scale, z);
    scene.add(m);
  }
  addMountain(-30, -70, 1.6, 0xdfeeff);
  addMountain(-14, -90, 2.2, 0xcfe6ff);
  addMountain(22, -80, 2.0, 0xdfeeff);
  addMountain(38, -60, 1.4, 0xcfe6ff);

  const skierTextureLoader = new THREE.TextureLoader();
  const SKIER_IMAGE_ASPECT = 947 / 1370;
  const SKIER_HEIGHT = 2.3;

  function buildSkier() {
    const g = new THREE.Group();

    const spriteMat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.3 });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(SKIER_HEIGHT * SKIER_IMAGE_ASPECT, SKIER_HEIGHT, 1);
    sprite.position.y = SKIER_HEIGHT / 2;
    g.add(sprite);
    skierTextureLoader.load('assets/cientista_skier.png', (tex) => {
      spriteMat.map = tex;
      spriteMat.needsUpdate = true;
    });

    const skiMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const skiGeo = new THREE.BoxGeometry(0.16, 0.05, 1.7);
    const skiL = new THREE.Mesh(skiGeo, skiMat);
    skiL.position.set(-0.22, 0.05, 0.2);
    skiL.castShadow = true;
    g.add(skiL);
    const skiR = skiL.clone();
    skiR.position.x = 0.22;
    g.add(skiR);

    return g;
  }

  function buildTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4423 })
    );
    trunk.position.y = 0.35;
    g.add(trunk);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1f7a3f, flatShading: true });
    [[0.9, 1.1, 1.0], [0.7, 1.0, 1.7], [0.5, 0.9, 2.3]].forEach(([r, h, y]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), foliageMat);
      cone.position.y = y;
      g.add(cone);
    });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const s = 0.8 + Math.random() * 0.6;
    g.scale.set(s, s, s);
    g.userData.radius = 0.55 * s;
    g.userData.type = 'tree';
    return g;
  }

  function buildRock() {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a8f98, flatShading: true })
    );
    m.position.y = 0.3;
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, s);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.radius = 0.4 * s;
    m.userData.type = 'rock';
    return m;
  }

  function buildStar() {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x996b00, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.3 })
    );
    m.position.y = 1.1;
    m.userData.type = 'star';
    return m;
  }

  function buildGate() {
    const g = new THREE.Group();
    const gap = 3.2;
    const colors = Math.random() < 0.5 ? [0xff3b3b, 0x3b7bff] : [0x3b7bff, 0xff3b3b];
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8);
    const left = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: colors[0] }));
    left.position.set(-gap / 2, 0.8, 0);
    left.castShadow = true;
    g.add(left);
    const right = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: colors[1] }));
    right.position.set(gap / 2, 0.8, 0);
    right.castShadow = true;
    g.add(right);
    const flagGeo = new THREE.PlaneGeometry(0.5, 0.35);
    const flagL = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: colors[0], side: THREE.DoubleSide }));
    flagL.position.set(-gap / 2 + 0.26, 1.5, 0);
    g.add(flagL);
    const flagR = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: colors[1], side: THREE.DoubleSide }));
    flagR.position.set(gap / 2 - 0.26, 1.5, 0);
    g.add(flagR);
    g.userData.type = 'gate';
    g.userData.gap = gap;
    return g;
  }

  const PARTICLE_COUNT = 300;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 40;
    particlePos[i * 3 + 1] = Math.random() * 20;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const snowParticles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.85 })
  );
  scene.add(snowParticles);

  const LANE_LIMIT = 6.5;
  const BASE_SPEED = 11, MAX_SPEED = 30, ACCEL = 0.15;
  const SPAWN_Z = -85, DESPAWN_Z = 9;

  const skier = buildSkier();
  scene.add(skier);

  const state = {
    running: false,
    x: 0, vx: 0,
    y: 0, vy: 0, jumping: false,
    lean: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    distance: 0,
    score: 0,
    bonus: 0,
    lives: 3,
    invincible: 0,
    obstacles: [],
    decor: [],
  };

  let nextTreeAt = 0, nextRockAt = 0, nextGateAt = 0, nextStarAt = 0, nextSideAt = 0;

  function resetGame() {
    state.x = 0; state.vx = 0; state.y = 0; state.vy = 0; state.jumping = false; state.lean = 0;
    state.speed = BASE_SPEED; state.elapsed = 0; state.distance = 0; state.score = 0; state.bonus = 0;
    state.lives = 3; state.invincible = 0;
    state.obstacles.forEach((o) => scene.remove(o.mesh));
    state.decor.forEach((o) => scene.remove(o.mesh));
    state.obstacles.length = 0;
    state.decor.length = 0;
    nextTreeAt = 8; nextRockAt = 14; nextGateAt = 22; nextStarAt = 10; nextSideAt = 4;
    skier.position.set(0, 0, 0);
    skier.visible = true;
    updateHUD();
  }

  const keys = { left: false, right: false, jump: false };
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = true;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = true;
    if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) { keys.jump = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = false;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = false;
    if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) keys.jump = false;
  });

  function bindTouch(id, onDown, onUp) {
    const el = document.getElementById(id);
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }
  bindTouch('btn-left', () => (keys.left = true), () => (keys.left = false));
  bindTouch('btn-right', () => (keys.right = true), () => (keys.right = false));
  bindTouch('btn-jump', () => (keys.jump = true), () => (keys.jump = false));

  if ('ontouchstart' in window) {
    document.getElementById('touch-controls').classList.remove('hidden');
  }

  function spawnObstacle(type) {
    let mesh;
    if (type === 'tree') mesh = buildTree();
    else if (type === 'rock') mesh = buildRock();
    else if (type === 'star') mesh = buildStar();
    else mesh = buildGate();
    mesh.position.x = type === 'gate' ? (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * 2 * LANE_LIMIT;
    mesh.position.z = SPAWN_Z - Math.random() * 10;
    scene.add(mesh);
    state.obstacles.push({ mesh, type, passed: false });
  }

  function spawnSideTree() {
    const mesh = buildTree();
    const side = Math.random() < 0.5 ? -1 : 1;
    mesh.position.x = side * (8 + Math.random() * 6);
    mesh.position.z = SPAWN_Z - Math.random() * 10;
    mesh.scale.multiplyScalar(1.2);
    scene.add(mesh);
    state.decor.push({ mesh });
  }

  function updateHUD() {
    document.getElementById('score').textContent = Math.floor(state.score);
    const livesBox = document.getElementById('lives-box');
    livesBox.innerHTML = '❤️'.repeat(Math.max(state.lives, 0)) + '🖤'.repeat(Math.max(3 - state.lives, 0));
  }

  function endGame() {
    state.running = false;
    document.getElementById('final-score').textContent = Math.floor(state.score);
    const best = Math.max(Number(localStorage.getItem('skiBest') || 0), Math.floor(state.score));
    localStorage.setItem('skiBest', best);
    document.getElementById('best-score').textContent = best;
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  function hitObstacle() {
    if (state.invincible > 0) return;
    state.lives -= 1;
    state.invincible = 1.6;
    updateHUD();
    if (state.lives <= 0) endGame();
  }

  const clock = new THREE.Clock();

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!state.running) {
      renderer.render(scene, camera);
      return;
    }

    state.elapsed += dt;
    state.speed = Math.min(BASE_SPEED + state.elapsed * ACCEL, MAX_SPEED);
    state.distance += state.speed * dt;
    state.score = state.distance * 0.5 + state.bonus;
    if (state.invincible > 0) state.invincible -= dt;

    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    state.vx += (steer * 7 - state.vx) * Math.min(dt * 6, 1);
    state.x += state.vx * dt;
    state.x = Math.max(-LANE_LIMIT, Math.min(LANE_LIMIT, state.x));
    state.lean += (-steer * 0.5 - state.lean) * Math.min(dt * 8, 1);

    if (keys.jump && !state.jumping) {
      state.jumping = true;
      state.vy = 6.2;
    }
    if (state.jumping) {
      state.vy -= 16 * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) { state.y = 0; state.jumping = false; state.vy = 0; }
    }

    skier.position.x = state.x;
    skier.position.y = state.y;
    skier.rotation.z = state.lean;
    skier.rotation.x = Math.sin(state.elapsed * 14) * 0.03 * (state.speed / BASE_SPEED);

    camera.position.set(state.x * 0.4, 3.4 + state.y * 0.3, 8);
    camera.lookAt(state.x * 0.6, 1 + state.y * 0.5, -6);

    snowTex.offset.y -= state.speed * dt * 0.05;

    const pos = particleGeo.attributes.position;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let y = pos.getY(i) - dt * (4 + state.speed * 0.15);
      let z = pos.getZ(i) + dt * state.speed * 0.3;
      if (y < 0) {
        y = 18 + Math.random() * 4;
        pos.setX(i, state.x + (Math.random() - 0.5) * 40);
        z = -40 - Math.random() * 20;
      }
      if (z > 10) z = -50;
      pos.setY(i, y);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;

    nextTreeAt -= state.speed * dt;
    nextRockAt -= state.speed * dt;
    nextGateAt -= state.speed * dt;
    nextStarAt -= state.speed * dt;
    nextSideAt -= state.speed * dt;

    if (nextTreeAt <= 0) { spawnObstacle('tree'); nextTreeAt = 9 + Math.random() * 6; }
    if (nextRockAt <= 0) { spawnObstacle('rock'); nextRockAt = 11 + Math.random() * 7; }
    if (nextGateAt <= 0) { spawnObstacle('gate'); nextGateAt = 20 + Math.random() * 10; }
    if (nextStarAt <= 0) { spawnObstacle('star'); nextStarAt = 9 + Math.random() * 5; }
    if (nextSideAt <= 0) { spawnSideTree(); nextSideAt = 2.5 + Math.random() * 2; }

    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.mesh.position.z += state.speed * dt;

      if (o.type === 'star') {
        o.mesh.rotation.y += dt * 3;
        o.mesh.position.y = 1.1 + Math.sin(state.elapsed * 4 + o.mesh.position.x) * 0.15;
      }

      const dz = o.mesh.position.z - skier.position.z;
      if (!o.passed && Math.abs(dz) < 0.6) {
        o.passed = true;
        if (o.type === 'tree' || o.type === 'rock') {
          const jumpingOver = o.type === 'rock' && state.jumping && state.y > 0.5;
          if (!jumpingOver && Math.abs(o.mesh.position.x - state.x) < o.mesh.userData.radius + 0.45) {
            hitObstacle();
          }
        } else if (o.type === 'star') {
          if (Math.abs(o.mesh.position.x - state.x) < 0.7) {
            state.bonus += 15;
            scene.remove(o.mesh);
            state.obstacles.splice(i, 1);
            continue;
          }
        } else if (o.type === 'gate') {
          const half = o.mesh.userData.gap / 2 - 0.4;
          if (Math.abs(state.x - o.mesh.position.x) < half) state.bonus += 40;
        }
      }

      if (o.mesh.position.z > DESPAWN_Z) {
        scene.remove(o.mesh);
        state.obstacles.splice(i, 1);
      }
    }

    for (let i = state.decor.length - 1; i >= 0; i--) {
      const d = state.decor[i];
      d.mesh.position.z += state.speed * dt;
      if (d.mesh.position.z > DESPAWN_Z) {
        scene.remove(d.mesh);
        state.decor.splice(i, 1);
      }
    }

    skier.visible = state.invincible > 0 ? Math.floor(state.elapsed * 14) % 2 === 0 : true;

    updateHUD();
    renderer.render(scene, camera);
  }

  document.getElementById('start-best-score').textContent = localStorage.getItem('skiBest') || 0;

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    resetGame();
    state.running = true;
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    resetGame();
    state.running = true;
  });

  tick();
})();
