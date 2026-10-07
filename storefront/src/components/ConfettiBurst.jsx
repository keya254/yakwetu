import { useEffect, useRef } from 'react';

const COLORS = ['#f5a524', '#ffd27a', '#e8793a', '#fff4e0', '#c2410c', '#fde68a'];

/** Short saffron confetti burst after a successful purchase. */
export default function ConfettiBurst({ onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let running = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = reduced ? 60 : Math.min(420, Math.round(window.innerWidth / 3));
    const pieces = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 4 + Math.random() * 6,
      h: 6 + Math.random() * 10,
      vx: -2 + Math.random() * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const started = performance.now();
    const duration = 4200;

    const tick = (now) => {
      if (!running) return;
      const t = now - started;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - t / duration);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < duration) {
        raf = requestAnimationFrame(tick);
      } else {
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [onDone]);

  return <canvas ref={canvasRef} className="confetti-layer" aria-hidden />;
}
