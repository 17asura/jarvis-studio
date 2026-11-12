import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Layers,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  FileCode2,
  Volume2
} from 'lucide-react';
import { ExtractedFact, MemorySection } from '../utils/jarvisLogic';

interface InstantMemoryViewProps {
  coreMemoryMd: string;
  setCoreMemoryMd: (md: string) => void;
  sections: MemorySection[];
  corrections: Record<string, string>;
  recentExtractions: ExtractedFact[];
  onSaveMarkdown: (md: string) => Promise<void>;
  onTestInstantExtraction: (sentence: string) => Promise<void>;
  onLearnWord: (wrong: string, right: string) => Promise<void>;
  onDeleteWord: (wrong: string) => Promise<void>;
}

export const InstantMemoryView: React.FC<InstantMemoryViewProps> = ({
  coreMemoryMd,
  setCoreMemoryMd,
  sections,
  corrections,
  recentExtractions,
  onSaveMarkdown,
  onTestInstantExtraction,
  onLearnWord,
  onDeleteWord
}) => {
  const [testPhrase, setTestPhrase] = useState(
    'Jarvis, lembra-te que o servidor de backups no Ubuntu-Homelab corre na porta 8090.'
  );
  const [wrongWord, setWrongWord] = useState('');
  const [rightWord, setRightWord] = useState('');
  const [saveToast, setSaveToast] = useState('');
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

  const handleTriggerSimulator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhrase.trim()) return;
    await onTestInstantExtraction(testPhrase.trim());
    setSaveToast('Facto extraído e injetado em < 1ms na Memória Central!');
    setTimeout(() => setSaveToast(''), 3500);
  };

  const handleSaveMd = async () => {
    await onSaveMarkdown(coreMemoryMd);
    setSaveToast('Ficheiro core_memory.md guardado com sucesso.');
    setTimeout(() => setSaveToast(''), 3000);
  };

  const handleAddCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wrongWord.trim() || !rightWord.trim()) return;
    await onLearnWord(wrongWord.trim(), rightWord.trim());
    setWrongWord('');
    setRightWord('');
    setSaveToast('Correção fonética adicionada ao dicionário STT.');
    setTimeout(() => setSaveToast(''), 3000);
  };

  const architectureLayers = [
    {
      index: '01. Camada L1 — Interceção & Router Léxico/Semântico (< 1ms)',
      subtitle: 'Zero-Latency Working Memory Capture',
      desc: 'Analisa cada frase dita por voz ou texto antes mesmo do LLM terminar de gerar o primeiro token. Deteta gatilhos explícitos ("lembra-te que...", "memoriza que...", "aponta que..."), factos implícitos de infraestrutura/estudo e comandos fonéticos ("quando eu disser X escreve Y") sem bloquear a GPU.'
    },
    {
      index: '02. Camada L2 — Classificação & Desduplicação Estruturada (core_memory.md)',
      subtitle: 'Auto-Categorized Persistent Markdown Store',
      desc: 'Classifica o facto extraído na secção correta (Identidade & Perfil, Hardware & Infraestrutura Local, Projetos Ativos & Stack, Preferências ou Factos Aprendidos), verifica duplicados case-insensitive e grava atomicamente em disco com carimbo de data.'
    },
    {
      index: '03. Camada L3 — Injeção Dinâmica de Contexto & Sensores Domésticos',
      subtitle: 'Real-Time Context Fusion (Memory + Weather/GPS + Router + Homelab)',
      desc: 'Em cada turno de conversação, funde a memória L2 com o snapshot em tempo real da meteorologia Open-Meteo/GPS, o caudal Mbps/Ping do router Fibra e a telemetria das máquinas Tailscale, permitindo respostas imediatas sem latência de tool-calling lento.'
    },
    {
      index: '04. Camada L4 — Registo Episódico & Adaptação Fonética PT-PT',
      subtitle: 'Episodic Log (episodic_log.md) & Phonetic STT Dictionary (stt_corrections.json)',
      desc: 'Arquiva o histórico cronológico completo em episodic_log.md e aplica correções fonéticas longest-match-first sobre a transcrição Faster-Whisper / Gemini Transcribe para siglas técnicas (IPCA, C#, AppRAN, RTX 3060 Ti).'
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            Plano & Motor de Memória Instantânea do J.A.R.V.I.S.
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Arquitetura de 4 Camadas (Zero-Latency L1–L4) inspirada na memória em tempo real do ChatGPT Voice
          </p>
        </div>
        {saveToast && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveToast}</span>
          </div>
        )}
      </div>

      {/* SECTION 1: PLANO ARQUITETURAL L1-L4 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            Arquitetura da Lógica de Memória Instantânea (L1 → L4)
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            Latência de Extração: &lt; 0.8 ms · Zero VRAM Overhead
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {architectureLayers.map((layer, i) => (
            <div
              key={i}
              className="rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 space-y-2"
            >
              <div className="text-sm font-semibold text-sky-400">{layer.index}</div>
              <div className="text-xs font-mono text-slate-400">{layer.subtitle}</div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">{layer.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: SIMULADOR INTERATIVO DE EXTRAÇÃO EM TEMPO REAL */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Testador em Direto do Motor de Extração Instantânea (Camada L1 → L2)
            </h2>
            <p className="text-xs text-slate-400">
              Escreve uma frase com um comando de memória ou facto pessoal para testar a classificação automática na memória central
            </p>
          </div>
        </div>

        <form onSubmit={handleTriggerSimulator} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            aria-label="Frase para testar extração de memória"
            value={testPhrase}
            onChange={(e) => setTestPhrase(e.target.value)}
            placeholder="Ex: Jarvis, lembra-te que tenho exame de Sistemas Distribuídos no dia 24..."
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Extrair & Memorizar Agora
          </button>
        </form>

        {recentExtractions.length > 0 && (
          <div className="pt-2 border-t border-slate-800/70">
            <div className="text-xs text-slate-400 mb-2">
              Últimos Factos Capturados Automaticamente:
            </div>
            <div className="space-y-1.5">
              {recentExtractions.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="text-xs flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-slate-950/70 border border-slate-800/70"
                >
                  <div className="text-slate-200">
                    <span className="text-sky-400 font-medium">{item.category}</span>
                    <span className="text-slate-500"> · </span>
                    <span>{item.fact}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{item.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: EXPLORADOR ESTRUTURADO / EDITOR MARKDOWN & DICIONÁRIO FONÉTICO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Core Memory Explorer / Editor (8 Cols) */}
        <section className="lg:col-span-8 rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-sky-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Memória Central Persistente (core_memory.md)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('structured')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'structured'
                      ? 'bg-slate-800 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vista por Categorias
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    viewMode === 'raw'
                      ? 'bg-slate-800 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode2 className="w-3 h-3" />
                  Editor Markdown (.MD)
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveMd}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                Guardar .MD
              </button>
            </div>
          </div>

          {viewMode === 'structured' ? (
            <div className="space-y-4">
              {sections.map((sec, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-sky-400 tracking-wide">
                      {sec.title}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {sec.items.length} {sec.items.length === 1 ? 'registo' : 'registos'}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {sec.items.map((item, ii) => (
                      <li key={ii} className="leading-relaxed flex items-start gap-2">
                        <span className="text-slate-500 select-none">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <textarea
              aria-label="Editor Markdown da Memória Central"
              value={coreMemoryMd}
              onChange={(e) => setCoreMemoryMd(e.target.value)}
              spellCheck={false}
              className="w-full h-96 p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-200 leading-relaxed focus:outline-none focus:border-sky-400 resize-y"
            />
          )}
        </section>

        {/* Phonetic STT Corrections Dictionary (4 Cols) */}
        <section className="lg:col-span-4 rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-sky-400" />
              Dicionário Fonético PT-PT (STT)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Corrige automaticamente palavras ouvidas pelo microfone antes de enviar ao J.A.R.V.I.S.
            </p>
          </div>

          <form onSubmit={handleAddCorrection} className="space-y-2.5">
            <input
              type="text"
              aria-label="Palavra ouvida errada pelo microfone"
              placeholder="Ouvido errado (ex: jarbas)"
              value={wrongWord}
              onChange={(e) => setWrongWord(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
            />
            <input
              type="text"
              aria-label="Substituição correta"
              placeholder="Termo correto (ex: Jarvis)"
              value={rightWord}
              onChange={(e) => setRightWord(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-sky-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Regra Fonética
            </button>
          </form>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70 border-t border-slate-800/80 pt-2">
            {Object.entries(corrections).map(([wrong, right]) => (
              <div key={wrong} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="font-mono truncate">
                  <span className="text-rose-300">“{wrong}”</span>
                  <span className="text-slate-500"> → </span>
                  <span className="text-emerald-300">“{right}”</span>
                </div>
                <button
                  type="button"
                  aria-label={`Remover correção ${wrong}`}
                  onClick={() => onDeleteWord(wrong)}
                  className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
