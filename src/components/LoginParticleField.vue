<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const canvasRef = ref(null);

let animationFrameId = 0;
let resizeFrameId = 0;
let particles = [];
let ctx = null;
let devicePixelRatioValue = 1;
let canvasWidth = 0;
let canvasHeight = 0;
let time = 0;
let driftPhase = 0;

const mouse = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  radius: 320,
  active: false,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createParticle() {
  const depth = 0.38 + Math.random() * 1.48;
  const orbit = 12 + Math.random() * 40 * depth;
  const size = 0.55 + Math.random() * 2.3 * depth;
  const response = 0.72 + depth * 0.46 + Math.random() * 0.22;
  return {
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    baseX: 0,
    baseY: 0,
    vx: (Math.random() - 0.5) * (0.16 + depth * 0.22),
    vy: (Math.random() - 0.5) * (0.12 + depth * 0.18),
    size,
    alpha: 0.08 + Math.random() * 0.28,
    drift: 0.008 + Math.random() * 0.016,
    orbit,
    orbitSpeed: 0.3 + Math.random() * 0.95,
    angle: Math.random() * Math.PI * 2,
    twinkle: Math.random() * Math.PI * 2,
    haze: 0.18 + Math.random() * 0.58,
    response,
    depth,
  };
}

function syncParticleAnchors() {
  particles.forEach((particle) => {
    particle.baseX = particle.x;
    particle.baseY = particle.y;
  });
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  canvasWidth = Math.max(rect.width, 1);
  canvasHeight = Math.max(rect.height, 1);
  devicePixelRatioValue = window.devicePixelRatio || 1;

  canvas.width = Math.round(canvasWidth * devicePixelRatioValue);
  canvas.height = Math.round(canvasHeight * devicePixelRatioValue);

  if (ctx) {
    ctx.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);
  }

  const particleCount = clamp(Math.round((canvasWidth * canvasHeight) / 9800), 96, 190);

  if (particles.length > particleCount) {
    particles.length = particleCount;
  }

  while (particles.length < particleCount) {
    particles.push(createParticle());
  }

  syncParticleAnchors();
  mouse.x = canvasWidth * 0.5;
  mouse.y = canvasHeight * 0.5;
  mouse.targetX = mouse.x;
  mouse.targetY = mouse.y;
}

function queueResize() {
  cancelAnimationFrame(resizeFrameId);
  resizeFrameId = requestAnimationFrame(resizeCanvas);
}

function updateMouse(event) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  mouse.targetX = event.clientX - rect.left;
  mouse.targetY = event.clientY - rect.top;
  mouse.active = true;
}

function handleMouseLeave() {
  mouse.active = false;
  mouse.targetX = canvasWidth * 0.5;
  mouse.targetY = canvasHeight * 0.5;
}

