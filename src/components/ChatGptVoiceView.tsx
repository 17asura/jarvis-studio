import React from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Square,
  Sparkles,
  CloudSun,
  Wifi,
  Server,
  Brain,
  Zap,
  Cpu
} from 'lucide-react';
import { FluidVoiceOrb, JarvisVoiceState } from './FluidVoiceOrb';
import { FullSystemTelemetry } from '../utils/jarvisLogic';
import { ReasoningMode, RtxModelProfile } from '../utils/rtxOptimizer';

interface ChatGptVoiceViewProps {
  jarvisState: JarvisVoiceState;
  statusText: string;
  liveTranscript: string;
  lastAssistantReply: string;
  voice: string;
  setVoice: (v: string) => void;
  speed: number;
  setSpeed: (s: number) => void;
  autoVadMode: boolean;
  setAutoVadMode: (v: boolean) => void;
  threshold: number;
  setThreshold: (t: number) => void;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  onOrbClick: () => void;
  onStopAudio: () => void;
  onQuickVoicePrompt: (prompt: string) => void;
  telemetry: FullSystemTelemetry | null;
  memoryFactsCount: number;
  activeModel: RtxModelProfile;
  reasoningMode: ReasoningMode;
  onChangeReasoningMode: (mode: ReasoningMode) => void;
  onOpenRtxStudio: () => void;
  voiceLatencyMs: number;
}

