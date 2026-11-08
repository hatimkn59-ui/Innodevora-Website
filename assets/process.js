import {
  i as WebGLRenderer,
  Q as PerspectiveCamera,
  lt as Scene,
  a as AmbientLight,
  g as DirectionalLight,
  et as PointLight,
  l as BoxGeometry,
  mt as SphereGeometry,
  V as Mesh,
  H as MeshBasicMaterial,
  W as MeshStandardMaterial,
  y as Group,
  m as Color,
  xt as Vector3,
  d as BufferGeometry,
  v as Float32BufferAttribute,
  tt as Points,
  nt as PointsMaterial,
  j as LineSegments,
  A as LineLoop,
  k as LineBasicMaterial,
  ct as SRGBColorSpace,
} from "/assets/three.module-fBMLdKIM.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

function readToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function toColor(value, fallback) {
  try {
    return new Color(value);
  } catch (error) {
    return new Color(fallback);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createRenderer(canvas) {
  let renderer = null;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !coarsePointer,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.error("WebGL renderer failed:", error);
    canvas.dataset.webgl = "unavailable";
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = 4;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0, 0, 0, 0);
  canvas.dataset.webgl = "ready";
  return renderer;
}

function sizeRenderer(renderer, camera, container) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function collectMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    if (!object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material) => {
      if (material && !materials.includes(material)) {
        materials.push(material);
        material.transparent = true;
        if (typeof material.opacity !== "number") material.opacity = 1;
      }
    });
  });
  return materials;
}

function makeCircleGeometry(radius, segments) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  return new BufferGeometry().setFromPoints(points);
}

function makeRing(radius, segments, material, rotation) {
  const line = new LineLoop(makeCircleGeometry(radius, segments), material);
  if (rotation) line.rotation.set(rotation[0], rotation[1], rotation[2]);
  return line;
}

function makeGrid(size, divisions, material) {
  const points = [];
  for (let i = 0; i <= divisions; i += 1) {
    const t = (i / divisions - 0.5) * size;
    points.push(new Vector3(t, 0, -size / 2), new Vector3(t, 0, size / 2));
    points.push(new Vector3(-size / 2, 0, t), new Vector3(size / 2, 0, t));
  }
  return new LineSegments(new BufferGeometry().setFromPoints(points), material);
}

/* Reveal animations */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
);

document.querySelectorAll(".process [data-reveal]").forEach((element) => {
  revealObserver.observe(element);
});

if (reducedMotion) {
  document.querySelectorAll(".process [data-reveal]").forEach((element) => {
    element.classList.add("is-revealed");
  });
}

/* Header surface syncing */

const siteHeaderNav = document.querySelector(".site-header .site-header__nav");
const collabSurface = document.querySelector(".process-collab");
let headerSurfaceRaf = 0;

function syncHeaderSurface() {
  headerSurfaceRaf = 0;
  if (!siteHeaderNav || !collabSurface) return;

  const navRect = siteHeaderNav.getBoundingClientRect();
  const collabRect = collabSurface.getBoundingClientRect();
  const navCenterX = navRect.left + navRect.width / 2;
  const navCenterY = navRect.top + navRect.height / 2;
  const overCollab =
    navCenterX >= collabRect.left &&
    navCenterX <= collabRect.right &&
    navCenterY >= collabRect.top &&
    navCenterY <= collabRect.bottom;

  document.body.classList.toggle("process-header-on-collab", overCollab);
}

function scheduleHeaderSurfaceSync() {
  if (headerSurfaceRaf) return;
  headerSurfaceRaf = requestAnimationFrame(syncHeaderSurface);
}

window.addEventListener("scroll", scheduleHeaderSurfaceSync, { passive: true });
window.addEventListener("resize", scheduleHeaderSurfaceSync);
window.addEventListener("load", scheduleHeaderSurfaceSync, { once: true });

if (document.fonts?.ready) {
  document.fonts.ready.then(scheduleHeaderSurfaceSync);
}

syncHeaderSurface();

/* Journey stage syncing */

