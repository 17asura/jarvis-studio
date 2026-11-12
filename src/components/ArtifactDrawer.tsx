import React from 'react';
import { Code2, Eye, Play, Copy, X, FastForward, Check } from 'lucide-react';

export interface CodeArtifact {
  id: string;
  title: string;
  lang: string;
  code: string;
  isClosed: boolean;
}

interface ArtifactDrawerProps {
  artifact: CodeArtifact | null;
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'code' | 'preview' | 'run';
  setActiveTab: (t: 'code' | 'preview' | 'run') => void;
  consoleOutput: string;
  isStreaming: boolean;
  onRunArtifact: () => void;
  onContinueCutArtifact: () => void;
  codeScrollRef: React.MutableRefObject<HTMLPreElement | null>;
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({
  artifact,
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  consoleOutput,
  isStreaming,
  onRunArtifact,
  onContinueCutArtifact,
  codeScrollRef
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !artifact) return null;

  const isIncomplete =
    !isStreaming &&
    (!artifact.isClosed ||
      (artifact.lang.toLowerCase() === 'html' && !/<\/html>/i.test(artifact.code)));

  const buildSafePreviewHtml = (art: CodeArtifact) => {
    const code = art.code || '';
    const hasStyleOpen = /<style[^>]*>/i.test(code);
    const hasStyleClose = /<\/style>/i.test(code);
    if (hasStyleOpen && !hasStyleClose) {
      return (
        code +
        "</style></head><body style='background:#090d16;color:#f59e0b;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;'><div><h2>Código cortado dentro de &lt;style&gt;</h2><p style='color:#94a3b8;margin-top:10px;'>Usa o botão Continuar Código no topo do painel para concluir o ficheiro.</p></div></body></html>"
      );
    }
    return code;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section
      aria-label="Painel de Artefacto de Código"
      className="w-full lg:w-[46%] max-w-[680px] bg-slate-950 border-l border-slate-800/90 flex flex-col z-40 fixed inset-0 lg:static"
    >
      {/* Artifact Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="truncate">
            <span className="text-xs font-semibold text-sky-400">{artifact.title}</span>
            <span className="text-xs text-slate-500"> · </span>
            <span className="text-xs font-mono text-slate-400">{artifact.lang.toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-sky-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Código
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-sky-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              type="button"
              onClick={onRunArtifact}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                activeTab === 'run'
                  ? 'bg-sky-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Executar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isIncomplete && (
            <button
              type="button"
              onClick={onContinueCutArtifact}
              className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
              Continuar Código
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            type="button"
            aria-label="Fechar painel de artefacto"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Artifact Body */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'code' && (
          <pre
            ref={codeScrollRef}
            className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-sky-100 bg-[#050811] m-0 select-all"
          >
            <code>{artifact.code}</code>
          </pre>
        )}
        {activeTab === 'preview' && (
          <iframe
            className="flex-1 w-full border-none bg-white"
            sandbox="allow-scripts allow-modals allow-same-origin"
            srcDoc={buildSafePreviewHtml(artifact)}
            title="Pré-visualização do Artefacto"
          />
        )}
        {activeTab === 'run' && (
          <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-[#04070e] text-emerald-400 whitespace-pre-wrap">
            {consoleOutput}
          </div>
        )}
      </div>
    </section>
  );
};
