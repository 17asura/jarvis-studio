import React from 'react';
import { Mic, MicOff, Volume2, Square, Sparkles, CloudSun, Wifi, Server, Brain } from 'lucide-react';
import { FluidVoiceOrb, JarvisVoiceState } from './FluidVoiceOrb';
import { FullSystemTelemetry } from '../utils/jarvisLogic';

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
  memoryFactsCount
}) => {
  const stateLabel: Record<JarvisVoiceState, string> = {
    IDLE: 'Pronto para Ouvir (Modo Toque)',
    LISTENING: 'Escuta Ativa Hands-Free — Fala naturalmente',
    RECORDING: 'A Captar a tua Voz em Tempo Real...',
    PROCESSING: 'A Processar Contexto & Telemetria...',
    SPEAKING: 'J.A.R.V.I.S. a Responder (Toca na Esfera ou Espaço para interromper)'
  };

  const quickVoicePrompts = [
    'Como está o tempo agora em Viana do Castelo e a previsão?',
    'Qual é o tráfego atual do router lá de casa e o ping?',
    'Como estão as máquinas do Homelab e a temperatura da RTX 3060 Ti?',
    'Lembra-te que a entrega do projeto AppRAN é na próxima sexta-feira.'
  ];

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto px-6 py-6 bg-gradient-to-b from-slate-950 via-[#070d19] to-slate-950">
      {/* Top Voice Controls Strip */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 tracking-tight">
            Modo de Voz Pessoal em Tempo Real
          </h1>
          <p className="text-xs text-slate-400">
            Conversação full-duplex com interrupção imediata (Barge-In) · Memória Instantânea · Sensores Domésticos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-slate-400">Voz:</span>
            <select
              aria-label="Selecionar voz do assistente"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="duarte" className="bg-slate-900">Duarte (Neural PT-PT)</option>
              <option value="raquel" className="bg-slate-900">Raquel / Friday (Neural PT-PT)</option>
              <option value="piper" className="bg-slate-900">Piper (Estúdio Offline)</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <span className="text-slate-400">Cadência:</span>
            <select
              aria-label="Velocidade da voz"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="bg-transparent text-slate-100 font-mono focus:outline-none cursor-pointer"
            >
              <option value={1.0} className="bg-slate-900">1.00x</option>
              <option value={1.08} className="bg-slate-900">1.08x</option>
              <option value={1.15} className="bg-slate-900">1.15x</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setAutoVadMode(!autoVadMode)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              autoVadMode
                ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {autoVadMode ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {autoVadMode ? 'Deteção Automática (VAD)' : 'Premir para Falar (PTT)'}
          </button>
        </div>
      </div>

      {/* Central Fluid Voice Orb & Live Captions */}
      <div className="my-auto py-6 flex flex-col items-center justify-center text-center max-w-2xl mx-auto w-full">
        <div className="relative flex items-center justify-center">
          <FluidVoiceOrb
            state={jarvisState}
            analyserRef={analyserRef}
            size={240}
            onClick={onOrbClick}
            ariaLabel="Esfera de voz interativa J.A.R.V.I.S. — Toca para falar ou interromper"
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-sky-400 tracking-wide">
            {stateLabel[jarvisState]}
          </div>
          <p className="text-xs text-slate-400 font-mono">{statusText}</p>
        </div>

        {/* Live Transcript / Subtitle Box */}
        <div className="mt-6 w-full min-h-[92px] rounded-xl bg-slate-900/70 border border-slate-800/90 p-4 flex flex-col justify-center gap-2">
          {liveTranscript ? (
            <div className="text-sm text-amber-300 font-medium">
              “{liveTranscript}”
            </div>
          ) : null}
          {lastAssistantReply ? (
            <p className="text-sm text-slate-200 leading-relaxed line-clamp-3">
              {lastAssistantReply.replace(/```[\s\S]*?```/g, '[Artefacto de Código Gerado]').trim()}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Toca na esfera luminosa ou fala diretamente para perguntar pelo tempo, GPS, tráfego do router, estado do Shad3-PC ou guardar notas na memória instantânea.
            </p>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOrbClick}
            className="px-5 py-2.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Mic className="w-4 h-4" />
            {jarvisState === 'RECORDING'
              ? 'Concluir e Enviar Frase'
              : jarvisState === 'SPEAKING'
              ? 'Interromper e Falar Agora'
              : 'Falar Agora com o J.A.R.V.I.S.'}
          </button>

          {jarvisState === 'SPEAKING' && (
            <button
              type="button"
              onClick={onStopAudio}
              className="px-4 py-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Calar Voz (Espaço)
            </button>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg">
            <span>Sensibilidade VAD ({threshold}%):</span>
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

        {/* Quick Voice Simulation / Direct Prompts */}
        <div className="mt-6 w-full">
          <div className="text-xs text-slate-400 mb-2.5 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Comandos Rápidos de Voz & Telemetria (Testar Resposta Falada):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {quickVoicePrompts.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onQuickVoicePrompt(q)}
                className="px-3.5 py-2.5 rounded-lg bg-slate-900/75 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition-colors cursor-pointer truncate"
              >
                “{q}”
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Live Sensors Context Strip */}
      <div className="max-w-5xl w-full mx-auto pt-4 border-t border-slate-800/80 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="flex items-center gap-3 text-slate-300">
          <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Tempo/GPS: </span>
            <span className="font-mono text-slate-100">
              {telemetry ? `${telemetry.weather.temperatureC}°C` : '16.5°C'}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="text-slate-300">
              {telemetry ? telemetry.weather.conditionText : 'Darque, Viana'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-300">
          <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Router Fibra: </span>
            <span className="font-mono text-slate-100">
              {telemetry ? `${telemetry.network.downloadMbps} Mbps ↓` : '142 Mbps ↓'}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="font-mono text-slate-300">
              {telemetry ? `${telemetry.network.pingMs}ms` : '7ms'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-300">
          <Server className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Homelab: </span>
            <span className="font-mono text-slate-100">
              {telemetry
                ? `${telemetry.machines.filter((m) => m.status === 'online').length}/${telemetry.machines.length} Máquinas`
                : '4/4 Máquinas'}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="text-slate-300">Tailscale OK</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-300">
          <Brain className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="truncate">
            <span className="text-slate-400">Memória Instantânea: </span>
            <span className="font-mono text-slate-100">{memoryFactsCount} factos</span>
            <span className="text-slate-500"> · </span>
            <span className="text-slate-300">Zero-Latency</span>
          </div>
        </div>
      </div>
    </div>
  );
};