const stageCards = [...document.querySelectorAll("[data-process-stages] .process-stage")];
const stagesContainer = document.querySelector("[data-process-stages]");
const timelineFill = stagesContainer?.querySelector("[data-timeline-fill]");
const stageSticky = document.querySelector("[data-process-stage-view]");
const stageNumber = stageSticky?.querySelector("[data-stage-number]");
const stageName = stageSticky?.querySelector("[data-stage-name]");
const stageTagline = stageSticky?.querySelector("[data-stage-tagline]");
const stageNavButtons = [...document.querySelectorAll("[data-stage-target]")];

let currentStage = -1;
let journeyRaf = 0;

function setStageNav(index) {
  stageNavButtons.forEach((button, buttonIndex) => {
    if (buttonIndex === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function setJourneyStage(index) {
  if (index < 0 || index >= stageCards.length || index === currentStage) return;
  currentStage = index;

  stageCards.forEach((card, cardIndex) => {
    card.classList.toggle("is-active", cardIndex === index);
  });

  setStageNav(index);

  if (stageNumber) stageNumber.textContent = String(index + 1).padStart(2, "0");
  const card = stageCards[index];
  if (stageName) stageName.textContent = card?.querySelector("h3")?.textContent || "";
  if (stageTagline) stageTagline.textContent = card?.querySelector(".process-stage__tagline")?.textContent || "";

  if (stageController) stageController.setActiveStage(index);
}

function syncJourney() {
  journeyRaf = 0;
  if (!stageCards.length) return;

  const center = window.innerHeight * 0.46;
  let active = 0;
  stageCards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    if (rect.top < center) active = index;
  });
  setJourneyStage(active);

  if (stagesContainer && timelineFill) {
    const rect = stagesContainer.getBoundingClientRect();
    const total = Math.max(1, rect.height - 48);
    const traveled = clamp(center - rect.top, 0, total);
    timelineFill.style.height = `${traveled}px`;
  }
}

function scheduleJourneySync() {
  if (journeyRaf) return;
  journeyRaf = requestAnimationFrame(syncJourney);
}

window.addEventListener("scroll", scheduleJourneySync, { passive: true });
window.addEventListener("resize", scheduleJourneySync);
syncJourney();

stageNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.stageTarget);
    target?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  });
});

/* Hero scene */

let heroInitialized = false;
let heroController = null;

