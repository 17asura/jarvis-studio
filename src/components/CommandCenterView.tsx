import React, { useState } from 'react';
import {
  CloudSun,
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
  MessageSquare
} from 'lucide-react';
import { FullSystemTelemetry } from '../utils/jarvisLogic';

interface CommandCenterViewProps {
  telemetry: FullSystemTelemetry | null;
  onRefreshTelemetry: () => Promise<void>;
  onUpdateLocation: (lat: number, lon: number, name: string) => Promise<void>;
  onRunSpeedTest: () => Promise<void>;
  onMachineAction: (machineId: string, action: 'ping' | 'toggle_power') => Promise<string>;
  onAskJarvisAbout: (prompt: string) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  telemetry,
  onRefreshTelemetry,
  onUpdateLocation,
  onRunSpeedTest,
  onMachineAction,
  onAskJarvisAbout
}) => {
  const [speedTesting, setSpeedTesting] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('darque');

  if (!telemetry) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-slate-400 text-sm">
        A sincronizar telemetria de rede, router, GPS e máquinas do homelab...
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
    setActionFeedback('A executar teste de largura de banda Fibra no Gateway 192.168.1.1...');
    await onRunSpeedTest();
    setSpeedTesting(false);
    setActionFeedback('Teste de velocidade Fibra concluído com sucesso.');
  };

  const handleMachineCmd = async (machineId: string, action: 'ping' | 'toggle_power') => {
    const msg = await onMachineAction(machineId, action);
    if (msg) setActionFeedback(msg);
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
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            Centro de Comando Doméstico & Telemetria Externa
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Todos estes dados são injetados em tempo real no contexto de voz e texto do J.A.R.V.I.S.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {actionFeedback && (
            <span className="text-xs text-sky-300 font-mono mr-2">{actionFeedback}</span>
          )}
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
                'Jarvis, faz-me um resumo falado completo do tempo hoje em Viana, do tráfego atual do router e do estado de todas as máquinas lá de casa.'
              )
            }
            className="px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Pedir Relatório por Voz ao Jarvis
          </button>
        </div>
      </div>

      {/* SECTION 1: METEOROLOGIA & GPS + ROUTER & TRÁFEGO DE REDE (2-Column Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Weather & GPS Panel (5 Cols) */}
        <section className="lg:col-span-5 rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 flex flex-col justify-between gap-5">
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
        <section className="lg:col-span-7 rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 flex flex-col justify-between gap-5">
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
                  {network.connectedDevicesCount} clientes ativos na rede
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
                onAskJarvisAbout('Qual é o consumo de internet hoje no router e que máquina está a gastar mais tráfego?')
              }
              className="text-sky-400 hover:underline cursor-pointer"
            >
              Analisar tráfego com o Jarvis →
            </button>
          </div>
        </section>
      </div>

      {/* SECTION 2: MÁQUINAS EM CASA (HOMELAB & TAILSCALE MESH) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Máquinas em Casa & Infraestrutura Homelab (Tailscale Mesh)
            </h2>
            <p className="text-xs text-slate-400">
              Monitorização direta de CPU, RAM, VRAM (RTX 3060 Ti), temperatura, serviços Docker e tráfego por máquina
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Domínio: shad3.dev · Subnet 192.168.1.0/24
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {machines.map((m) => {
            const isOnline = m.status === 'online';
            const ramPercent = Math.round((m.ramUsedGb / m.ramTotalGb) * 100);
            const vramPercent =
              m.vramUsedMb && m.vramTotalMb ? Math.round((m.vramUsedMb / m.vramTotalMb) * 100) : null;

            return (
              <div
                key={m.id}
                className="rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-sky-400 shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-100">{m.name}</h3>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {m.role} · {m.os}
                      </div>
                      <div className="text-xs font-mono text-slate-400 mt-1">
                        LAN {m.ip} · Tailscale {m.tailscaleIp} · Uptime {m.uptime}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-mono font-semibold ${
                          isOnline ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {isOnline ? 'ONLINE' : 'EM SUSPENSÃO'}
                      </span>
                      <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
                        {m.tempC}°C
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 font-mono bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800/70">
                    {m.specs}
                  </div>

                  {/* Resource Progress Bars */}
                  <div className="space-y-2.5 pt-1 text-xs">
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

                  {/* Active Services */}
                  <div className="pt-2 border-t border-slate-800/70">
                    <div className="text-[11px] text-slate-400 mb-1.5">
                      Serviços & Contentores Ativos:
                    </div>
                    <div className="space-y-1 text-xs font-mono">
                      {m.services.map((srv, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-300">
                          <span>{srv.name}</span>
                          <span className="text-slate-400 tabular-nums">:{srv.port} · OK</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Machine Actions & Network Rate */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-mono text-slate-300 tabular-nums">
                    Rede: <span className="text-sky-400">{m.netDownMbps} Mbps ↓</span> ·{' '}
                    <span className="text-emerald-400">{m.netUpMbps} Mbps ↑</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMachineCmd(m.id, 'ping')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Terminal className="w-3 h-3 text-sky-400" />
                      Ping
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMachineCmd(m.id, 'toggle_power')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Power className="w-3 h-3 text-amber-400" />
                      {isOnline ? 'Suspender' : 'Wake-on-LAN'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
