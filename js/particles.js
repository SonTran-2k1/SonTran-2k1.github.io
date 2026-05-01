/**
 * particles.js — Floating particle background for TNS.DEV
 * Lightweight canvas-based particles with connection lines
 */
(function () {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let W, H, particles = [], raf;
  const COUNT = 55;
  const MAX_DIST = 130;
  const COLORS = ["125,95,255", "0,240,255", "168,136,255"];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function random(min, max) { return Math.random() * (max - min) + min; }

  function createParticle() {
    return {
      x:  random(0, W),
      y:  random(0, H),
      vx: random(-0.3, 0.3),
      vy: random(-0.3, 0.3),
      r:  random(1, 2.5),
      color: COLORS[Math.floor(random(0, COLORS.length))],
      alpha: random(0.3, 0.7),
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, createParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Update + draw dots
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges
      if (p.x < -10) p.x = W + 10;
      else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      else if (p.y > H + 10) p.y = -10;

      // Draw dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
      ctx.fill();

      // Draw connection lines
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const opacity = (1 - dist / MAX_DIST) * 0.15;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(125,95,255,${opacity})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(draw);
  }

  // Pause when tab is hidden (performance)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); }
    else { raf = requestAnimationFrame(draw); }
  });

  window.addEventListener("resize", resize);

  init();
  draw();
})();