function initHeroScene(canvas) {
  const container = canvas.parentElement;
  const renderer = createRenderer(canvas);
  if (!renderer) return;

  container.classList.add("is-webgl-ready");

  const creamToken = readToken("--color-cream", "#f5e7df");
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  const world = new Group();
  scene.add(world);

  const ambient = new AmbientLight(toColor(creamToken, 0xf5e7df), 1.05);
  const key = new DirectionalLight(0xff7a58, 3.4);
  key.position.set(4, 5, 6);
  const fill = new DirectionalLight(0x9b7cff, 1.2);
  fill.position.set(-5, -2, 4);
  scene.add(ambient, key, key.target, fill, fill.target, world);

  const creamMaterial = new MeshStandardMaterial({
    color: toColor(creamToken, 0xf5e7df),
    metalness: 0.12,
    roughness: 0.4,
    emissive: toColor(creamToken, 0xf5e7df),
    emissiveIntensity: 0.08,
  });

  const orangeMaterial = new MeshStandardMaterial({
    color: 0xff6b4a,
    metalness: 0.2,
    roughness: 0.26,
    emissive: 0xff3a1a,
    emissiveIntensity: 0.5,
  });

  const violetMaterial = new MeshStandardMaterial({
    color: 0x9b7cff,
    metalness: 0.22,
    roughness: 0.34,
    emissive: 0x5a3cff,
    emissiveIntensity: 0.2,
  });

  const core = new Mesh(new BoxGeometry(1.05, 1.05, 1.05), creamMaterial);
  core.rotation.set(0.22, 0.45, 0);
  const coreWire = new Mesh(
    new BoxGeometry(1.38, 1.38, 1.38),
    new MeshBasicMaterial({ color: 0xff7a58, wireframe: true, transparent: true, opacity: 0.32 })
  );
  world.add(core, coreWire);

  const seed = new Mesh(new SphereGeometry(0.56, 32, 24), orangeMaterial);
  seed.position.set(-0.16, 0, 0.12);
  world.add(seed);

  const outerSphere = new Mesh(
    new SphereGeometry(1.85, 28, 20),
    new MeshBasicMaterial({ color: 0xff7a58, wireframe: true, transparent: true, opacity: 0.11 })
  );
  outerSphere.rotation.set(0.72, 0.2, 0);
  world.add(outerSphere);

  const panelMaterial = new MeshStandardMaterial({
    color: toColor(creamToken, 0xf5e7df),
    metalness: 0.06,
    roughness: 0.35,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const panels = [];
  for (let i = 0; i < 3; i += 1) {
    const panel = new Mesh(new BoxGeometry(1.55, 0.06, 1.05), panelMaterial);
    const angle = i * 2.09;
    panel.position.set(Math.cos(angle) * 1.9, (i - 1) * 0.35, Math.sin(angle) * 1.2);
    panel.rotation.set(0.15, angle + 0.3, 0.08);
    panels.push(panel);
    world.add(panel);
  }

  const nodes = [];
  const nodeGeometry = new SphereGeometry(0.075, 16, 12);
  for (let i = 0; i < 7; i += 1) {
    const node = new Mesh(nodeGeometry, orangeMaterial.clone());
    node.userData.phase = (i / 7) * Math.PI * 2;
    nodes.push(node);
    world.add(node);
  }

  function makeRing(radius, segments, material, rotation) {
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
    }
    const line = new LineLoop(new BufferGeometry().setFromPoints(points), material);
    if (rotation) line.rotation.set(rotation[0], rotation[1], rotation[2]);
    return line;
  }

  const ringOne = makeRing(
    2.15,
    96,
    new LineBasicMaterial({ color: 0xff7a58, transparent: true, opacity: 0.38 }),
    [1.05, 0.35, 0.1]
  );
  const ringTwo = makeRing(
    2.75,
    128,
    new LineBasicMaterial({ color: toColor(creamToken, 0xf5e7df), transparent: true, opacity: 0.12 }),
    [0.7, 0.1, 0.4]
  );
  world.add(ringOne, ringTwo);

  const particleCount = coarsePointer ? 70 : 150;
  const particlePositions = new Float32BufferAttribute(particleCount * 3, 3);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = 2.8 + Math.random() * 1.4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    particlePositions.setXYZ(
      i,
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.72,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute("position", particlePositions);
  const particles = new Points(
    particleGeometry,
    new PointsMaterial({
      color: toColor(creamToken, 0xf5e7df),
      size: 0.022,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  world.add(particles);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0;
  let running = false;

  function onPointerMove(event) {
    const rect = container.getBoundingClientRect();
    pointer.tx = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.ty = (event.clientY - rect.top) / rect.height * 2 - 1;
  }

  function onPointerLeave() {
    pointer.tx = 0;
    pointer.ty = 0;
  }

  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);

  function animate(now) {
    raf = requestAnimationFrame(animate);
    if (document.hidden) return;

    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    const t = now * 0.001;
    const rect = container.getBoundingClientRect();
    const scrollProgress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);

    world.rotation.y = 0.45 + t * 0.18 + pointer.x * 0.45 + (scrollProgress - 0.5) * 0.5;
    world.rotation.x = -0.12 + pointer.y * 0.3 + (scrollProgress - 0.5) * 0.18;
    world.position.y = Math.sin(t * 0.35) * 0.08;

    core.rotation.y += 0.004;
    core.rotation.x += 0.002;
    coreWire.rotation.y -= 0.0025;
    outerSphere.rotation.y += 0.002;
    outerSphere.rotation.x += 0.001;
    seed.scale.setScalar(1 + Math.sin(t * 1.5) * 0.035);

    nodes.forEach((node) => {
      const angle = node.userData.phase + t * 0.35;
      node.position.set(
        Math.cos(angle) * 2.05,
        Math.sin(angle * 1.7) * 0.55,
        Math.sin(angle) * 2.05
      );
      node.scale.setScalar(0.82 + 0.18 * Math.sin(angle * 2 + t));
    });

    panels.forEach((panel, index) => {
      panel.rotation.y += 0.002 * (index + 1);
      panel.position.y += Math.sin(t + index) * 0.0007;
    });

    particles.rotation.y = t * 0.04;
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const resizeObserver = new ResizeObserver(() => {
    sizeRenderer(renderer, camera, container);
  });
  resizeObserver.observe(container);
  requestAnimationFrame(() => sizeRenderer(renderer, camera, container));

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) start();
      else stop();
    },
    { rootMargin: "300px" }
  );
  visibilityObserver.observe(container);

  if (reducedMotion) {
    sizeRenderer(renderer, camera, container);
    renderer.render(scene, camera);
  } else {
    start();
  }

  heroController = {
    stop,
    dispose() {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    },
  };
}

/* Stage scene */

let stageInitialized = false;
var stageController = null;

function initStageScene(canvas) {
  const container = canvas.parentElement;
  const renderer = createRenderer(canvas);
  if (!renderer) return;

  const creamToken = readToken("--color-cream", "#f5e7df");
  const creamColor = toColor(creamToken, 0xf5e7df);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 7.5);

  const world = new Group();
  scene.add(world);

  const ambient = new AmbientLight(creamColor, 1.0);
  const key = new DirectionalLight(0xff7a58, 3.2);
  key.position.set(4, 5, 6);
  const fill = new DirectionalLight(0x9b7cff, 1.15);
  fill.position.set(-5, -2, 4);
  scene.add(ambient, key, key.target, fill, fill.target, world);

  const creamMaterial = new MeshStandardMaterial({
    color: creamColor,
    metalness: 0.1,
    roughness: 0.4,
    emissive: creamColor,
    emissiveIntensity: 0.06,
  });

  const orangeMaterial = new MeshStandardMaterial({
    color: 0xff6b4a,
    metalness: 0.2,
    roughness: 0.26,
    emissive: 0xff3a1a,
    emissiveIntensity: 0.45,
  });

  const core = new Mesh(new BoxGeometry(1.05, 1.05, 1.05), creamMaterial);
  const coreWire = new Mesh(
    new BoxGeometry(1.32, 1.32, 1.32),
    new MeshBasicMaterial({ color: 0xff7a58, wireframe: true, transparent: true, opacity: 0.28 })
  );
  world.add(core, coreWire);

  const layers = [];

  function addLayer(group) {
    const layer = { group, materials: collectMaterials(group), target: 0 };
    layers.push(layer);
    world.add(group);
    return layer;
  }

  const discoveryGroup = new Group();
  for (let i = 0; i < 16; i += 1) {
    const material = (i % 3 === 0 ? orangeMaterial : creamMaterial).clone();
    const sphere = new Mesh(new SphereGeometry(0.055, 12, 10), material);
    const radius = 1.5 + Math.random() * 0.9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    sphere.position.set(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.62,
      Math.sin(phi) * Math.sin(theta) * radius
    );
    discoveryGroup.add(sphere);
  }
  const discoveryLayer = addLayer(discoveryGroup);

  const strategyGroup = new Group();
  const gridMaterial = new LineBasicMaterial({ color: 0xff7a58, transparent: true, opacity: 0.3 });
  strategyGroup.add(makeGrid(2.3, 9, gridMaterial));
  const secondGrid = makeGrid(2.3, 9, gridMaterial);
  secondGrid.rotation.y = Math.PI / 2;
  strategyGroup.add(secondGrid);
  const strategyLayer = addLayer(strategyGroup);

  const designGroup = new Group();
  const designMaterial = new MeshStandardMaterial({
    color: creamColor,
    metalness: 0.06,
    roughness: 0.35,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (let i = 0; i < 3; i += 1) {
    const panel = new Mesh(new BoxGeometry(1.55, 0.06, 1.05), designMaterial.clone());
    panel.position.set((i - 1) * 0.18, (i - 1) * 0.32, (i - 1) * 0.12);
    panel.rotation.set(0.18, i * 0.9, 0.06);
    designGroup.add(panel);
  }
  const designLayer = addLayer(designGroup);

  const stackGroup = new Group();
  for (let i = 0; i < 4; i += 1) {
    const slab = new Mesh(
      new BoxGeometry(1.35, 0.1, 1.05),
      new MeshStandardMaterial({
        color: creamColor,
        metalness: 0.08,
        roughness: 0.35,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );
    slab.position.y = (i - 1.5) * 0.24;
    stackGroup.add(slab);
  }
  const stackLayer = addLayer(stackGroup);

  const qaGroup = new Group();
  const qaMaterial = new LineBasicMaterial({ color: 0xff7a58, transparent: true, opacity: 0.32 });
  [-0.42, 0, 0.42].forEach((y) => {
    const ring = makeRing(1.18, 64, qaMaterial.clone(), [Math.PI / 2, 0, 0]);
    ring.position.y = y;
    qaGroup.add(ring);
  });
  for (let i = 0; i < 4; i += 1) {
    const check = new Mesh(
      new BoxGeometry(0.16, 0.16, 0.16),
      new MeshStandardMaterial({ color: 0xff6b4a, emissive: 0xff3a1a, emissiveIntensity: 0.35, transparent: true, opacity: 0.7 })
    );
    const angle = (i / 4) * Math.PI * 2;
    check.position.set(Math.cos(angle) * 1.05, 0, Math.sin(angle) * 1.05);
    qaGroup.add(check);
  }
  const qaLayer = addLayer(qaGroup);

  const launchGroup = new Group();
  const beam = new Mesh(
    new BoxGeometry(0.08, 2.6, 0.08),
    new MeshBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0.55 })
  );
  beam.position.y = 1.1;
  const topNode = new Mesh(new SphereGeometry(0.12, 16, 12), orangeMaterial.clone());
  topNode.position.y = 2.4;
  launchGroup.add(beam, topNode);
  const launchLayer = addLayer(launchGroup);

  const evolutionGroup = new Group();
  const evolutionMaterial = new LineBasicMaterial({ color: toColor(creamToken, 0xf5e7df), transparent: true, opacity: 0.24 });
  [1.8, 2.35, 2.9].forEach((radius) => {
    evolutionGroup.add(makeRing(radius, 96, evolutionMaterial.clone(), [0.6, 0.2, 0]));
  });
  for (let i = 0; i < 8; i += 1) {
    const sphere = new Mesh(new SphereGeometry(0.05, 12, 10), creamMaterial.clone());
    const angle = (i / 8) * Math.PI * 2;
    sphere.position.set(Math.cos(angle) * 2.55, Math.sin(angle * 2) * 0.35, Math.sin(angle) * 2.55);
    evolutionGroup.add(sphere);
  }
  const evolutionLayer = addLayer(evolutionGroup);

  const layersByStage = [
    discoveryLayer,
    strategyLayer,
    designLayer,
    stackLayer,
    qaLayer,
    launchLayer,
    evolutionLayer,
  ];

  // Keep `layers` aligned with stage order.
  layers.length = 0;
  layersByStage.forEach((layer) => layers.push(layer));

  const nodePositions = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
    nodePositions.push([Math.cos(angle) * 2.1, Math.sin(angle * 0.35) * 0.25, Math.sin(angle) * 2.1]);
  }

  const nodeMeshes = [];
  const nodeSphereMaterials = [];
  const nodeRingMaterials = [];

  const nodeGroup = new Group();
  nodePositions.forEach((position, index) => {
    const group = new Group();
    const sphereMaterial = creamMaterial.clone();
    const sphere = new Mesh(new SphereGeometry(0.09, 18, 14), sphereMaterial);
    const ringMaterial = new LineBasicMaterial({ color: 0xff7a58, transparent: true, opacity: 0.2 });
    const ring = new LineLoop(makeCircleGeometry(0.16, 32), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(sphere, ring);
    group.position.set(position[0], position[1], position[2]);
    nodeGroup.add(group);
    nodeMeshes.push(group);
    nodeSphereMaterials.push(sphereMaterial);
    nodeRingMaterials.push(ringMaterial);
  });
  world.add(nodeGroup);

  const connectPoints = nodePositions.map((position) => new Vector3(position[0], position[1], position[2]));
  const connectLine = new LineLoop(
    new BufferGeometry().setFromPoints(connectPoints),
    new LineBasicMaterial({ color: toColor(creamToken, 0xf5e7df), transparent: true, opacity: 0.18 })
  );
  world.add(connectLine);

  const particleCount = coarsePointer ? 60 : 130;
  const particlePositions = new Float32BufferAttribute(particleCount * 3, 3);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = 2.6 + Math.random() * 1.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    particlePositions.setXYZ(
      i,
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.72,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute("position", particlePositions);
  const particles = new Points(
    particleGeometry,
    new PointsMaterial({
      color: toColor(creamToken, 0xf5e7df),
      size: 0.02,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  world.add(particles);

  let activeStage = 0;
  let targetWorldY = 0;

  function setActiveStage(index) {
    activeStage = index;
    layers.forEach((layer, layerIndex) => {
      layer.target = layerIndex === index ? 1 : 0;
    });

    nodeSphereMaterials.forEach((material, materialIndex) => {
      const active = materialIndex === index;
      material.color.set(active ? 0xff6b4a : creamToken);
      material.emissive.set(active ? 0xff3a1a : 0x000000);
      material.emissiveIntensity = active ? 0.62 : 0.04;
    });

    nodeRingMaterials.forEach((material, materialIndex) => {
      material.opacity = materialIndex === index ? 0.85 : 0.18;
    });

    nodeMeshes.forEach((group, groupIndex) => {
      group.scale.setScalar(groupIndex === index ? 1.45 : 1);
    });

    targetWorldY = index * 0.55;
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0;
  let running = false;

  function onPointerMove(event) {
    const rect = container.getBoundingClientRect();
    pointer.tx = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.ty = (event.clientY - rect.top) / rect.height * 2 - 1;
  }

  function onPointerLeave() {
    pointer.tx = 0;
    pointer.ty = 0;
  }

  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);

  function animate(now) {
    raf = requestAnimationFrame(animate);
    if (document.hidden) return;

    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    const t = now * 0.001;

    layers.forEach((layer) => {
      const target = layer.target;
      layer.materials.forEach((material) => {
        material.opacity += (target - material.opacity) * 0.1;
        if (material.opacity < 0.001) material.opacity = 0;
      });
      const scale = 0.9 + (layer.materials[0]?.opacity || 0) * 0.1;
      layer.group.scale.setScalar(scale);
      layer.group.visible = (layer.materials[0]?.opacity || 0) > 0.006;
    });

    core.rotation.y += 0.003;
    core.rotation.x += 0.0015;
    coreWire.rotation.y -= 0.002;
    nodeGroup.rotation.y += 0.0015;

    world.rotation.y += (targetWorldY + t * 0.08 - world.rotation.y) * 0.05;
    world.rotation.x = pointer.y * 0.18;
    world.position.y = Math.sin(t * 0.4) * 0.05;

    camera.position.x = pointer.x * 0.35;
    camera.position.y = pointer.y * 0.2;
    camera.lookAt(0, 0, 0);

    particles.rotation.y = t * 0.03;
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const resizeObserver = new ResizeObserver(() => {
    sizeRenderer(renderer, camera, container);
  });
  resizeObserver.observe(container);
  requestAnimationFrame(() => sizeRenderer(renderer, camera, container));

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) start();
      else stop();
    },
    { rootMargin: "300px" }
  );
  visibilityObserver.observe(container);

  setActiveStage(0);
  layers[0].target = 1;

  if (reducedMotion) {
    sizeRenderer(renderer, camera, container);
    setActiveStage(0);
    layers.forEach((layer, index) => {
      layer.target = index === 0 ? 1 : 0;
      layer.materials.forEach((material) => {
        material.opacity = index === 0 ? 1 : 0;
      });
      layer.group.visible = index === 0;
    });
    renderer.render(scene, camera);
  } else {
    start();
  }

  stageController = {
    setActiveStage,
    stop,
    dispose() {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    },
  };
}

/* Lazy initialization */

const heroCanvas = document.querySelector(".process-webgl");
const stageCanvas = document.querySelector(".process-stage-webgl");

const lazyObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const canvas = entry.target;
      if (canvas === heroCanvas && !heroInitialized) {
        heroInitialized = true;
        initHeroScene(canvas);
      }
      if (canvas === stageCanvas && !stageInitialized) {
        stageInitialized = true;
        initStageScene(canvas);
      }
      lazyObserver.unobserve(canvas);
    });
  },
  { rootMargin: "1400px 0px" }
);

if (heroCanvas) lazyObserver.observe(heroCanvas);
if (stageCanvas) lazyObserver.observe(stageCanvas);

/* Cleanup */

window.addEventListener(
  "pagehide",
  () => {
    heroController?.dispose();
    stageController?.dispose();
  },
  { once: true }
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    heroController?.stop();
    stageController?.stop();
  }
});