function drawConnections() {
  for (let index = 0; index < particles.length; index += 1) {
    const source = particles[index];
    for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex += 1) {
      const target = particles[nextIndex];
      const dx = source.x - target.x;
      const dy = source.y - target.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 124) continue;

      const sourceCursorDistance = Math.hypot(source.x - mouse.x, source.y - mouse.y);
      const targetCursorDistance = Math.hypot(target.x - mouse.x, target.y - mouse.y);
      const cursorInfluence = mouse.active
        ? Math.max(0, 1 - Math.min(sourceCursorDistance, targetCursorDistance) / (mouse.radius * 0.92))
        : 0;
      const opacity =
        (1 - distance / 124) *
        (0.11 + cursorInfluence * 0.14) *
        Math.min(source.depth, target.depth);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(172, 220, 255, ${opacity})`;
      ctx.lineWidth = 0.35 + Math.min(source.depth, target.depth) * 0.28 + cursorInfluence * 0.32;
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }
  }
}

function animate() {
  if (!ctx) return;

  time += 0.0058;
  driftPhase += 0.0035;
  mouse.x += (mouse.targetX - mouse.x) * (mouse.active ? 0.14 : 0.03);
  mouse.y += (mouse.targetY - mouse.y) * (mouse.active ? 0.14 : 0.03);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "rgba(5, 16, 40, 0.08)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  particles.forEach((particle) => {
    particle.baseX += particle.vx;
    particle.baseY += particle.vy;
    particle.angle += 0.0018 * particle.orbitSpeed;

    if (particle.baseX < -40 || particle.baseX > canvasWidth + 40) {
      particle.vx *= -1;
      particle.baseX = clamp(particle.baseX, -40, canvasWidth + 40);
    }

    if (particle.baseY < -40 || particle.baseY > canvasHeight + 40) {
      particle.vy *= -1;
      particle.baseY = clamp(particle.baseY, -40, canvasHeight + 40);
    }

    const dx = mouse.x - particle.baseX;
    const dy = mouse.y - particle.baseY;
    const distance = Math.hypot(dx, dy) || 1;
    const influence = Math.max(0, 1 - distance / mouse.radius);
    const focusInfluence = mouse.active ? Math.pow(influence, 1.35) : influence * 0.42;
    const response = particle.response;
    const magneticPull = mouse.active ? 30 : 12;
    const tangential = mouse.active ? 18 : 6;
    const flowX = (dx / distance) * focusInfluence * magneticPull * response;
    const flowY = (dy / distance) * focusInfluence * magneticPull * response;
    const swirlX = (-dy / distance) * focusInfluence * tangential * (0.44 + response * 0.34);
    const swirlY = (dx / distance) * focusInfluence * tangential * (0.44 + response * 0.34);
    const wakeX = (dx / distance) * influence * influence * 10 * (response - 0.45);
    const wakeY = (dy / distance) * influence * influence * 10 * (response - 0.45);
    const orbitX = Math.cos(particle.angle + time) * particle.orbit * 0.16;
    const orbitY = Math.sin(particle.angle + time * 1.16) * particle.orbit * 0.1;
    const swayX = Math.cos(time * particle.orbitSpeed + particle.twinkle) * 5.2 * particle.depth;
    const swayY = Math.sin(time * (particle.orbitSpeed * 0.84) + particle.twinkle) * 4.6 * particle.depth;
    const fieldDriftX = Math.cos(driftPhase + particle.twinkle) * 6 * particle.haze;
    const fieldDriftY = Math.sin(driftPhase * 0.9 + particle.twinkle) * 5 * particle.haze;

    let targetX = particle.baseX + orbitX + swayX + fieldDriftX + flowX + swirlX + wakeX;
    let targetY = particle.baseY + orbitY + swayY + fieldDriftY + flowY + swirlY + wakeY;

    if (!mouse.active) {
      targetX += Math.cos(time * 0.58 + particle.twinkle) * 4;
      targetY += Math.sin(time * 0.5 + particle.twinkle) * 4;
    }

    particle.x += (targetX - particle.x) * (0.032 + particle.drift + focusInfluence * 0.018);
    particle.y += (targetY - particle.y) * (0.032 + particle.drift + focusInfluence * 0.018);

    const pulse = 0.82 + (Math.sin(time * 2.5 + particle.twinkle) + 1) * 0.12;
    const glowRadius = particle.size * (4.8 + particle.depth * 1.4) * pulse;
    const alpha = Math.min(particle.alpha * pulse + focusInfluence * 0.12 + particle.depth * 0.02, 0.6);

    const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
    glow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    glow.addColorStop(0.28, `rgba(205, 238, 255, ${alpha * 0.72})`);
    glow.addColorStop(0.66, `rgba(98, 177, 255, ${alpha * 0.26})`);
    glow.addColorStop(1, "rgba(98, 177, 255, 0)");

    ctx.beginPath();
    ctx.fillStyle = glow;
    ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(245, 252, 255, ${Math.min(alpha + 0.18, 0.72)})`;
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });

  drawConnections();
  animationFrameId = requestAnimationFrame(animate);
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  ctx = canvas.getContext("2d");
  resizeCanvas();
  animate();

  window.addEventListener("resize", queueResize, { passive: true });
  window.addEventListener("pointermove", updateMouse, { passive: true });
  window.addEventListener("pointerleave", handleMouseLeave);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrameId);
  cancelAnimationFrame(resizeFrameId);

  window.removeEventListener("resize", queueResize);
  window.removeEventListener("pointermove", updateMouse);
  window.removeEventListener("pointerleave", handleMouseLeave);
});
</script>

<template>
  <canvas ref="canvasRef" class="login-particle-field" aria-hidden="true" />
</template>
