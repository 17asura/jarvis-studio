import React, { useState } from 'react';
import {
  Cpu,
  Zap,
  Check,
  Copy,
  Sparkles,
  Terminal,
  Volume2,
  Brain,
  Play
} from 'lucide-react';
import {
  RTX_3060_TI_MODELS,
  RtxModelProfile,
  ReasoningMode,
  calculateRtx3060TiAllocation
} from '../utils/rtxOptimizer';

interface RtxOptimizerViewProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  reasoningMode: ReasoningMode;
  onSelectReasoningMode: (mode: ReasoningMode) => void;
  onTestModelPrompt?: (prompt: string, speak: boolean) => void;
}

export const RtxOptimizerView: React.FC<RtxOptimizerViewProps> = ({
  selectedModelId,
  onSelectModel,
  reasoningMode,
  onSelectReasoningMode,
  onTestModelPrompt
}) => {
  const activeModel: RtxModelProfile =
    RTX_3060_TI_MODELS.find((m) => m.id === selectedModelId) || RTX_3060_TI_MODELS[0];

  const [customNCpuMoe, setCustomNCpuMoe] = useState<number>(activeModel.defaultNCpuMoe || 34);
  const [customCtx, setCustomCtx] = useState<number>(activeModel.defaultCtx || 16384);
  const [kvType, setKvType] = useState<'q8_0' | 'q4_0' | 'f16'>(activeModel.kvCacheType || 'q8_0');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [filterArch, setFilterArch] = useState<string>('all');

  const allocation = calculateRtx3060TiAllocation(
    activeModel,
    activeModel.architecture === 'MoE Híbrido' ? customNCpuMoe : 0,
    customCtx,
    kvType,
    reasoningMode
  );

  const filteredModels =
    filterArch === 'all'
      ? RTX_3060_TI_MODELS
      : RTX_3060_TI_MODELS.filter((m) => m.architecture === filterArch);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(allocation.generatedCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleSelectModelCard = (model: RtxModelProfile) => {
    onSelectModel(model.id);
    setCustomNCpuMoe(model.defaultNCpuMoe);
    setCustomCtx(model.defaultCtx);
    setKvType(model.kvCacheType);
  };

  const vramSegments = [
    { label: 'Linux Mint & Display', mb: allocation.osAndDisplayMb, color: 'bg-slate-600' },
    { label: 'Atenção & Router (GPU)', mb: allocation.attentionAndSharedWeightsMb, color: 'bg-sky-500' },
    ...(allocation.hotMoeExpertsVramMb > 0
      ? [{ label: 'Hot MoE Experts (GPU)', mb: allocation.hotMoeExpertsVramMb, color: 'bg-blue-600' }]
      : []),
    { label: `KV Cache (${kvType})`, mb: allocation.kvCacheVramMb, color: 'bg-cyan-400' },
    { label: 'Compute Buffer', mb: allocation.computeBufferMb, color: 'bg-indigo-500' }
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6 max-w-7xl mx-auto w-full futuristic-grid-bg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-500/20 pb-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight font-display">
            Motor RTX 3060 Ti (8GB GDDR6) & Seletor de Arquiteturas AI / MoE
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Algoritmo híbrido Hot-Expert VRAM-Shield + Speculative Voice para Ryzen 7 5800X + RTX 3060 Ti (448 GB/s) + 32GB DDR4
          </p>
        </div>

        {/* Dynamic Reasoning Mode Selector */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#040915] border border-sky-500/30 rounded-xl">
          <button
            type="button"
            onClick={() => onSelectReasoningMode('voice_instant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              reasoningMode === 'voice_instant'
                ? 'bg-sky-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            Voz Instantânea (/no_think)
          </button>
          <button
            type="button"
            onClick={() => onSelectReasoningMode('hybrid_smart')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              reasoningMode === 'hybrid_smart'
                ? 'bg-sky-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Híbrido Auto (Voz + Texto)
          </button>
          <button
            type="button"
            onClick={() => onSelectReasoningMode('deep_reasoning')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              reasoningMode === 'deep_reasoning'
                ? 'bg-sky-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Raciocínio Profundo (CoT)
          </button>
        </div>
      </div>

      {/* SECTION 1: REAL-TIME 8192MB VRAM ALLOCATION & ALGORITHM TELEMETRY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: VRAM 8192MB Interactive Calculator (7 Cols) */}
        <section className="lg:col-span-7 rounded-2xl p-5 flex flex-col justify-between gap-5 futuristic-card">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-sky-400 font-semibold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Modelo Ativo: {activeModel.name}</span>
                </div>
                <h2 className="text-base font-semibold text-slate-100 mt-1">
                  Orçamento Exato dos 8192 MB GDDR6 (RTX 3060 Ti)
                </h2>
              </div>

              <div className="text-right font-mono">
                <div className={`text-lg font-bold tabular-nums ${allocation.isOomRisk ? 'text-rose-400' : 'text-sky-400'}`}>
                  {allocation.usedVramMb} / 8192 MB
                </div>
                <div className={`text-[11px] tabular-nums ${allocation.isOomRisk ? 'text-rose-400 font-semibold' : 'text-emerald-400'}`}>
                  {allocation.isOomRisk
                    ? 'ALERTA OOM: Sobe --n-cpu-moe para 34–35!'
                    : `${allocation.freeVramMb} MB Margem Livre Anti-OOM`}
                </div>
              </div>
            </div>

            {/* Stacked VRAM Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-4 bg-slate-950 rounded-lg overflow-hidden border border-sky-500/25 flex">
                {vramSegments.map((seg, i) => {
                  const pct = Math.max(2, (seg.mb / 8192) * 100);
                  return (
                    <div
                      key={i}
                      style={{ width: `${pct}%` }}
                      className={`${seg.color} h-full transition-all duration-300 border-r border-slate-950/60`}
                      title={`${seg.label}: ${seg.mb} MB`}
                    />
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
                {vramSegments.map((seg, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-xs ${seg.color} inline-block`} />
                    <span className="text-slate-400">{seg.label}:</span>
                    <span className="font-mono text-slate-100 tabular-nums">{seg.mb} MB</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Tuning Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-sky-500/15 text-xs">
              {activeModel.architecture === 'MoE Híbrido' ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Offload CPU (--n-cpu-moe):</span>
                    <span className="font-mono text-sky-400 font-semibold tabular-nums">
                      {customNCpuMoe} camadas
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Camadas MoE em CPU"
                    min={30}
                    max={40}
                    value={customNCpuMoe}
                    onChange={(e) => setCustomNCpuMoe(Number(e.target.value))}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                  <div className="text-[11px] text-slate-400">
                    Seguro RTX 3060 Ti: <strong className="text-sky-300">34–35</strong> (&lt;33 excede 8GB VRAM)
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-slate-400 block">Alocação de Pesos:</span>
                  <span className="font-mono text-sky-300 font-semibold block">
                    {activeModel.architecture} (-ngl {activeModel.defaultNgl})
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    Pesos densos nos 448 GB/s da GPU
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-slate-400 block">Janela de Contexto (-c):</span>
                <select
                  aria-label="Janela de contexto em tokens"
                  value={customCtx}
                  onChange={(e) => setCustomCtx(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#040915] border border-sky-500/25 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                >
                  <option value={8192}>8 192 tokens (Ultra-Leve)</option>
                  <option value={16384}>16 384 tokens (Ideal Estúdio)</option>
                  <option value={32768}>32 768 tokens (Projetos Longos)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-slate-400 block">Quantização KV Cache:</span>
                <select
                  aria-label="Quantização da KV Cache"
                  value={kvType}
                  onChange={(e) => setKvType(e.target.value as 'q8_0' | 'q4_0' | 'f16')}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#040915] border border-sky-500/25 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                >
                  <option value="q8_0">q8_0 (Zero Perda · Recomendado)</option>
                  <option value="q4_0">q4_0 (Poupa 340MB VRAM)</option>
                  <option value="f16">f16 (Sem Compressão)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Performance Output Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-sky-500/15">
            <div>
              <span className="text-[11px] text-slate-400 block">Velocidade Estimada</span>
              <span className="text-lg font-bold font-mono text-sky-400 tabular-nums">
                {allocation.estimatedTokPerSec} tok/s
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Latência 1.º Token Voz</span>
              <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                ~{allocation.estimatedTtftMs} ms
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">RAM DDR4 Usada</span>
              <span className="text-sm font-semibold font-mono text-slate-100 tabular-nums mt-1 block">
                {allocation.systemRamUsedGb} / 32 GB
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Barramento PCIe 4.0</span>
              <span className="text-xs font-mono text-sky-200 mt-1 block">
                {allocation.pcieBottleneckRisk}
              </span>
            </div>
          </div>
        </section>

        {/* Right: Generated llama.cpp Command & Algorithm Explanation (5 Cols) */}
        <section className="lg:col-span-5 rounded-2xl p-5 flex flex-col justify-between gap-4 futuristic-card">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Comando Otimizado llama-server (RTX 3060 Ti)
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="px-3 py-1 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCmd ? 'Copiado!' : 'Copiar Comando'}
              </button>
            </div>

            <pre className="p-3.5 rounded-xl bg-[#03060e] border border-sky-500/25 font-mono text-[11px] text-sky-200 overflow-x-auto leading-relaxed select-all">
              <code>{allocation.generatedCommand}</code>
            </pre>

            <div className="space-y-2 pt-1 text-xs text-slate-300">
              <div className="font-semibold text-sky-400">
                Como funciona o Algoritmo Híbrido para a tua RTX 3060 Ti:
              </div>
              <p className="leading-relaxed text-slate-300 text-[11.5px]">
                1. <strong>Atenção + 22 Camadas MoE em GDDR6 (448 GB/s):</strong> Todas as matrizes Q/K/V, Router MoE e 22 blocos de especialistas ficam residentes nos 8GB da placa gráfica com Flash-Attention (<code>-fa on</code>) e KV Cache <code>{kvType}</code>.
              </p>
              <p className="leading-relaxed text-slate-300 text-[11.5px]">
                2. <strong>Fast-Voice Switch (/no_think):</strong> No Modo Voz Direto, o J.A.R.V.I.S. salta cadeias longas silenciosas e emite a 1.ª cláusula natural com menos de 10 palavras para o TTS falar em <strong>~{allocation.estimatedTtftMs}ms</strong>.
              </p>
            </div>
          </div>

          {onTestModelPrompt && (
            <div className="pt-2 border-t border-sky-500/15 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onTestModelPrompt(
                    `Explica-me em voz natural porque é que o modelo ${activeModel.name} com --n-cpu-moe ${customNCpuMoe} é ideal para a minha RTX 3060 Ti.`,
                    true
                  )
                }
                className="flex-1 py-2 px-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Testar Este Motor em Voz Agora
              </button>
            </div>
          )}
        </section>
      </div>

      {/* SECTION 2: CATÁLOGO DE MODELOS & RECOMENDAÇÕES INTERATIVAS */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Modelos & Arquiteturas Recomendadas para a tua RTX 3060 Ti + 32GB RAM
            </h2>
            <p className="text-xs text-slate-400">
              Seleciona qualquer arquitetura abaixo para ativar no J.A.R.V.I.S. e recalcular o perfil de VRAM/RAM
            </p>
          </div>

          {/* Filter by Architecture */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#040915] border border-sky-500/25 rounded-lg text-xs">
            {['all', 'MoE Híbrido', '100% GPU Resident', 'Speculative Decoding', 'Deep CoT Reasoning'].map(
              (arch) => (
                <button
                  key={arch}
                  type="button"
                  onClick={() => setFilterArch(arch)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filterArch === arch
                      ? 'bg-sky-500/25 text-sky-300 border border-sky-400/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {arch === 'all' ? 'Todos (5)' : arch}
                </button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredModels.map((model) => {
            const isSelected = model.id === activeModel.id;
            return (
              <div
                key={model.id}
                onClick={() => handleSelectModelCard(model)}
                className={`rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all cursor-pointer futuristic-card ${
                  isSelected
                    ? 'border-2 border-sky-400 shadow-[0_0_30px_rgba(14,165,233,0.22)]'
                    : 'hover:border-sky-500/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono text-sky-400 font-semibold">
                        {model.badge} · {model.architecture}
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                        {model.name}
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Ideal para: <span className="text-slate-200">{model.recommendedFor}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectModelCard(model);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-400 text-slate-950'
                          : 'bg-[#071226] hover:bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {isSelected ? 'Ativo no Jarvis' : 'Ativar Modelo'}
                    </button>
                  </div>

                  {/* Specs Strip */}
                  <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-[#03060e]/90 border border-sky-500/20 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Parâmetros</span>
                      <span className="text-slate-100 font-semibold">{model.activeParams}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Voz (Tok/s)</span>
                      <span className="text-emerald-400 font-semibold tabular-nums">
                        {model.voiceTokPerSec} tok/s
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">VRAM / RAM</span>
                      <span className="text-sky-300 font-semibold tabular-nums">
                        {(model.vramMb / 1024).toFixed(1)}G / {(model.ramMb / 1024).toFixed(1)}G
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Raciocínio</span>
                      <span className="text-sky-200 font-semibold tabular-nums">
                        {model.reasoningScore}/100
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{model.descriptionPt}</p>
                  <p className="text-xs text-sky-200/95 leading-relaxed bg-sky-950/35 border border-sky-500/25 rounded-lg p-2.5">
                    <strong>Vantagem na tua RTX 3060 Ti:</strong> {model.whyBetterPt}
                  </p>
                </div>

                <div className="pt-2 border-t border-sky-500/15 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="truncate">Ficheiro: {model.ggufFilename}</span>
                  <span className="text-sky-300 shrink-0">TTFT Voz: ~{model.ttftVoiceMs}ms</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
