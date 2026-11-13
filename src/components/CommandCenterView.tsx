import React, { useState } from 'react';
import {
  MapPin,
  Wind,
  Droplets,
  Wifi,
  Activity,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Power,
  Terminal,
  Compass,
  Gauge,
  MessageSquare,
  Radar,
  ShieldCheck,
  ShieldAlert,
  Search,
  Globe,
  ExternalLink,
  Route,
  Radio
} from 'lucide-react';
import { FullSystemTelemetry, VerifiedWebSource } from '../utils/jarvisLogic';

export type DeviceNetworkAction =
  | 'ping'
  | 'port_scan'
  | 'wake_on_lan'
  | 'traceroute'
  | 'http_banner'
  | 'toggle_trust'
  | 'toggle_power';

interface CommandCenterViewProps {
  telemetry: FullSystemTelemetry | null;
  onRefreshTelemetry: () => Promise<void>;
  onUpdateLocation: (lat: number, lon: number, name: string) => Promise<void>;
  onRunSpeedTest: () => Promise<void>;
  onScanNetwork: (targetIp?: string) => Promise<string>;
  onMachineAction: (machineId: string, action: DeviceNetworkAction) => Promise<string>;
  onVerifyWebTopic: (query: string) => Promise<{
    query: string;
    sources: VerifiedWebSource[];
    dossier: string;
    verifiedAt: string;
  } | null>;
  onAskJarvisAbout: (prompt: string) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  telemetry,
  onRefreshTelemetry,
  onUpdateLocation,
  onRunSpeedTest,
  onScanNetwork,
  onMachineAction,
  onVerifyWebTopic,
  onAskJarvisAbout
}) => {
  const [speedTesting, setSpeedTesting] = useState(false);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [customIpToProbe, setCustomIpToProbe] = useState('');
  const [locLoading, setLocLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [runningMachineId, setRunningMachineId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('darque');

  // Estado do Motor de Fact-Checking & Notícias Verificadas
  const [factQuery, setFactQuery] = useState('Últimas notícias em Portugal e tecnologia');
  const [factLoading, setFactLoading] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<{
    query: string;
    sources: VerifiedWebSource[];
    dossier: string;
    verifiedAt: string;
  } | null>(null);

  if (!telemetry) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-slate-400 text-sm">
        A sincronizar scanner de rede ARP/TCP, router, GPS e máquinas do homelab...
      </div>
    );
  }

  const { weather, network, machines } = telemetry;

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setActionFeedback('Geolocalização não suportada neste navegador.');
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        await onUpdateLocation(lat, lon, `GPS Direto (${lat}, ${lon})`);
        setSelectedPreset('gps');
        setLocLoading(false);
        setActionFeedback(`Coordenadas GPS atualizadas para (${lat}, ${lon}).`);
      },
      async () => {
        setLocLoading(false);
        setActionFeedback('Permissão GPS recusada ou indisponível — mantida estação de Viana do Castelo.');
      },
      { timeout: 5000 }
    );
  };

  const handleSelectPresetLocation = async (preset: string) => {
    setSelectedPreset(preset);
    setLocLoading(true);
    if (preset === 'darque') {
      await onUpdateLocation(41.6844, -8.7956, 'Darque, Viana do Castelo, PT');
    } else if (preset === 'barcelos') {
      await onUpdateLocation(41.5388, -8.6151, 'IPCA Campus, Barcelos, PT');
    } else if (preset === 'porto') {
      await onUpdateLocation(41.1579, -8.6291, 'Porto Centro, PT');
    }
    setLocLoading(false);
  };

  const handleTriggerSpeedtest = async () => {
    setSpeedTesting(true);
    setActionFeedback(`A executar teste de largura de banda Fibra no Gateway ${network.gatewayIp}...`);
    await onRunSpeedTest();
    setSpeedTesting(false);
    setActionFeedback('Teste de velocidade Fibra concluído com sucesso.');
  };

  const handleRunFullNetworkScan = async (ipOverride?: string) => {
    setScanningNetwork(true);
    const target = ipOverride !== undefined ? ipOverride.trim() : undefined;
    setActionFeedback(
      target
        ? `A sondar IP ${target} (ICMP Ping + Port Scan TCP + Tabela ARP)...`
        : `A fazer scan à sub-rede ${network.subnetCidr || '192.168.1.0/24'} (ARP Kernel + Tailscale + Portas TCP)...`
    );
    const msg = await onScanNetwork(target || undefined);
    setScanningNetwork(false);
    if (target) setCustomIpToProbe('');
    if (msg) setActionFeedback(msg);
  };

  const handleMachineCmd = async (machineId: string, action: DeviceNetworkAction) => {
    setRunningMachineId(`${machineId}:${action}`);
    const msg = await onMachineAction(machineId, action);
    setRunningMachineId(null);
    if (msg) setActionFeedback(msg);
  };

  const handleRunFactCheck = async (qOverride?: string) => {
    const q = (qOverride ?? factQuery).trim();
    if (!q) return;
    if (qOverride) setFactQuery(qOverride);
    setFactLoading(true);
    const res = await onVerifyWebTopic(q);
    if (res) {
      setVerifiedResult(res);
      setActionFeedback(
        `Verificação concluída: ${res.sources.length} fontes fidedignas validadas para "${res.query}".`
      );
    }
    setFactLoading(false);
  };

  // Preparar pontos do gráfico SVG de tráfego do router
  const hist = network.trafficHistory || [];
  const maxVal = Math.max(250, ...hist.map((h) => Math.max(h.downMbps, h.upMbps)));
  const svgW = 540;
  const svgH = 120;
  const downPoints = hist
    .map((h, i) => {
      const x = hist.length > 1 ? (i / (hist.length - 1)) * svgW : 0;
      const y = svgH - (h.downMbps / maxVal) * (svgH - 18) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const upPoints = hist
    .map((h, i) => {
      const x = hist.length > 1 ? (i / (hist.length - 1)) * svgW : 0;
      const y = svgH - (h.upMbps / maxVal) * (svgH - 18) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-8 max-w-7xl mx-auto w-full futuristic-grid-bg">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-500/20 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight font-display">
            Scanner de Rede Real, Fact-Checking & Telemetria Doméstica
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspeção ARP/TCP de dispositivos ligados com ações diretas e verificação cruzada de notícias e pessoas sem desinformação
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleRunFullNetworkScan()}
            disabled={scanningNetwork}
            className="px-3.5 py-2 rounded-lg bg-[#071022] hover:bg-slate-800 border border-sky-500/35 text-xs font-semibold text-sky-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Radar className={`w-3.5 h-3.5 text-sky-400 ${scanningNetwork ? 'animate-spin' : ''}`} />
            {scanningNetwork ? 'A fazer Scan à Rede...' : 'Fazer Scan à Rede Agora'}
          </button>
          <button
            type="button"
            onClick={onRefreshTelemetry}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            Sincronizar Sensores
          </button>
          <button
            type="button"
            onClick={() =>
              onAskJarvisAbout(
                'Jarvis, faz-me um relatório falado completo dos dispositivos detetados no scan de rede, do tráfego atual do router e do tempo em Viana.'
              )
            }
            className="px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Relatório por Voz
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-400/35 text-xs text-sky-200 font-mono flex items-center justify-between gap-3">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback('')}
            className="text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* SECTION 1: SCANNER DE REDE REAL (ARP / NMAP / PORTAS TCP) & CONTROLADOR MULTI-AÇÃO */}
      <section className="space-y-4">
        <div className="rounded-xl futuristic-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-sky-400 font-mono">
                <Radar className="w-4 h-4" />
                <span>MOTOR DE DESCOBERTA LAN · ARP KERNEL (/proc/net/arp) + SOCKET PORT SCANNER + TAILSCALE</span>
              </div>
              <h2 className="text-base font-semibold text-slate-100 mt-1">
                Dispositivos Ligados na Rede & Ações Diretas ({machines.length} equipamentos)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sub-rede ativa: <span className="font-mono text-slate-200">{network.subnetCidr || '192.168.1.0/24'}</span> · Gateway:{' '}
                <span className="font-mono text-slate-200">{network.gatewayIp}</span> · Último Scan:{' '}
                <span className="font-mono text-sky-300">{network.lastScanTime || 'Agora'}</span>
              </p>
            </div>

            {/* Sondar / Adicionar IP Específico na Rede */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customIpToProbe.trim()) {
                  handleRunFullNetworkScan(customIpToProbe);
                }
              }}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <input
                type="text"
                aria-label="Sondar IP específico na rede"
                placeholder="Sondar IP (ex: 192.168.1.254)"
                value={customIpToProbe}
                onChange={(e) => setCustomIpToProbe(e.target.value)}
                className="flex-1 sm:w-52 px-3 py-1.5 rounded-lg bg-[#030711] border border-sky-500/30 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
              <button
                type="submit"
                disabled={scanningNetwork || !customIpToProbe.trim()}
                className="px-3 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Sondar IP
              </button>
            </form>
          </div>

          {/* Grelha de Dispositivos com 6 Ações Reais e Consola de Output */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {machines.map((m) => {
              const isOnline = m.status === 'online';
              const isTrusted = m.trustStatus !== 'blocked';
              const ramPercent = Math.round((m.ramUsedGb / Math.max(1, m.ramTotalGb)) * 100);
              const vramPercent =
                m.vramUsedMb && m.vramTotalMb ? Math.round((m.vramUsedMb / m.vramTotalMb) * 100) : null;

              return (
                <div
                  key={m.id}
                  className={`rounded-xl bg-[#040916]/90 border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all ${
                    isTrusted ? 'border-sky-500/25' : 'border-rose-500/50 bg-rose-950/10'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Server className="w-4 h-4 text-sky-400 shrink-0" />
                          <h3 className="text-sm font-semibold text-slate-100 truncate">{m.name}</h3>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isTrusted
                                ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {isTrusted ? 'CONFIÁVEL' : 'ISOLADO / BLOQUEADO'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {m.role} · {m.os}
                        </div>
                        <div className="text-xs font-mono text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>IP: {m.ip}</span>
                          <span>MAC: {m.macAddress || '04:42:1A:8F:3C:10'}</span>
                          {m.iface && <span>NIC: {m.iface}</span>}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          Fabricante OUI: <span className="text-sky-300">{m.vendor || 'IEEE 802 Verificado'}</span> · Via:{' '}
                          {m.discoveryMethod || 'ARP + Port Scan'}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isOnline ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {isOnline ? 'ONLINE' : 'EM SUSPENSÃO'}
                        </span>
                        <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
                          {m.tempC}°C · {m.uptime}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 font-mono bg-[#02050c] px-3 py-1.5 rounded-lg border border-sky-500/15">
                      {m.specs}
                    </div>

                    {/* Resource Progress Bars */}
                    <div className="space-y-2 pt-1 text-xs">
                      <div>
                        <div className="flex justify-between font-mono text-slate-300 mb-1">
                          <span className="flex items-center gap-1.5 text-slate-400 font-sans">
                            <Cpu className="w-3.5 h-3.5 text-sky-400" /> Carga CPU
                          </span>
                          <span className="tabular-nums">{m.cpuPercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-400 transition-all duration-300"
                            style={{ width: `${m.cpuPercent}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-mono text-slate-300 mb-1">
                          <span className="flex items-center gap-1.5 text-slate-400 font-sans">
                            <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> Memória RAM
                          </span>
                          <span className="tabular-nums">
                            {m.ramUsedGb} / {m.ramTotalGb} GB ({ramPercent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 transition-all duration-300"
                            style={{ width: `${ramPercent}%` }}
                          />
                        </div>
                      </div>

                      {vramPercent !== null && (
                        <div>
                          <div className="flex justify-between font-mono text-slate-300 mb-1">
                            <span className="flex items-center gap-1.5 text-slate-400 font-sans">
                              <Activity className="w-3.5 h-3.5 text-amber-400" /> {m.gpuName} VRAM
                            </span>
                            <span className="tabular-nums">
                              {m.vramUsedMb} / {m.vramTotalMb} MB ({m.gpuUtilPercent}% GPU)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 transition-all duration-300"
                              style={{ width: `${vramPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Active TCP Ports & Services */}
                    <div className="pt-2 border-t border-slate-800/70">
                      <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Portas TCP Abertas & Serviços Detetados:</span>
                        <span className="font-mono text-sky-400">{m.services.length} ativos</span>
                      </div>
                      <div className="space-y-1 text-xs font-mono">
                        {m.services.map((srv, idx) => (
                          <div key={idx} className="flex items-center justify-between text-slate-300">
                            <span className="truncate">{srv.name}</span>
                            <span className="text-sky-300 tabular-nums shrink-0">
                              {srv.port > 0 ? `:${srv.port}/tcp · OPEN` : 'ICMP · OK'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Consola de Output da Última Ação Executada no Dispositivo */}
                    {m.lastActionOutput && (
                      <div className="p-2.5 rounded-lg bg-[#02050b] border border-sky-500/30 font-mono text-[11px] text-sky-200 whitespace-pre-wrap max-h-36 overflow-y-auto">
                        {m.lastActionOutput}
                      </div>
                    )}
                  </div>

                  {/* 6 Ações Reais de Rede para cada Dispositivo */}
                  <div className="pt-3 border-t border-slate-800/80 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                      <span>
                        Caudal: <strong className="text-sky-400">{m.netDownMbps} Mbps ↓</strong> ·{' '}
                        <strong className="text-emerald-400">{m.netUpMbps} Mbps ↑</strong>
                      </span>
                      <span>Tailscale: {m.tailscaleIp}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'ping')}
                        disabled={runningMachineId === `${m.id}:ping`}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-sky-500/20 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Terminal className="w-3 h-3 text-sky-400 shrink-0" />
                        <span>Ping ICMP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'port_scan')}
                        disabled={runningMachineId === `${m.id}:port_scan`}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-sky-500/20 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Radar className="w-3 h-3 text-sky-400 shrink-0" />
                        <span>Scan Portas</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'wake_on_lan')}
                        disabled={runningMachineId === `${m.id}:wake_on_lan`}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-sky-500/20 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Radio className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Wake-on-LAN</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'traceroute')}
                        disabled={runningMachineId === `${m.id}:traceroute`}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-sky-500/20 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Route className="w-3 h-3 text-sky-400 shrink-0" />
                        <span>Traceroute</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'http_banner')}
                        disabled={runningMachineId === `${m.id}:http_banner`}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-sky-500/20 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Banner HTTP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMachineCmd(m.id, 'toggle_trust')}
                        disabled={runningMachineId === `${m.id}:toggle_trust`}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer border ${
                          isTrusted
                            ? 'bg-slate-800/90 hover:bg-rose-950/50 border-slate-700 text-slate-200'
                            : 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {isTrusted ? (
                          <>
                            <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>Bloquear</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Autorizar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 2: MOTOR DE FACT-CHECKING & NOTÍCIAS/PESSOAS EM TEMPO REAL (ANTI-FAKE NEWS) */}
      <section className="rounded-xl futuristic-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-sky-400 font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>VERIFICADOR CRUZADO DE INFORMAÇÃO · GOOGLE NEWS RSS + WIKIPEDIA PT/EN + FILTRO ANTI-BOATOS</span>
            </div>
            <h2 className="text-base font-semibold text-slate-100 mt-1">
              Pesquisa Verificada de Notícias Atuais, Pessoas & Factos Fidedignos
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Filtra automaticamente clickbait e desinformação, atribuindo índice de confiança (Tier 1 Oficial / Tier 2 Imprensa) antes de o J.A.R.V.I.S. responder.
            </p>
          </div>
        </div>

        {/* Barra de Pesquisa de Factos / Pessoas / Notícias */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRunFactCheck();
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#030711] border border-sky-500/30">
            <Search className="w-4 h-4 text-sky-400 shrink-0" />
            <input
              type="text"
              aria-label="Pesquisar notícias verificadas ou pessoa"
              placeholder="Escreve qualquer pessoa, notícia ou tema (ex: Cristiano Ronaldo, Economia Portugal, NVIDIA)..."
              value={factQuery}
              onChange={(e) => setFactQuery(e.target.value)}
              className="w-full bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={factLoading}
            className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            {factLoading ? 'A Verificar Fontes...' : 'Verificar Factos & Notícias'}
          </button>
        </form>

        {/* Sugestões Rápidas de Pessoas e Notícias */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px]">Testar verificação rápida:</span>
          {[
            'Últimas notícias em Portugal',
            'Cristiano Ronaldo',
            ' Marcelo Rebelo de Sousa',
            'Inteligência Artificial NVIDIA RTX',
            'Viana do Castelo atualidade'
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleRunFactCheck(preset.trim())}
              className="px-2.5 py-1 rounded-md bg-[#071022] hover:bg-slate-800 border border-sky-500/25 text-slate-300 hover:text-sky-300 text-[11px] cursor-pointer"
            >
              {preset.trim()}
            </button>
          ))}
        </div>

        {/* Resultados Verificados com Score de Fidedignidade */}
        {verifiedResult && (
          <div className="space-y-3 pt-2 border-t border-sky-500/20">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 font-medium">
                Dossier Verificado para <strong className="text-sky-300">“{verifiedResult.query}”</strong> às{' '}
                {verifiedResult.verifiedAt} ({verifiedResult.sources.length} fontes fidedignas aprovadas)
              </span>
              <button
                type="button"
                onClick={() =>
                  onAskJarvisAbout(
                    `Jarvis, com base nas fontes verificadas sobre "${verifiedResult.query}", resume-me os factos confirmados e as notícias mais recentes.`
                  )
                }
                className="px-3 py-1 rounded-lg bg-sky-400/20 hover:bg-sky-400/30 border border-sky-400/40 text-sky-300 font-semibold text-xs cursor-pointer"
              >
                Pedir Resumo ao Jarvis →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {verifiedResult.sources.map((src, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#030711]/90 border border-sky-500/25 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                        {src.trustScore}% Fidedigno · {src.trustTier}
                      </span>
                      <span className="text-slate-400 truncate">{src.publisher}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-100 leading-snug">{src.title}</div>
                    {src.snippet && src.snippet !== src.title && (
                      <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{src.snippet}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                    <span className="text-slate-400 font-mono">{src.publishedAt || 'Verificado'}</span>
                    <a
                      href={src.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      <span>Abrir Fonte Oficial</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: METEOROLOGIA & GPS + ROUTER & TRÁFEGO DE REDE (2-Column Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Weather & GPS Panel (5 Cols) */}
        <section className="lg:col-span-5 rounded-xl futuristic-card p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  <span>{weather.locationName}</span>
                </div>
                <h2 className="text-base font-semibold text-slate-100 mt-1">
                  Meteorologia & Coordenadas GPS
                </h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Lat {weather.latitude.toFixed(4)} · Lon {weather.longitude.toFixed(4)} · {weather.updatedAt}
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-bold font-mono text-slate-100 tabular-nums">
                  {weather.temperatureC}°C
                </div>
                <div className="text-xs text-sky-400 font-medium">{weather.conditionText}</div>
              </div>
            </div>

            {/* Location Selector Controls */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800/80 rounded-lg">
              <button
                type="button"
                onClick={() => handleSelectPresetLocation('darque')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedPreset === 'darque'
                    ? 'bg-slate-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Darque (Viana)
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetLocation('barcelos')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedPreset === 'barcelos'
                    ? 'bg-slate-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                IPCA (Barcelos)
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetLocation('porto')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedPreset === 'porto'
                    ? 'bg-slate-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Porto
              </button>
              <button
                type="button"
                onClick={handleUseBrowserGps}
                disabled={locLoading}
                className="ml-auto px-2.5 py-1.5 rounded-md text-xs font-medium text-sky-400 hover:bg-sky-500/10 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Compass className="w-3.5 h-3.5" />
                {locLoading ? 'A obter...' : 'Usar Meu GPS'}
              </button>
            </div>

            {/* Current Weather Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/70 text-xs">
              <div>
                <span className="text-slate-400 block">Sensação Térmica</span>
                <span className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                  {weather.apparentTemperatureC}°C
                </span>
              </div>
              <div>
                <span className="text-slate-400 flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-sky-400" /> Humidade
                </span>
                <span className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                  {weather.humidityPercent}%
                </span>
              </div>
              <div>
                <span className="text-slate-400 flex items-center gap-1">
                  <Wind className="w-3 h-3 text-sky-400" /> Vento
                </span>
                <span className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                  {weather.windSpeedKmh} km/h
                </span>
              </div>
            </div>

            {/* 5-Day Forecast Compact Table */}
            <div className="pt-2 border-t border-slate-800/70">
              <div className="text-xs font-medium text-slate-300 mb-2">
                Previsão Meteorológica (5 Dias — Open-Meteo)
              </div>
              <div className="divide-y divide-slate-800/60 text-xs">
                {weather.dailyForecast.map((day, idx) => (
                  <div key={idx} className="py-1.5 flex items-center justify-between gap-3">
                    <span className="font-mono text-slate-300 w-24 shrink-0 whitespace-nowrap">{day.date}</span>
                    <span className="text-slate-400 truncate flex-1">{day.conditionText}</span>
                    <span className="font-mono text-slate-400 w-16 text-right tabular-nums whitespace-nowrap shrink-0">
                      {day.precipProbPercent}% chuva
                    </span>
                    <span className="font-mono text-slate-100 w-28 text-right tabular-nums whitespace-nowrap shrink-0">
                      {day.tempMinC}° / {day.tempMaxC}°C
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <span>Fonte: {weather.source}</span>
            <button
              type="button"
              onClick={() =>
                onAskJarvisAbout(`Como está o tempo em ${weather.locationName} e devo levar casaco ou guarda-chuva?`)
              }
              className="text-sky-400 hover:underline cursor-pointer"
            >
              Perguntar ao Jarvis →
            </button>
          </div>
        </section>

        {/* Router & Home Internet Traffic Panel (7 Cols) */}
        <section className="lg:col-span-7 rounded-xl futuristic-card p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{network.routerModel}</span>
                  <span>·</span>
                  <span className="font-mono text-slate-300">Gateway {network.gatewayIp}</span>
                </div>
                <h2 className="text-base font-semibold text-slate-100 mt-1">
                  Tráfego do Router & Ligação Fibra em Tempo Real
                </h2>
                <div className="text-xs text-slate-400 mt-0.5">
                  {network.isp} · WAN <span className="font-mono text-slate-300">{network.wanIp}</span> · DNS{' '}
                  <span className="font-mono text-slate-300">{network.dnsPrimary}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerSpeedtest}
                disabled={speedTesting}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-sky-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Gauge className="w-3.5 h-3.5" />
                {speedTesting ? 'A testar Fibra...' : 'Testar Velocidade Fibra'}
              </button>
            </div>

            {/* Key Router Throughput Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-800/80">
              <div>
                <span className="text-xs text-slate-400 block">Download Atual</span>
                <span className="text-xl font-bold font-mono text-sky-400 tabular-nums whitespace-nowrap">
                  {network.downloadMbps} <span className="text-xs font-normal text-slate-400">Mbps</span>
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Upload Atual</span>
                <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums whitespace-nowrap">
                  {network.uploadMbps} <span className="text-xs font-normal text-slate-400">Mbps</span>
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Latência / Jitter</span>
                <span className="text-xl font-bold font-mono text-slate-100 tabular-nums whitespace-nowrap">
                  {network.pingMs} <span className="text-xs font-normal text-slate-400">ms</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono block whitespace-nowrap">
                  Jitter {network.jitterMs}ms · {network.packetLossPercent}% perda
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Tráfego Hoje / LAN</span>
                <span className="text-sm font-semibold font-mono text-slate-100 tabular-nums block mt-1 whitespace-nowrap">
                  {network.totalRxGbToday} GB ↓ / {network.totalTxGbToday} GB ↑
                </span>
                <span className="text-[11px] text-slate-400 block whitespace-nowrap">
                  {network.connectedDevicesCount} clientes verificados
                </span>
              </div>
            </div>

            {/* Real-Time SVG Bandwidth Chart */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Histórico de Caudal em Tempo Real (Download vs Upload)</span>
                <div className="flex items-center gap-4 font-mono text-[11px]">
                  <span className="text-sky-400">── Download (Mbps)</span>
                  <span className="text-emerald-400">── Upload (Mbps)</span>
                </div>
              </div>
              <div className="w-full bg-slate-950/90 border border-slate-800/80 rounded-lg p-3">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-28 overflow-visible">
                  <line x1="0" y1={svgH * 0.25} x2={svgW} y2={svgH * 0.25} stroke="#1e293b" strokeDasharray="4 4" />
                  <line x1="0" y1={svgH * 0.6} x2={svgW} y2={svgH * 0.6} stroke="#1e293b" strokeDasharray="4 4" />
                  {downPoints && (
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={downPoints}
                    />
                  )}
                  {upPoints && (
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={upPoints}
                    />
                  )}
                </svg>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <span>Malha: {network.wifiBand}</span>
            <button
              type="button"
              onClick={() =>
                onAskJarvisAbout('Qual é o consumo de internet hoje no router e que dispositivos foram detetados no scan de rede?')
              }
              className="text-sky-400 hover:underline cursor-pointer"
            >
              Analisar tráfego com o Jarvis →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
