import {
  i as WebGLRenderer,
  Q as PerspectiveCamera,
  lt as Scene,
  a as AmbientLight,
  g as DirectionalLight,
  l as BoxGeometry,
  V as Mesh,
  H as MeshBasicMaterial,
  U as MeshStandardMaterial,
  mt as SphereGeometry,
  ct as SRGBColorSpace,
} from "/assets/three.module-fBMLdKIM.js";

const canvas = document.querySelector(".services-webgl");

if (canvas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

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
    canvas.remove();
  }

  if (renderer) {
    const scene = new Scene();
    const stage = new Scene();
    const camera = new PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 7.4);

    const ambientLight = new AmbientLight(0xf5e7df, 1.2);
    const keyLight = new DirectionalLight(0xff9a7a, 3.4);
    keyLight.position.set(4, 5, 6);
    const fillLight = new DirectionalLight(0x9b7cff, 1.6);
    fillLight.position.set(-5, -2, 4);

    scene.add(ambientLight, keyLight, keyLight.target, fillLight, fillLight.target, stage);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = 4;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);

    const orangeMaterial = new MeshStandardMaterial({
      color: 0xff6b4a,
      metalness: 0.22,
      roughness: 0.3,
      emissive: 0xff4a2a,
      emissiveIntensity: 0.24,
    });
    const purpleMaterial = new MeshStandardMaterial({
      color: 0x9b7cff,
      metalness: 0.24,
      roughness: 0.34,
      emissive: 0x5b3fff,
      emissiveIntensity: 0.16,
    });
    const creamMaterial = new MeshStandardMaterial({
      color: 0xf5e7df,
      metalness: 0.1,
      roughness: 0.38,
      emissive: 0xf5e7df,
      emissiveIntensity: 0.06,
    });
    const wireMaterial = new MeshBasicMaterial({
      color: 0xff8a6a,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });

    const orb = new Mesh(new SphereGeometry(0.62, 48, 32), orangeMaterial);
    orb.position.set(-2.45, 0.72, 0.1);

    const orbWire = new Mesh(new SphereGeometry(0.92, 24, 18), wireMaterial);
    orbWire.position.copy(orb.position);

    const panel = new Mesh(new BoxGeometry(1.18, 0.74, 0.06), purpleMaterial);
    panel.position.set(2.3, -0.95, 0.25);
    panel.rotation.set(0.12, -0.55, 0.08);

    const accent = new Mesh(new SphereGeometry(0.26, 24, 18), creamMaterial);
    accent.position.set(2.45, 1.35, 0.15);

    const cube = new Mesh(new BoxGeometry(0.34, 0.34, 0.34), creamMaterial);
    cube.position.set(-2.55, -1.35, 0.3);
    cube.rotation.set(0.45, 0.6, 0.2);

    const violetOrb = new Mesh(new SphereGeometry(0.18, 20, 14), purpleMaterial);
    violetOrb.position.set(-2.3, 1.6, 0.2);

    stage.add(orb, orbWire, panel, accent, cube, violetOrb);

    const orbit = [];
    const orbitCount = coarsePointer ? 16 : 24;
    const orbitRadius = 1.12;
    const orbitGeometry = new SphereGeometry(0.026, 6, 6);
    const orbitMaterial = new MeshBasicMaterial({
      color: 0xf5e7df,
      transparent: true,
      opacity: 0.68,
    });

    for (let i = 0; i < orbitCount; i += 1) {
      const particle = new Mesh(orbitGeometry, orbitMaterial);
      particle.userData.phase = (i / orbitCount) * Math.PI * 2;
      stage.add(particle);
      orbit.push(particle);
    }

    const placeOrbit = (elapsed) => {
      orbit.forEach((particle) => {
        const angle = particle.userData.phase + elapsed * 0.5;
        particle.position.set(
          orb.position.x + Math.cos(angle) * orbitRadius,
          orb.position.y + Math.sin(angle) * 0.42,
          orb.position.z + Math.sin(angle) * 0.62
        );
        particle.scale.setScalar(0.62 + 0.38 * Math.sin(angle * 2 + elapsed));
      });
    };
    placeOrbit(0);

    const particleCount = coarsePointer ? 36 : 72;
    const particleGeometry = new SphereGeometry(0.018, 5, 5);
    const particleMaterial = new MeshBasicMaterial({
      color: 0xf5e7df,
      transparent: true,
      opacity: 0.55,
    });
    const dust = [];
    for (let i = 0; i < particleCount; i += 1) {
      const particle = new Mesh(particleGeometry, particleMaterial);
      const radius = 2.1 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particle.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta) * 0.7,
        radius * Math.cos(phi)
      );
      particle.scale.setScalar(0.55 + Math.random() * 0.9);
      stage.add(particle);
      dust.push(particle);
    }

    let compactLayout = null;
    const applyLayout = (width) => {
      const compact = width < 420;
      if (compact === compactLayout) return;
      compactLayout = compact;

      if (compact) {
        orb.position.set(1.55, 1.45, 0.1);
        orbWire.position.copy(orb.position);
        panel.position.set(1.78, -1.25, 0.25);
        panel.scale.setScalar(0.78);
        accent.position.set(1.68, 2.02, 0.15);
        accent.scale.setScalar(0.9);
        cube.position.set(1.7, -2.02, 0.3);
        cube.scale.setScalar(0.9);
        violetOrb.position.set(1.72, -0.68, 0.2);
      } else {
        orb.position.set(-2.45, 0.72, 0.1);
        orbWire.position.copy(orb.position);
        panel.position.set(2.3, -0.95, 0.25);
        panel.scale.setScalar(1);
        accent.position.set(2.45, 1.35, 0.15);
        accent.scale.setScalar(1);
        cube.position.set(-2.55, -1.35, 0.3);
        cube.scale.setScalar(1);
        violetOrb.position.set(-2.3, 1.6, 0.2);
      }

      placeOrbit(0);
    };

    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      mouse.targetY = -((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let scrollProgress = 0;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = max > 0 ? window.scrollY / max : 0;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      applyLayout(width);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);
    window.addEventListener("resize", resize, { passive: true });

    let raf = null;
    const start = performance.now();

    const animate = () => {
      const elapsed = (performance.now() - start) / 1000;
      mouse.x += (mouse.targetX - mouse.x) * 0.06;
      mouse.y += (mouse.targetY - mouse.y) * 0.06;

      stage.rotation.y = mouse.x * 0.34 + scrollProgress * 0.9;
      stage.rotation.x = mouse.y * 0.2 + scrollProgress * 0.24;
      orb.rotation.x = elapsed * 0.35;
      orb.rotation.y = elapsed * 0.5;
      orbWire.rotation.x = -elapsed * 0.12;
      orbWire.rotation.y = elapsed * 0.16;
      panel.rotation.x = 0.12 + Math.sin(elapsed * 0.45) * 0.08;
      panel.rotation.y = -0.55 + Math.cos(elapsed * 0.38) * 0.12;
      accent.rotation.x = elapsed * 0.22;
      accent.rotation.y = elapsed * 0.3;
      cube.rotation.x = 0.45 + elapsed * 0.18;
      cube.rotation.y = 0.6 + elapsed * 0.24;
      violetOrb.rotation.y = -elapsed * 0.3;
      placeOrbit(elapsed);

      camera.position.x = mouse.x * 0.42;
      camera.position.y = mouse.y * 0.26 - scrollProgress * 0.35;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      canvas.dataset.webgl = "ready";
      raf = requestAnimationFrame(animate);
    };

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (raf === null && !reducedMotion) raf = requestAnimationFrame(animate);
        } else if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      },
      { threshold: 0.05 }
    );
    visibilityObserver.observe(canvas);

    const renderStatic = () => {
      stage.rotation.set(0.08, 0.18, 0);
      camera.position.set(0.12, 0.08, 7.4);
      camera.lookAt(0, 0, 0);
      placeOrbit(0.8);
      renderer.render(scene, camera);
      canvas.dataset.webgl = "ready";
    };

    if (reducedMotion) {
      renderStatic();
    } else {
      raf = requestAnimationFrame(animate);
    }

    const cleanup = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);

      new Set([
        orb.geometry,
        orbWire.geometry,
        panel.geometry,
        accent.geometry,
        cube.geometry,
        violetOrb.geometry,
        orbitGeometry,
        particleGeometry,
      ]).forEach((geometry) => geometry.dispose());

      new Set([
        orangeMaterial,
        purpleMaterial,
        creamMaterial,
        wireMaterial,
        orbitMaterial,
        particleMaterial,
      ]).forEach((material) => material.dispose());

      renderer.dispose();
    };

    window.addEventListener("pagehide", cleanup, { once: true });
  }
}
