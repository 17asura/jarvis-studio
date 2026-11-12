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
    let ringAngle = 0;
    let smoothedEnergy = 0.08;
    const freqData = new Uint8Array(64);

    const render = () => {
      animId = requestAnimationFrame(render);
      const st = stateRef.current;

      // Obter energia acústica real do microfone ou sintetizar cadência orgânica humana
      let rawEnergy = 0.06;
      if (analyserRef.current && (st === 'LISTENING' || st === 'RECORDING')) {
        try {
          analyserRef.current.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += freqData[i];
          rawEnergy = Math.min(1, (sum / (38 * 255)) * 2.4);
        } catch {
          rawEnergy = 0.1;
        }
      } else if (st === 'SPEAKING') {
        rawEnergy =
          0.48 +
          Math.sin(phase * 4.2) * 0.24 +
          Math.cos(phase * 7.1) * 0.15 +
          Math.sin(phase * 11.3) * 0.08;
      } else if (st === 'PROCESSING') {
        rawEnergy = 0.32 + Math.sin(phase * 6.0) * 0.14;
      } else {
        rawEnergy = 0.08 + Math.sin(phase * 1.8) * 0.03;
      }

      smoothedEnergy += (rawEnergy - smoothedEnergy) * 0.22;
      phase += st === 'PROCESSING' ? 0.075 : st === 'SPEAKING' ? 0.055 : 0.026;
      ringAngle += st === 'PROCESSING' ? 0.035 : st === 'SPEAKING' ? 0.022 : 0.008;

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
      const baseRadius = size * 0.27;
      const isCompact = size <= 64;

      // Paleta Futurista Azul & Preto (Cobalto / Ciano Elétrico / Safira)
      let primaryRgb = '56, 189, 248'; // sky-400
      let secondaryRgb = '37, 99, 235'; // blue-600
      let coreHighlightRgb = '186, 230, 253'; // sky-200

      if (st === 'RECORDING') {
        primaryRgb = '14, 165, 233'; // sky-500 intenso
        secondaryRgb = '244, 63, 94'; // toque coral-rubi de captura ativa
        coreHighlightRgb = '224, 242, 254';
      } else if (st === 'SPEAKING') {
        primaryRgb = '56, 189, 248'; // azul elétrico
        secondaryRgb = '6, 182, 212'; // cyan-500
        coreHighlightRgb = '240, 249, 255';
      } else if (st === 'PROCESSING') {
        primaryRgb = '96, 165, 250'; // blue-400
        secondaryRgb = '59, 130, 246'; // blue-500
        coreHighlightRgb = '219, 234, 254';
      }

      // 1. Halo Abissal Azul & Preto
      const glowRadius = baseRadius * (1.58 + smoothedEnergy * 0.62);
      const outerGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, glowRadius);
      outerGrad.addColorStop(0, `rgba(${primaryRgb}, ${0.34 + smoothedEnergy * 0.28})`);
      outerGrad.addColorStop(0.52, `rgba(${secondaryRgb}, ${0.16 + smoothedEnergy * 0.12})`);
      outerGrad.addColorStop(1, 'rgba(3, 7, 17, 0)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Anéis Orbitais Contra-Rotativos & Espectro Radial (Apenas na esfera principal > 64px)
      if (!isCompact) {
        // Anel tracejado exterior (rotação horária)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ringAngle);
        ctx.strokeStyle = `rgba(${primaryRgb}, ${0.28 + smoothedEnergy * 0.3})`;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([6, 10, 18, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Segundo anel tático (rotação anti-horária)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-ringAngle * 1.4);
        ctx.strokeStyle = `rgba(${secondaryRgb}, ${0.35 + smoothedEnergy * 0.25})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([24, 14, 4, 14]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Barras de espectro acústico radial
        const numBars = 36;
        const innerTickR = baseRadius * 1.12;
        ctx.lineWidth = 2;
        for (let b = 0; b < numBars; b++) {
          const a = (b / numBars) * Math.PI * 2 + ringAngle * 0.5;
          const waveAmp =
            Math.abs(Math.sin(a * 4 + phase * 1.8)) * smoothedEnergy * (baseRadius * 0.26);
          const barLen = 2.5 + waveAmp;
          const x1 = cx + Math.cos(a) * innerTickR;
          const y1 = cy + Math.sin(a) * innerTickR;
          const x2 = cx + Math.cos(a) * (innerTickR + barLen);
          const y2 = cy + Math.sin(a) * (innerTickR + barLen);
          ctx.strokeStyle = `rgba(${primaryRgb}, ${0.22 + (waveAmp / (baseRadius * 0.28)) * 0.65})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // 3. Três Camadas Harmónicas de Plasma Azul & Núcleo Preto Profundo
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const points = isCompact ? 40 : 76;
        const layerOffset = layer * 1.15;
        const radiusScale = 1 - layer * 0.085;

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const wave1 =
            Math.sin(angle * 3 + phase + layerOffset) * ((isCompact ? 2 : 4) + smoothedEnergy * (isCompact ? 6 : 19));
          const wave2 =
            Math.cos(angle * 5 - phase * 1.35 + layerOffset) *
            ((isCompact ? 1 : 2.2) + smoothedEnergy * (isCompact ? 4 : 12));
          const r = (baseRadius + wave1 + wave2) * radiusScale;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const coreGrad = ctx.createRadialGradient(
          cx - baseRadius * 0.22,
          cy - baseRadius * 0.22,
          baseRadius * 0.06,
          cx,
          cy,
          baseRadius * 1.25
        );
        if (layer === 0) {
          coreGrad.addColorStop(0, `rgba(${primaryRgb}, 0.42)`);
          coreGrad.addColorStop(1, `rgba(${secondaryRgb}, 0.14)`);
          ctx.fillStyle = coreGrad;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgba(${primaryRgb}, 0.78)`;
          ctx.stroke();
        } else if (layer === 1) {
          coreGrad.addColorStop(0, `rgba(${primaryRgb}, 0.64)`);
          coreGrad.addColorStop(0.7, `rgba(${secondaryRgb}, 0.34)`);
          coreGrad.addColorStop(1, 'rgba(3, 7, 17, 0.85)');
          ctx.fillStyle = coreGrad;
          ctx.fill();
        } else {
          // Núcleo futurista: centro escuro obsidiana com anel de plasma azul brilhante
          coreGrad.addColorStop(0, `rgba(${coreHighlightRgb}, ${0.85 + smoothedEnergy * 0.14})`);
          coreGrad.addColorStop(0.38, `rgba(${primaryRgb}, 0.92)`);
          coreGrad.addColorStop(0.78, `rgba(${secondaryRgb}, 0.85)`);
          coreGrad.addColorStop(1, 'rgba(3, 7, 17, 0.96)');
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
