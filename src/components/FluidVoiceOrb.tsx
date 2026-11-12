import React, { useEffect, useRef } from 'react';

export type JarvisVoiceState = 'IDLE' | 'LISTENING' | 'RECORDING' | 'PROCESSING' | 'SPEAKING';

interface FluidVoiceOrbProps {
  state: JarvisVoiceState;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  size?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

export const FluidVoiceOrb: React.FC<FluidVoiceOrbProps> = ({
  state,
  analyserRef,
  size = 220,
  onClick,
  ariaLabel = 'Controlar assistente de voz J.A.R.V.I.S.'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<JarvisVoiceState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let phase = 0;
    let smoothedEnergy = 0.08;
    const freqData = new Uint8Array(64);

    const render = () => {
      animId = requestAnimationFrame(render);
      const st = stateRef.current;

      // Obter energia acústica real do microfone se disponível
      let rawEnergy = 0.05;
      if (analyserRef.current && (st === 'LISTENING' || st === 'RECORDING')) {
        try {
          analyserRef.current.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += freqData[i];
          rawEnergy = Math.min(1, (sum / (38 * 255)) * 2.2);
        } catch {
          rawEnergy = 0.08;
        }
      } else if (st === 'SPEAKING') {
        rawEnergy = 0.42 + Math.sin(phase * 3.8) * 0.22 + Math.cos(phase * 6.3) * 0.14;
      } else if (st === 'PROCESSING') {
        rawEnergy = 0.24 + Math.sin(phase * 5.0) * 0.1;
      } else {
        rawEnergy = 0.06 + Math.sin(phase * 1.6) * 0.02;
      }

      smoothedEnergy += (rawEnergy - smoothedEnergy) * 0.18;
      phase += st === 'PROCESSING' ? 0.06 : st === 'SPEAKING' ? 0.045 : 0.024;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = size * 0.29;

      // Paleta semântica por estado
      let primaryRgb = '56, 189, 248'; // sky-400 (LISTENING / IDLE)
      let secondaryRgb = '14, 165, 233'; // sky-500
      if (st === 'RECORDING') {
        primaryRgb = '244, 63, 94'; // rose-500
        secondaryRgb = '251, 113, 133';
      } else if (st === 'SPEAKING') {
        primaryRgb = '16, 185, 129'; // emerald-500
        secondaryRgb = '56, 189, 248';
      } else if (st === 'PROCESSING') {
        primaryRgb = '245, 158, 11'; // amber-500
        secondaryRgb = '56, 189, 248';
      }

      // Halo exterior suave
      const glowRadius = baseRadius * (1.45 + smoothedEnergy * 0.55);
      const outerGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, glowRadius);
      outerGrad.addColorStop(0, `rgba(${primaryRgb}, ${0.28 + smoothedEnergy * 0.25})`);
      outerGrad.addColorStop(0.6, `rgba(${secondaryRgb}, 0.08)`);
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3 camadas harmónicas fluidas (estilo ChatGPT Voice Orb)
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const points = 72;
        const layerOffset = layer * 1.1;
        const radiusScale = 1 - layer * 0.08;

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const wave1 = Math.sin(angle * 3 + phase + layerOffset) * (4 + smoothedEnergy * 18);
          const wave2 = Math.cos(angle * 5 - phase * 1.3 + layerOffset) * (2 + smoothedEnergy * 11);
          const r = (baseRadius + wave1 + wave2) * radiusScale;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const coreGrad = ctx.createRadialGradient(
          cx - baseRadius * 0.25,
          cy - baseRadius * 0.25,
          baseRadius * 0.1,
          cx,
          cy,
          baseRadius * 1.25
        );
        if (layer === 0) {
          coreGrad.addColorStop(0, `rgba(${primaryRgb}, 0.35)`);
          coreGrad.addColorStop(1, `rgba(${secondaryRgb}, 0.12)`);
          ctx.fillStyle = coreGrad;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgba(${primaryRgb}, 0.65)`;
          ctx.stroke();
        } else if (layer === 1) {
          coreGrad.addColorStop(0, `rgba(${primaryRgb}, 0.55)`);
          coreGrad.addColorStop(1, `rgba(${secondaryRgb}, 0.25)`);
          ctx.fillStyle = coreGrad;
          ctx.fill();
        } else {
          coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
          coreGrad.addColorStop(0.35, `rgba(${primaryRgb}, 0.88)`);
          coreGrad.addColorStop(1, `rgba(${secondaryRgb}, 0.75)`);
          ctx.fillStyle = coreGrad;
          ctx.fill();
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [size, analyserRef]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group relative inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-transform duration-150 active:scale-95 cursor-pointer"
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${size}px`, height: `${size}px` }}
        className="pointer-events-none block"
      />
    </button>
  );
};