export const ChatGptVoiceView: React.FC<ChatGptVoiceViewProps> = ({
  jarvisState,
  statusText,
  liveTranscript,
  lastAssistantReply,
  voice,
  setVoice,
  speed,
  setSpeed,
  autoVadMode,
  setAutoVadMode,
  threshold,
  setThreshold,
  analyserRef,
  onOrbClick,
  onStopAudio,
  onQuickVoicePrompt,
  telemetry,
  memoryFactsCount,
  activeModel,
  reasoningMode,
  onChangeReasoningMode,
  onOpenRtxStudio,
  voiceLatencyMs
}) => {
  const stateLabel: Record<JarvisVoiceState, string> = {
    IDLE: 'Pronto para Ouvir · Modo Voz Direto Ultra-Rápido',
    LISTENING: 'Escuta Ativa Hands-Free — Fala naturalmente como com um amigo',
    RECORDING: 'A Ouvir a Tua Voz em Tempo Real (48 kHz)...',
    PROCESSING: 'Resposta Rápida em Curso (Micro-Clause Streaming)...',
    SPEAKING: 'J.A.R.V.I.S. a Conversar Contigo (Toca na Esfera ou Espaço para interromper)'
  };

  const quickVoicePrompts = [
    'Olha Jarvis, como está o tempo agora em Viana do Castelo?',
    'Diz-me rápido como está o tráfego do router lá de casa e o ping.',
    'Como estão as temperaturas da minha RTX 3060 Ti e do Shad3-PC?',
    'Qual é o melhor modelo MoE para correr agora na minha RTX 3060 Ti?'
  ];

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 futuristic-grid-bg relative">
      {/* Top Voice & RTX 3060 Ti Low-Latency Controls Strip */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/20 pb-3.5 z-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight font-display">
              Modo Voz Direto · Conversação Humana Ultra-Rápida
            </h1>
            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-[11px] font-mono text-sky-300 tabular-nums">
              TTFA ~{voiceLatencyMs}ms
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Prosódia natural PT-PT com streaming à primeira vírgula · Motor:{' '}
            <button
              type="button"
              onClick={onOpenRtxStudio}
              className="text-sky-400 hover:underline font-medium cursor-pointer"
            >
              {activeModel.name} ({activeModel.voiceTokPerSec} tok/s)
            </button>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Reasoning Mode Selector for Instant Voice vs Deep CoT */}
          <div className="flex items-center bg-[#040915] border border-sky-500/25 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onChangeReasoningMode('voice_instant')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                reasoningMode === 'voice_instant'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Salta a cadeia longa de pensamento (/no_think) para resposta vocal imediata"
            >
              <Zap className="w-3 h-3" />
              Voz Instantânea
            </button>
            <button
              type="button"
              onClick={() => onChangeReasoningMode('hybrid_smart')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                reasoningMode === 'hybrid_smart'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Híbrido
            </button>
            <button
              type="button"
              onClick={() => onChangeReasoningMode('deep_reasoning')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                reasoningMode === 'deep_reasoning'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Profundo (CoT)
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#050b18] border border-sky-500/25 rounded-lg px-2.5 py-1.5">
            <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <select
              aria-label="Selecionar voz do assistente"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="duarte" className="bg-slate-950">Duarte (Natural PT-PT)</option>
              <option value="raquel" className="bg-slate-950">Raquel / Friday (Natural PT-PT)</option>
              <option value="piper" className="bg-slate-950">Piper (Offline RTX)</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#050b18] border border-sky-500/25 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">Ritmo:</span>
            <select
              aria-label="Velocidade da voz"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="bg-transparent text-slate-100 font-mono focus:outline-none cursor-pointer"
            >
              <option value={1.0} className="bg-slate-950">1.00x</option>
              <option value={1.06} className="bg-slate-950">1.06x (Humano)</option>
              <option value={1.12} className="bg-slate-950">1.12x (Rápido)</option>
              <option value={1.18} className="bg-slate-950">1.18x (Turbo)</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setAutoVadMode(!autoVadMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              autoVadMode
                ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                : 'bg-[#050b18] border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {autoVadMode ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {autoVadMode ? 'Escuta Contínua (VAD)' : 'Toque (PTT)'}
          </button>
        </div>
      </div>

      {/* Central Futuristic Blue & Black Animated Orb + Live Captions */}
      <div className="my-auto py-4 sm:py-6 flex flex-col items-center justify-center text-center max-w-2xl mx-auto w-full z-10">
        <div className="relative flex items-center justify-center my-2">
          {/* GPU-Composited Concentric Futuristic Blue Rings */}
          <div className="pointer-events-none absolute w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] rounded-full border border-sky-500/20 border-dashed animate-orbital-slow" />
          <div className="pointer-events-none absolute w-[230px] h-[230px] sm:w-[264px] sm:h-[264px] rounded-full border border-blue-500/25 animate-orbital-reverse" />
          <div className="pointer-events-none absolute w-[190px] h-[190px] sm:w-[220px] sm:h-[220px] rounded-full bg-sky-500/10 blur-2xl animate-aura-pulse" />

          <FluidVoiceOrb
            state={jarvisState}
            analyserRef={analyserRef}
            size={236}
            onClick={onOrbClick}
            ariaLabel="Esfera de voz interativa J.A.R.V.I.S. — Toca para falar ou interromper"
          />
        </div>

        <div className="mt-3 space-y-1">
          <div className="text-sm font-semibold text-sky-400 tracking-wide">
            {stateLabel[jarvisState]}
          </div>
          <p className="text-xs text-slate-400 font-mono">{statusText}</p>
        </div>

        {/* Live Transcript / Human Spoken Subtitle Box */}
        <div className="mt-4 w-full min-h-[88px] rounded-xl futuristic-card p-4 flex flex-col justify-center gap-2">
          {liveTranscript ? (
            <div className="text-sm text-sky-300 font-medium">
              “{liveTranscript}”
            </div>
          ) : null}
          {lastAssistantReply ? (
            <p className="text-sm text-slate-100 leading-relaxed line-clamp-3">
              {lastAssistantReply.replace(/```[\s\S]*?```/g, '[Artefacto de Código no Estúdio]').trim()}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Toca na esfera azul ou fala diretamente. O J.A.R.V.I.S. responde com tom natural português e começa a falar na primeira vírgula sem esperares pelo fim do texto.
            </p>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOrbClick}
            className="px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 futuristic-blue-glow"
          >
            <Mic className="w-4 h-4" />
            {jarvisState === 'RECORDING'
              ? 'Enviar Agora e Ouvir Resposta'
              : jarvisState === 'SPEAKING'
              ? 'Interromper e Falar Agora'
              : 'Conversar por Voz Agora'}
          </button>

          {jarvisState === 'SPEAKING' && (
            <button
              type="button"
              onClick={onStopAudio}
              className="px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Calar Voz (Espaço)
            </button>
          )}

          <button
            type="button"
            onClick={onOpenRtxStudio}
            className="px-3.5 py-2.5 rounded-xl bg-[#050b18] hover:bg-slate-900 border border-sky-500/30 text-sky-300 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            Configurar RTX 3060 Ti
          </button>

          <label className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 bg-[#050b18] border border-sky-500/20 rounded-xl">
            <span>VAD ({threshold}%):</span>
            <input
              type="range"
              min={4}
              max={40}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-20 accent-sky-400 cursor-pointer"
            />
          </label>
        </div>

        {/* Quick Voice Simulation / Direct Spoken Prompts */}
        <div className="mt-5 w-full">
          <div className="text-xs text-slate-400 mb-2 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Testar Resposta Humana Ultra-Rápida em Voz (Clica para ouvir):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {quickVoicePrompts.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onQuickVoicePrompt(q)}
                className="px-3.5 py-2.5 rounded-xl futuristic-card hover:border-sky-400/50 text-xs text-slate-200 transition-all cursor-pointer truncate"
              >
                “{q}”
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Live Sensors Context Strip */}
      <div className="max-w-5xl w-full mx-auto pt-3.5 border-t border-sky-500/20 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs z-10">
        <div className="flex items-center gap-2.5 text-slate-300">
          <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Viana GPS: </span>
            <span className="font-mono text-slate-100 tabular-nums">
              {telemetry ? `${telemetry.weather.temperatureC}°C` : '16.5°C'}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="text-slate-300">
              {telemetry ? telemetry.weather.conditionText : 'Darque'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-slate-300">
          <Wifi className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Router: </span>
            <span className="font-mono text-slate-100 tabular-nums">
              {telemetry ? `${telemetry.network.downloadMbps} Mbps ↓` : '142 Mbps ↓'}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="font-mono text-sky-300 tabular-nums">
              {telemetry ? `${telemetry.network.pingMs}ms` : '7ms'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-slate-300">
          <Server className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">RTX 3060 Ti: </span>
            <span className="font-mono text-slate-100 tabular-nums">
              {telemetry?.machines?.[0]
                ? `${telemetry.machines[0].vramUsedMb}MB · ${telemetry.machines[0].tempC}°C`
                : '5840MB · 54°C'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-slate-300">
          <Brain className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Memória: </span>
            <span className="font-mono text-slate-100 tabular-nums">{memoryFactsCount} factos</span>
            <span className="text-slate-500"> · </span>
            <span className="text-sky-300">Ativa</span>
          </div>
        </div>
      </div>
    </div>
  );
};
