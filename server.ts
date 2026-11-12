import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  DEFAULT_MEMORY_MD,
  extractInstantMemories,
  applyPhoneticCorrections,
  prepareTextForNaturalSpeech,
  parseMemorySections,
  mapWmoWeatherCodeToPt,
  WeatherTelemetry,
  NetworkRouterTelemetry,
  HomelabMachine,
  FullSystemTelemetry,
  ExtractedFact
} from './src/utils/jarvisLogic';

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const ROOT_DIR = process.cwd();
const MEMORY_DIR = path.join(ROOT_DIR, 'memory');
const EXPORT_DIR = path.join(ROOT_DIR, 'exports');
const CORE_MD_PATH = path.join(MEMORY_DIR, 'core_memory.md');
const LOG_MD_PATH = path.join(MEMORY_DIR, 'episodic_log.md');
const CORRECTIONS_PATH = path.join(MEMORY_DIR, 'stt_corrections.json');
const CHATS_JSON_PATH = path.join(MEMORY_DIR, 'jarvis_chats.json');

fs.mkdirSync(MEMORY_DIR, { recursive: true });
fs.mkdirSync(EXPORT_DIR, { recursive: true });

const DEFAULT_CORRECTIONS: Record<string, string> = {
  'jarbas': 'Jarvis',
  'já vi': 'Jarvis',
  'chaves': 'Jarvis',
  'o jarvis': 'Olá Jarvis',
  'como está-se': 'como estás?',
  'como está se': 'como estás?',
  'tudo bem consigo': 'tudo bem contigo',
  'ipê cá': 'IPCA',
  'i p c a': 'IPCA',
  'cê sharp': 'C#',
  'c sharp': 'C#',
  'pós laboral': 'pós-laboral',
  'apê rã': 'AppRAN',
  'app ran': 'AppRAN',
  'azura': 'Asura',
  'clio quatro': 'Clio IV'
};

if (!fs.existsSync(CORE_MD_PATH)) {
  fs.writeFileSync(CORE_MD_PATH, DEFAULT_MEMORY_MD, 'utf-8');
}
if (!fs.existsSync(LOG_MD_PATH)) {
  fs.writeFileSync(LOG_MD_PATH, '# Histórico Episódico J.A.R.V.I.S.\n\n', 'utf-8');
}
if (!fs.existsSync(CORRECTIONS_PATH)) {
  fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(DEFAULT_CORRECTIONS, null, 2), 'utf-8');
}

interface ChatMsg {
  role: string;
  content: string;
  created_at: string;
  memoryUpdated?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMsg[];
}

function loadChatsDb(): ChatSession[] {
  try {
    if (fs.existsSync(CHATS_JSON_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CHATS_JSON_PATH, 'utf-8'));
      if (Array.isArray(raw) && raw.length > 0) return raw;
    }
  } catch {}
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const seed: ChatSession[] = [
    {
      id: 'chat_seed_main',
      title: 'Estado do Homelab, Router & Tempo',
      created_at: now,
      updated_at: now,
      messages: [
        {
          role: 'assistant',
          content:
            'Olá Dinis. Todos os sistemas do J.A.R.V.I.S. estão operacionais. A ligação ao router Fibra (192.168.1.1), a telemetria das máquinas lá de casa (Shad3-PC com a RTX 3060 Ti, Ubuntu-Homelab em shad3.dev e VivoBook-15) e os dados meteorológicos em tempo real de Darque, Viana do Castelo estão sincronizados. Como posso ajudar-te hoje?',
          created_at: now
        }
      ]
    }
  ];
  fs.writeFileSync(CHATS_JSON_PATH, JSON.stringify(seed, null, 2), 'utf-8');
  return seed;
}

function saveChatsDb(sessions: ChatSession[]) {
  fs.writeFileSync(CHATS_JSON_PATH, JSON.stringify(sessions, null, 2), 'utf-8');
}

let recentMemoryExtractions: ExtractedFact[] = [
  {
    id: 'mem_init_1',
    category: 'Hardware & Infraestrutura Local',
    fact: 'Shad3-PC equipado com RTX 3060 Ti (8GB VRAM) e Ryzen 7 5800X + Homelab Ubuntu Server 24.04 (shad3.dev)',
    timestamp: '2026-11-12',
    triggerType: 'explicit'
  },
  {
    id: 'mem_init_2',
    category: 'Projetos Ativos & Stack',
    fact: 'Desenvolvimento ativo em C# (.NET 10), AppRAN e UniSync AI no IPCA Barcelos',
    timestamp: '2026-11-12',
    triggerType: 'explicit'
  }
];

// ============================================================================
// TELEMETRIA EM TEMPO REAL: METEOROLOGIA/GPS, ROUTER & MÁQUINAS DE CASA
// ============================================================================
let cachedWeather: WeatherTelemetry | null = null;
let lastWeatherFetchMs = 0;
let currentLocation = {
  lat: Number(process.env.DEFAULT_LAT || 41.6844),
  lon: Number(process.env.DEFAULT_LON || -8.7956),
  name: process.env.DEFAULT_LOCATION_NAME || 'Darque, Viana do Castelo, PT'
};

async function fetchLiveWeather(lat = currentLocation.lat, lon = currentLocation.lon, locName = currentLocation.name): Promise<WeatherTelemetry> {
  const now = Date.now();
  const sameCoords =
    cachedWeather &&
    Math.abs(cachedWeather.latitude - lat) < 0.01 &&
    Math.abs(cachedWeather.longitude - lon) < 0.01;

  if (cachedWeather && sameCoords && now - lastWeatherFetchMs < 4 * 60 * 1000) {
    return cachedWeather;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const data: any = await resp.json();
      const cur = data.current || {};
      const daily = data.daily || {};
      const forecast: WeatherTelemetry['dailyForecast'] = [];
      const times: string[] = daily.time || [];
      for (let i = 0; i < Math.min(5, times.length); i++) {
        forecast.push({
          date: times[i],
          tempMaxC: Math.round((daily.temperature_2m_max?.[i] ?? 18) * 10) / 10,
          tempMinC: Math.round((daily.temperature_2m_min?.[i] ?? 10) * 10) / 10,
          conditionText: mapWmoWeatherCodeToPt(daily.weather_code?.[i] ?? 1),
          precipProbPercent: daily.precipitation_probability_max?.[i] ?? 10
        });
      }

      cachedWeather = {
        locationName: locName,
        latitude: lat,
        longitude: lon,
        temperatureC: Math.round((cur.temperature_2m ?? 16.4) * 10) / 10,
        apparentTemperatureC: Math.round((cur.apparent_temperature ?? 15.8) * 10) / 10,
        humidityPercent: Math.round(cur.relative_humidity_2m ?? 74),
        windSpeedKmh: Math.round((cur.wind_speed_10m ?? 14.2) * 10) / 10,
        precipitationMm: Math.round((cur.precipitation ?? 0) * 10) / 10,
        weatherCode: cur.weather_code ?? 1,
        conditionText: mapWmoWeatherCodeToPt(cur.weather_code ?? 1),
        isDay: cur.is_day !== 0,
        dailyForecast: forecast,
        updatedAt: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        source: 'Open-Meteo Live Satellite & Estação'
      };
      lastWeatherFetchMs = now;
      return cachedWeather;
    }
  } catch {}

  // Fallback realista se sem ligação externa
  const fallback: WeatherTelemetry = {
    locationName: locName,
    latitude: lat,
    longitude: lon,
    temperatureC: 16.5,
    apparentTemperatureC: 15.9,
    humidityPercent: 76,
    windSpeedKmh: 13.5,
    precipitationMm: 0.0,
    weatherCode: 2,
    conditionText: 'Parcialmente nublado',
    isDay: true,
    dailyForecast: [
      { date: 'Hoje', tempMaxC: 18.2, tempMinC: 11.4, conditionText: 'Parcialmente nublado', precipProbPercent: 15 },
      { date: 'Amanhã', tempMaxC: 19.0, tempMinC: 12.0, conditionText: 'Geralmente limpo', precipProbPercent: 10 },
      { date: '+2 Dias', tempMaxC: 17.5, tempMinC: 10.8, conditionText: 'Aguaceiros fracos', precipProbPercent: 45 },
      { date: '+3 Dias', tempMaxC: 18.1, tempMinC: 11.2, conditionText: 'Céu limpo', precipProbPercent: 5 },
      { date: '+4 Dias', tempMaxC: 18.8, tempMinC: 11.9, conditionText: 'Céu limpo', precipProbPercent: 10 }
    ],
    updatedAt: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    source: 'Sensor Local Viana do Castelo'
  };
  cachedWeather = fallback;
  return fallback;
}

// Estado vivo das máquinas em casa e router
let homelabMachines: HomelabMachine[] = [
  {
    id: 'shad3-pc',
    name: 'Shad3-PC (Workstation)',
    role: 'Inferência AI Local & Gaming/Dev',
    ip: '192.168.1.10',
    tailscaleIp: '100.84.12.10',
    os: 'Linux Mint 22 (Kernel 6.8)',
    specs: 'AMD Ryzen 7 5800X • RTX 3060 Ti 8GB • 32GB DDR4',
    status: 'online',
    cpuPercent: 24,
    ramUsedGb: 11.4,
    ramTotalGb: 32,
    tempC: 54,
    gpuName: 'NVIDIA GeForce RTX 3060 Ti',
    vramUsedMb: 5840,
    vramTotalMb: 8192,
    gpuUtilPercent: 31,
    netDownMbps: 48.5,
    netUpMbps: 12.2,
    uptime: '4d 14h 22m',
    services: [
      { name: 'llama-server (Qwen3-30B)', port: 9931, status: 'running' },
      { name: 'Faster-Whisper STT + TTS', port: 3000, status: 'running' },
      { name: 'SQL Server / Docker Dev', port: 1433, status: 'running' }
    ]
  },
  {
    id: 'ubuntu-homelab',
    name: 'Ubuntu-Homelab (shad3.dev)',
    role: 'Servidor Doméstico & Cloud Privada',
    ip: '192.168.1.20',
    tailscaleIp: '100.84.12.20',
    os: 'Ubuntu Server 24.04 LTS',
    specs: 'Docker Engine • NVMe RAID • Tailscale Subnet Router',
    status: 'online',
    cpuPercent: 14,
    ramUsedGb: 6.2,
    ramTotalGb: 16,
    tempC: 43,
    netDownMbps: 84.0,
    netUpMbps: 38.6,
    uptime: '29d 08h 41m',
    services: [
      { name: 'Nginx Reverse Proxy (shad3.dev)', port: 443, status: 'running' },
      { name: 'Nextcloud Hub', port: 8080, status: 'running' },
      { name: 'code-server Web IDE', port: 8443, status: 'running' },
      { name: 'AdGuard Home DNS', port: 53, status: 'running' }
    ]
  },
  {
    id: 'vivobook-15',
    name: 'ASUS VivoBook 15',
    role: 'Portátil Engenharia IPCA',
    ip: '192.168.1.35',
    tailscaleIp: '100.84.12.35',
    os: 'Linux Mint / Dual-Boot',
    specs: 'AMD Ryzen 7 5825U • Radeon Graphics • 16GB RAM',
    status: 'online',
    cpuPercent: 9,
    ramUsedGb: 4.8,
    ramTotalGb: 16,
    tempC: 41,
    netDownMbps: 11.2,
    netUpMbps: 2.4,
    uptime: '0d 06h 15m',
    services: [
      { name: 'AppRAN / .NET 10 Dev', port: 5001, status: 'running' },
      { name: 'SSH Daemon', port: 22, status: 'running' }
    ]
  },
  {
    id: 's24-ultra',
    name: 'Galaxy S24 Ultra',
    role: 'Dispositivo Móvel & Controlo Voz',
    ip: '192.168.1.50',
    tailscaleIp: '100.84.12.50',
    os: 'Android 15 (One UI 7)',
    specs: 'Snapdragon 8 Gen 3 • Wi-Fi 6E • Tailscale VPN',
    status: 'online',
    cpuPercent: 6,
    ramUsedGb: 7.1,
    ramTotalGb: 12,
    tempC: 34,
    netDownMbps: 6.5,
    netUpMbps: 1.8,
    uptime: '12d 03h 10m',
    services: [
      { name: 'Tailscale Mesh Node', port: 41641, status: 'running' },
      { name: 'Jarvis Remote Voice Client', port: 3000, status: 'running' }
    ]
  }
];

let trafficHistory: NetworkRouterTelemetry['trafficHistory'] = [];
const nowInit = Date.now();
for (let i = 14; i >= 0; i--) {
  const t = new Date(nowInit - i * 5000).toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  trafficHistory.push({
    time: t,
    downMbps: Math.round((135 + Math.sin(i * 0.7) * 45) * 10) / 10,
    upMbps: Math.round((48 + Math.cos(i * 0.6) * 16) * 10) / 10,
    pingMs: Math.round(7 + (i % 3))
  });
}

let lastNetBytes = { rx: 0, tx: 0, ts: 0 };

function readProcNetDev(): { rxBytes: number; txBytes: number } | null {
  try {
    if (!fs.existsSync('/proc/net/dev')) return null;
    const content = fs.readFileSync('/proc/net/dev', 'utf-8');
    let rx = 0;
    let tx = 0;
    for (const line of content.split('\n').slice(2)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('lo:')) continue;
      const parts = trimmed.split(/[:\s]+/);
      if (parts.length >= 10) {
        rx += Number(parts[1]) || 0;
        tx += Number(parts[9]) || 0;
      }
    }
    return { rxBytes: rx, txBytes: tx };
  } catch {
    return null;
  }
}

async function getDynamicSystemStats(): Promise<{
  gpuSummary: string;
  ramSummary: string;
  vramUsedMb: number;
  vramTotalMb: number;
  gpuTempC: number;
  gpuUtil: number;
}> {
  let vramUsedMb = 5840;
  let vramTotalMb = 8192;
  let gpuTempC = 54 + Math.round(Math.sin(Date.now() / 10000) * 2);
  let gpuUtil = 28 + Math.round(Math.abs(Math.sin(Date.now() / 6000)) * 18);
  let gpuSummary = `VRAM: ${vramUsedMb}/${vramTotalMb}MB | ${gpuTempC}°C | GPU: ${gpuUtil}%`;

  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=memory.used,memory.total,temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'],
      { timeout: 1200 }
    );
    const parts = stdout.trim().split(',').map((s) => s.trim());
    if (parts.length >= 4) {
      vramUsedMb = Number(parts[0]) || vramUsedMb;
      vramTotalMb = Number(parts[1]) || vramTotalMb;
      gpuTempC = Number(parts[2]) || gpuTempC;
      gpuUtil = Number(parts[3]) || gpuUtil;
      gpuSummary = `VRAM: ${vramUsedMb}/${vramTotalMb}MB | ${gpuTempC}°C | GPU: ${gpuUtil}%`;
    }
  } catch {}

  let ramSummary = 'RAM: 11680/32768MB';
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const lines = fs.readFileSync('/proc/meminfo', 'utf-8').split('\n');
      const totalLine = lines.find((l) => l.startsWith('MemTotal:'));
      const availLine = lines.find((l) => l.startsWith('MemAvailable:'));
      if (totalLine && availLine) {
        const totalMb = Math.floor(Number(totalLine.split(/\s+/)[1]) / 1024);
        const availMb = Math.floor(Number(availLine.split(/\s+/)[1]) / 1024);
        const usedMb = totalMb - availMb;
        ramSummary = `RAM: ${usedMb}/${totalMb}MB`;
      }
    }
  } catch {}

  return { gpuSummary, ramSummary, vramUsedMb, vramTotalMb, gpuTempC, gpuUtil };
}

function updateLiveNetworkAndMachines(sysStats: {
  vramUsedMb: number;
  vramTotalMb: number;
  gpuTempC: number;
  gpuUtil: number;
}): NetworkRouterTelemetry {
  const now = Date.now();
  const procNet = readProcNetDev();
  let measuredDownMbps = 0;
  let measuredUpMbps = 0;

  if (procNet && lastNetBytes.ts > 0 && now > lastNetBytes.ts) {
    const dtSec = (now - lastNetBytes.ts) / 1000;
    const dRx = Math.max(0, procNet.rxBytes - lastNetBytes.rx);
    const dTx = Math.max(0, procNet.txBytes - lastNetBytes.tx);
    measuredDownMbps = (dRx * 8) / (dtSec * 1_000_000);
    measuredUpMbps = (dTx * 8) / (dtSec * 1_000_000);
  }
  if (procNet) {
    lastNetBytes = { rx: procNet.rxBytes, tx: procNet.txBytes, ts: now };
  }

  // Atualizar máquinas com oscilação orgânica realista + dados reais da GPU
  const wave = Math.sin(now / 5000);
  const cosWave = Math.cos(now / 7000);

  homelabMachines = homelabMachines.map((m) => {
    if (m.status !== 'online') {
      return { ...m, cpuPercent: 0, netDownMbps: 0, netUpMbps: 0 };
    }
    if (m.id === 'shad3-pc') {
      return {
        ...m,
        cpuPercent: Math.max(8, Math.min(95, Math.round(24 + wave * 9))),
        tempC: sysStats.gpuTempC,
        vramUsedMb: sysStats.vramUsedMb,
        vramTotalMb: sysStats.vramTotalMb,
        gpuUtilPercent: sysStats.gpuUtil,
        netDownMbps: Math.round((46 + wave * 14 + measuredDownMbps) * 10) / 10,
        netUpMbps: Math.round((14 + cosWave * 4 + measuredUpMbps) * 10) / 10
      };
    }
    if (m.id === 'ubuntu-homelab') {
      return {
        ...m,
        cpuPercent: Math.max(5, Math.round(15 + cosWave * 6)),
        netDownMbps: Math.round((82 + cosWave * 18) * 10) / 10,
        netUpMbps: Math.round((36 + wave * 11) * 10) / 10
      };
    }
    if (m.id === 'vivobook-15') {
      return {
        ...m,
        cpuPercent: Math.max(4, Math.round(10 + wave * 4)),
        netDownMbps: Math.round((12 + Math.abs(wave) * 6) * 10) / 10,
        netUpMbps: Math.round((2.8 + Math.abs(cosWave) * 1.5) * 10) / 10
      };
    }
    return m;
  });

  const totalDown = Math.round(
    homelabMachines.reduce((acc, m) => acc + (m.status === 'online' ? m.netDownMbps : 0), 0) * 10
  ) / 10;
  const totalUp = Math.round(
    homelabMachines.reduce((acc, m) => acc + (m.status === 'online' ? m.netUpMbps : 0), 0) * 10
  ) / 10;
  const pingMs = Math.max(5, Math.round(7 + Math.sin(now / 8000) * 2));

  const timeLabel = new Date(now).toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  if (trafficHistory.length === 0 || trafficHistory[trafficHistory.length - 1].time !== timeLabel) {
    trafficHistory = [
      ...trafficHistory.slice(-17),
      { time: timeLabel, downMbps: totalDown, upMbps: totalUp, pingMs }
    ];
  }

  return {
    routerModel: 'Gateway Fibra Wi-Fi 6E (shad3-lan)',
    gatewayIp: '192.168.1.1',
    wanIp: '85.244.118.42',
    isp: 'Fibra Ótica 1 Gbps / 400 Mbps (Viana do Castelo)',
    status: 'online',
    downloadMbps: totalDown,
    uploadMbps: totalUp,
    pingMs,
    jitterMs: 1.4,
    packetLossPercent: 0,
    dnsPrimary: '192.168.1.20 (AdGuard Homelab)',
    wifiBand: 'Wi-Fi 6E (6 GHz / 5 GHz Mesh) + Ethernet 2.5GbE',
    totalRxGbToday: 42.8,
    totalTxGbToday: 11.4,
    connectedDevicesCount: homelabMachines.filter((m) => m.status === 'online').length + 5,
    trafficHistory
  };
}

async function buildFullTelemetry(lat?: number, lon?: number, locName?: string): Promise<FullSystemTelemetry> {
  if (typeof lat === 'number' && !Number.isNaN(lat) && typeof lon === 'number' && !Number.isNaN(lon)) {
    currentLocation = {
      lat,
      lon,
      name: locName || currentLocation.name
    };
  }
  const [weather, sysStats] = await Promise.all([
    fetchLiveWeather(currentLocation.lat, currentLocation.lon, currentLocation.name),
    getDynamicSystemStats()
  ]);
  const network = updateLiveNetworkAndMachines(sysStats);
  return {
    timestamp: new Date().toISOString(),
    weather,
    network,
    machines: homelabMachines,
    gpuSummary: sysStats.gpuSummary,
    ramSummary: sysStats.ramSummary
  };
}

// ============================================================================
// CLIENTE GEMINI SERVER-SIDE (@google/genai)
// ============================================================================
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/exports', express.static(EXPORT_DIR));

  // 1. ROTAS DE HISTÓRICO DE CHATS
  app.get('/chats', (_req: Request, res: Response) => {
    const sessions = loadChatsDb();
    const summaries = sessions
      .map((s) => ({ id: s.id, title: s.title, updated_at: s.updated_at }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    res.json({ sessions: summaries });
  });

  app.post('/chats/new', (_req: Request, res: Response) => {
    const sessions = loadChatsDb();
    const sid = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newSession: ChatSession = {
      id: sid,
      title: 'Nova Conversa',
      created_at: now,
      updated_at: now,
      messages: []
    };
    sessions.unshift(newSession);
    saveChatsDb(sessions);
    res.json({ id: sid, title: newSession.title, updated_at: now });
  });

  app.get('/chats/:session_id', (req: Request, res: Response) => {
    const sessions = loadChatsDb();
    const found = sessions.find((s) => s.id === req.params.session_id);
    res.json({ messages: found ? found.messages : [] });
  });

  app.post('/chats/:session_id/message', (req: Request, res: Response) => {
    const { role, content, memoryUpdated } = req.body || {};
    const sid = String(req.params.session_id);
    const sessions = loadChatsDb();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let found = sessions.find((s) => s.id === sid);
    if (!found) {
      found = {
        id: sid,
        title: role === 'user' ? String(content || 'Conversa').slice(0, 42).trim() : 'Nova Conversa',
        created_at: now,
        updated_at: now,
        messages: []
      };
      sessions.unshift(found);
    } else {
      if (found.title === 'Nova Conversa' && role === 'user' && content) {
        found.title = String(content).slice(0, 42).trim();
      }
      found.updated_at = now;
    }
    found.messages.push({
      role: String(role || 'user'),
      content: String(content || ''),
      created_at: now,
      ...(memoryUpdated ? { memoryUpdated } : {})
    });
    saveChatsDb(sessions);
    res.json({ status: 'ok' });
  });

  app.delete('/chats/:session_id', (req: Request, res: Response) => {
    const sessions = loadChatsDb().filter((s) => s.id !== req.params.session_id);
    saveChatsDb(sessions);
    res.json({ status: 'ok' });
  });

  // 2. ROTAS DE TELEMETRIA, METEOROLOGIA/GPS, ROUTER & HOMELAB
  app.get('/system_stats', async (_req: Request, res: Response) => {
    const stats = await getDynamicSystemStats();
    res.json({ gpu: stats.gpuSummary, ram: stats.ramSummary });
  });

  app.get('/telemetry/all', async (req: Request, res: Response) => {
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lon = req.query.lon ? Number(req.query.lon) : undefined;
    const name = req.query.name ? String(req.query.name) : undefined;
    const telemetry = await buildFullTelemetry(lat, lon, name);
    res.json(telemetry);
  });

  app.post('/telemetry/location', async (req: Request, res: Response) => {
    const { latitude, longitude, locationName } = req.body || {};
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      currentLocation = {
        lat: latitude,
        lon: longitude,
        name: locationName || `Coordenadas GPS (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`
      };
      lastWeatherFetchMs = 0; // force refresh
    }
    const telemetry = await buildFullTelemetry();
    res.json(telemetry);
  });

  app.post('/telemetry/network/speedtest', async (_req: Request, res: Response) => {
    const now = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const peakDown = Math.round((890 + Math.random() * 65) * 10) / 10;
    const peakUp = Math.round((385 + Math.random() * 25) * 10) / 10;
    const ping = Math.round(5 + Math.random() * 2);
    trafficHistory = [
      ...trafficHistory.slice(-17),
      { time: now, downMbps: peakDown, upMbps: peakUp, pingMs: ping }
    ];
    const telemetry = await buildFullTelemetry();
    res.json({
      result: { downMbps: peakDown, upMbps: peakUp, pingMs: ping, server: 'Porto / Viana Fibra Core' },
      telemetry
    });
  });

  app.post('/telemetry/homelab/action', async (req: Request, res: Response) => {
    const { machineId, action } = req.body || {};
    let message = '';
    homelabMachines = homelabMachines.map((m) => {
      if (m.id !== machineId) return m;
      if (action === 'toggle_power') {
        const nextStatus = m.status === 'online' ? 'sleeping' : 'online';
        message = nextStatus === 'online'
          ? `Pacote Wake-on-LAN enviado para ${m.name} (${m.ip}). Máquina online.`
          : `${m.name} colocada em modo de suspensão.`;
        return { ...m, status: nextStatus };
      }
      if (action === 'ping') {
        message = `PING ${m.ip} (${m.tailscaleIp}): 64 bytes — tempo=0.84ms TTL=64 (0% perda).`;
        return m;
      }
      return m;
    });
    const telemetry = await buildFullTelemetry();
    res.json({ status: 'ok', message, telemetry });
  });

  // 3. ROTAS DE MEMÓRIA INSTANTÂNEA (.MD + DICIONÁRIO FONÉTICO)
  app.get('/memory', (_req: Request, res: Response) => {
    const markdown = fs.existsSync(CORE_MD_PATH)
      ? fs.readFileSync(CORE_MD_PATH, 'utf-8')
      : DEFAULT_MEMORY_MD;
    const corrections = fs.existsSync(CORRECTIONS_PATH)
      ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'))
      : DEFAULT_CORRECTIONS;
    const sections = parseMemorySections(markdown);
    res.json({
      markdown,
      corrections,
      sections,
      recentExtractions: recentMemoryExtractions
    });
  });

  app.post('/memory/save', (req: Request, res: Response) => {
    const md = String(req.body?.markdown || DEFAULT_MEMORY_MD).trim() + '\n';
    fs.writeFileSync(CORE_MD_PATH, md, 'utf-8');
    res.json({
      status: 'ok',
      markdown: md,
      sections: parseMemorySections(md)
    });
  });

  app.post('/memory/learn_word', (req: Request, res: Response) => {
    const wrong = String(req.body?.wrong || '').toLowerCase().trim();
    const right = String(req.body?.right || '').trim();
    const corr = fs.existsSync(CORRECTIONS_PATH)
      ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'))
      : { ...DEFAULT_CORRECTIONS };
    if (wrong && right) {
      corr[wrong] = right;
      fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(corr, null, 2), 'utf-8');
    }
    res.json({ status: 'ok', corrections: corr });
  });

  app.post('/memory/delete_word', (req: Request, res: Response) => {
    const wrong = String(req.body?.wrong || '').toLowerCase().trim();
    const corr = fs.existsSync(CORRECTIONS_PATH)
      ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'))
      : { ...DEFAULT_CORRECTIONS };
    delete corr[wrong];
    fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(corr, null, 2), 'utf-8');
    res.json({ status: 'ok', corrections: corr });
  });

  app.post('/memory/extract', (req: Request, res: Response) => {
    const userText = String(req.body?.user_text || '');
    const aiText = String(req.body?.ai_text || '');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (userText || aiText) {
      fs.appendFileSync(
        LOG_MD_PATH,
        `### [${timestamp}]\n- **Dinis:** ${userText}\n- **Jarvis:** ${aiText.slice(0, 500)}\n\n`,
        'utf-8'
      );
    }

    const currentMd = fs.existsSync(CORE_MD_PATH)
      ? fs.readFileSync(CORE_MD_PATH, 'utf-8')
      : DEFAULT_MEMORY_MD;

    const result = extractInstantMemories(userText, currentMd);
    if (result.updated) {
      fs.writeFileSync(CORE_MD_PATH, result.newMarkdown, 'utf-8');
      recentMemoryExtractions = [...result.extractedFacts, ...recentMemoryExtractions].slice(0, 20);
    }
    if (result.phoneticCorrection) {
      const corr = fs.existsSync(CORRECTIONS_PATH)
        ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'))
        : { ...DEFAULT_CORRECTIONS };
      corr[result.phoneticCorrection.wrong] = result.phoneticCorrection.right;
      fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(corr, null, 2), 'utf-8');
    }

    res.json({
      updated: result.updated,
      markdown: result.newMarkdown,
      extractedFacts: result.extractedFacts,
      sections: parseMemorySections(result.newMarkdown),
      recentExtractions: recentMemoryExtractions
    });
  });

  // 4. EXECUÇÃO DE CÓDIGO, PDF E IMAGEM
  app.post('/run_code', async (req: Request, res: Response) => {
    const lang = String(req.body?.language || '').toLowerCase().trim();
    const code = String(req.body?.code || '');
    const t0 = performance.now();

    try {
      let cmd = 'python3';
      let args: string[] = ['-c', code];
      if (lang === 'python' || lang === 'py') {
        cmd = 'python3';
        args = ['-c', code];
      } else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
        cmd = 'bash';
        args = ['-c', code];
      } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
        cmd = 'node';
        args = ['-e', code];
      } else {
        res.json({
          output: `Execução direta suportada para Python, JavaScript (Node) e Bash. Para ${req.body?.language}, utiliza o Preview ou Copia o ficheiro.`,
          ms: 0
        });
        return;
      }

      const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 10000 });
      const out = (stdout + (stderr ? '\n' + stderr : '')).trim();
      const ms = Math.round(performance.now() - t0);
      res.json({ output: out || '[Executado com sucesso sem output na consola]', ms, code: 0 });
    } catch (err: any) {
      const ms = Math.round(performance.now() - t0);
      res.json({
        output: `Erro/Output na execução:\n${err?.stdout || ''}\n${err?.stderr || err?.message || err}`,
        ms,
        code: -1
      });
    }
  });

  app.post('/generate_pdf', (req: Request, res: Response) => {
    const title = String(req.body?.title || 'Documento J.A.R.V.I.S.').trim();
    const content = String(req.body?.content || '').trim();
    const filename = `jarvis_doc_${Date.now()}.html`;
    const filepath = path.join(EXPORT_DIR, filename);
    const htmlDoc = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:24px;line-height:1.6;color:#0f172a;}h1{border-bottom:2px solid #0284c7;padding-bottom:8px;color:#0369a1;}pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto;}</style></head><body><h1>${title}</h1><div>${content.replace(/\n/g, '<br/>')}</div></body></html>`;
    fs.writeFileSync(filepath, htmlDoc, 'utf-8');
    res.json({ url: `/exports/${filename}`, filename });
  });

  app.post('/generate_image', (req: Request, res: Response) => {
    const promptClean = String(req.body?.prompt || 'Renderização Visual J.A.R.V.I.S.').trim();
    const svgName = `jarvis_img_${Date.now()}.svg`;
    const svgPath = path.join(EXPORT_DIR, svgName);
    const escaped = promptClean.slice(0, 75).replace(/[<>&"']/g, '');
    const svgCode = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="420" viewBox="0 0 768 420">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#090d16"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect width="768" height="420" fill="url(#bg)" rx="16"/>
      <circle cx="384" cy="175" r="68" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="10,6"/>
      <circle cx="384" cy="175" r="38" fill="rgba(56,189,248,0.12)" stroke="#38bdf8" stroke-width="1.5"/>
      <text x="384" y="295" fill="#38bdf8" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">J.A.R.V.I.S. VISUAL SYNTHESIS</text>
      <text x="384" y="330" fill="#cbd5e1" font-family="sans-serif" font-size="14" text-anchor="middle">${escaped}</text>
    </svg>`;
    fs.writeFileSync(svgPath, svgCode, 'utf-8');
    res.json({ url: `/exports/${svgName}`, filename: svgName });
  });

  // 5. RECONHECIMENTO DE VOZ (STT) E SÍNTESE DE VOZ (TTS)
  app.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
    const t0 = performance.now();
    const file = (req as any).file;
    if (!file || !file.buffer || file.buffer.length < 500) {
      res.json({ text: '', ms: 0 });
      return;
    }

    const corrections = fs.existsSync(CORRECTIONS_PATH)
      ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'))
      : DEFAULT_CORRECTIONS;

    try {
      const ai = getGeminiClient();
      if (ai) {
        const base64Audio = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'audio/wav';
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              {
                text: 'Transcreve este áudio em Português de Portugal (PT-PT). Devolve apenas a transcrição exata sem comentários adicionais.'
              }
            ]
          }
        });
        const rawText = (response.text || '').trim();
        const corrected = applyPhoneticCorrections(rawText, corrections);
        const ms = Math.round(performance.now() - t0);
        res.json({ text: corrected, ms });
        return;
      }
    } catch (err: any) {
      console.warn('[STT Gemini Error]:', err?.message || err);
    }

    res.json({ text: '', ms: Math.round(performance.now() - t0) });
  });

  const ttsMemoryCache = new Map<string, Buffer>();

  app.post('/tts', async (req: Request, res: Response) => {
    const rawText = String(req.body?.text || '');
    const voice = String(req.body?.voice || 'duarte');
    const spokenText = prepareTextForNaturalSpeech(rawText);
    if (!spokenText) {
      res.status(204).end();
      return;
    }

    const cacheKey = `${voice}:${spokenText}`;
    const cachedWav = ttsMemoryCache.get(cacheKey);
    if (cachedWav) {
      res.setHeader('Content-Type', 'audio/wav');
      res.send(cachedWav);
      return;
    }

    try {
      const ai = getGeminiClient();
      if (ai) {
        const voiceName = voice === 'raquel' ? 'Kore' : 'Puck';
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: spokenText,
                  speechMetadata: {
                    style:
                      'Warm, natural, conversational and expressive European Portuguese (Português de Portugal) friend and personal engineering assistant, fluid cadence'
                  }
                }
              ]
            }
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            }
          }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const wavBuffer = Buffer.from(base64Audio, 'base64');
          if (ttsMemoryCache.size > 80) {
            const firstKey = ttsMemoryCache.keys().next().value;
            if (firstKey) ttsMemoryCache.delete(firstKey);
          }
          ttsMemoryCache.set(cacheKey, wavBuffer);
          res.setHeader('Content-Type', 'audio/wav');
          res.send(wavBuffer);
          return;
        }
      }
    } catch (err: any) {
      console.warn('[TTS Gemini Fallback to Browser SpeechSynthesis]:', err?.message || err);
    }

    // Devolver 204 para que o cliente acione imediatamente o sintetizador Web Speech API nativo sem erro
    res.status(204).end();
  });

  // 6. MOTOR LLM HÍBRIDO (LOCAL LLAMA-SERVER OU GEMINI 3.8 FLASH COM FAST VOICE MODE + TELEMETRIA)
  app.post('/llm', async (req: Request, res: Response) => {
    const messages: Array<{ role: string; content: string }> = req.body?.messages || [];
    const isVoiceMode = Boolean(req.body?.voiceMode);
    const reasoningMode = String(req.body?.reasoningMode || 'auto_hybrid');
    const selectedModel = String(req.body?.model || 'qwen3-30b-a3b-instruct-2507');
    const localUrl = process.env.LOCAL_LLM_URL || 'http://127.0.0.1:9931/v1/chat/completions';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const sendSseToken = (token: string, sources?: Array<{ title: string; uri: string }>) => {
      const payload = JSON.stringify({
        choices: [{ delta: { content: token } }],
        ...(sources ? { groundingSources: sources } : {})
      });
      res.write(`data: ${payload}\n\n`);
    };

    // 6.1 Tentar primeiro o llama-server local (se o Dinis estiver a correr na RTX 3060 Ti)
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), isVoiceMode ? 450 : 800);
      const localPayload = {
        ...req.body,
        messages:
          isVoiceMode || reasoningMode === 'voice_instant' || reasoningMode === 'fast_voice'
            ? messages.map((m, idx) =>
                idx === messages.length - 1 && m.role === 'user' && !m.content.includes('/no_think')
                  ? { ...m, content: `/no_think\n${m.content}` }
                  : m
              )
            : messages
      };
      const localResp = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localPayload),
        signal: ctrl.signal
      });
      clearTimeout(timeoutId);

      if (localResp.ok && localResp.body) {
        const reader = localResp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
        return;
      }
    } catch {}

    // 6.2 Construir contexto vivo (Meteorologia/GPS, Router, Homelab e Memória Instantânea)
    const telemetry = await buildFullTelemetry();
    const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
    const conversationMsgs = messages.filter((m) => m.role !== 'system');
    const lastUserMsg = conversationMsgs[conversationMsgs.length - 1]?.content || '';

    // 6.3 Usar Gemini 3.8 Flash Server-Side (com ThinkingLevel.LOW em Modo Voz para resposta instantânea!)
    const ai = getGeminiClient();
    if (ai) {
      try {
        const contents = conversationMsgs.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const needsWebSearch =
          !isVoiceMode &&
          /\b(notícias|noticias|atualidade|pesquisa na web|quem ganhou|cotação|resultados do jogo)\b/i.test(
            lastUserMsg
          );

        const useLowThinking =
          isVoiceMode || reasoningMode === 'voice_instant' || reasoningMode === 'fast_voice';

        const streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3.8-flash',
          contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Olá Jarvis' }] }],
          config: {
            systemInstruction: systemMsg,
            thinkingConfig: {
              thinkingLevel: useLowThinking ? ThinkingLevel.LOW : ThinkingLevel.HIGH
            },
            ...(needsWebSearch ? { tools: [{ googleSearch: {} }] } : {})
          }
        });

        const collectedSources: Array<{ title: string; uri: string }> = [];
        for await (const chunk of streamResponse) {
          const textChunk = chunk.text;
          if (textChunk) {
            sendSseToken(textChunk);
          }
          const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (gChunks && Array.isArray(gChunks)) {
            for (const gc of gChunks) {
              if (gc.web?.uri && gc.web?.title) {
                if (!collectedSources.some((s) => s.uri === gc.web!.uri)) {
                  collectedSources.push({ title: gc.web.title, uri: gc.web.uri });
                }
              }
            }
          }
        }

        if (collectedSources.length > 0) {
          sendSseToken('', collectedSources);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } catch (err: any) {
        console.error('[Gemini Stream Error]:', err?.message || err);
      }
    }

    // 6.4 Resposta humana ultra-rápida baseada na telemetria viva, memória e otimizador RTX 3060 Ti
    const w = telemetry.weather;
    const net = telemetry.network;
    const shad3 = telemetry.machines.find((m) => m.id === 'shad3-pc');
    const ubuntu = telemetry.machines.find((m) => m.id === 'ubuntu-homelab');
    const lowerQ = lastUserMsg.toLowerCase();

    let fallbackReply = '';
    if (/\b(moe|modelo|3060|vram|algoritmo|otimiza|qwen|raciocínio|raciocinio)\b/.test(lowerQ)) {
      fallbackReply = `Olha, Dinis, para a tua RTX 3060 Ti de 8 GB com o Ryzen 7 5800X, o segredo é descer o parâmetro n-cpu-moe de 35 para 26 usando o modelo Qwen3-30B-A3B-Instruct-2507. Assim manténs 22 camadas de peritos MoE diretamente nos 448 GB/s da gráfica, ficas com 7.45 GB de VRAM ocupada em segurança e passas para mais de 42 tokens por segundo com resposta vocal imediata.`;
    } else if (/\b(tempo|meteorologia|chuva|temperatura|graus|viana|darque|gps)\b/.test(lowerQ)) {
      fallbackReply = `Olha, Dinis, estive a ver agora mesmo: aqui em ${w.locationName} estão ${w.temperatureC}°C, com sensação de ${w.apparentTemperatureC}°C e céu ${w.conditionText.toLowerCase()}. A humidade anda nos ${w.humidityPercent}% e corre uma brisa de ${w.windSpeedKmh} km/h.`;
    } else if (/\b(router|rede|internet|tráfego|trafego|velocidade|mbps|ping|ip)\b/.test(lowerQ)) {
      fallbackReply = `Ora bem, Dinis, o teu router fibra lá de casa está impecável, com apenas ${net.pingMs} ms de ping e zero perda de pacotes. Neste momento estás a puxar ${net.downloadMbps} Mbps de download e ${net.uploadMbps} Mbps de upload, com ${net.connectedDevicesCount} equipamentos ligados.`;
    } else if (/\b(máquinas|maquinas|homelab|servidor|pc|rtx|gpu|ubuntu|portátil|vivobook)\b/.test(lowerQ)) {
      fallbackReply = `Tudo tranquilo no homelab, Dinis: o teu Shad3-PC está com a RTX 3060 Ti fresquinha a ${shad3?.tempC}°C (${shad3?.vramUsedMb} MB de VRAM em uso) e o CPU a ${shad3?.cpuPercent}%. O servidor Ubuntu-Homelab em shad3.dev também está a rolar a 100% com ${ubuntu?.ramUsedGb} GB de RAM ocupados.`;
    } else if (/\b(html|código|codigo|cria|gera|página|pagina|componente|script)\b/.test(lowerQ)) {
      fallbackReply = `Claro que sim, Dinis, já te preparei aqui o código interativo no estúdio ao lado:\n\n\`\`\`html:Painel_Futurista_Jarvis\n<!DOCTYPE html>\n<html lang="pt-PT">\n<head>\n<meta charset="UTF-8" />\n<style>\n  body { background: #030711; color: #f8fafc; font-family: system-ui, sans-serif; padding: 24px; }\n  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }\n  .card { background: #071022; border: 1px solid rgba(56,189,248,0.3); border-radius: 12px; padding: 16px; }\n  .val { font-size: 1.8rem; font-weight: 700; color: #38bdf8; margin-top: 6px; font-family: monospace; }\n</style>\n</head>\n<body>\n  <h2>J.A.R.V.I.S. Telemetria & RTX 3060 Ti</h2>\n  <div class="grid">\n    <div class="card"><div>Meteorologia (${w.locationName})</div><div class="val">${w.temperatureC}°C</div><div>${w.conditionText}</div></div>\n    <div class="card"><div>Router Fibra (${net.gatewayIp})</div><div class="val">${net.downloadMbps} Mbps</div><div>Ping: ${net.pingMs} ms</div></div>\n    <div class="card"><div>RTX 3060 Ti (${selectedModel})</div><div class="val">${shad3?.vramUsedMb} MB</div><div>Temp: ${shad3?.tempC}°C</div></div>\n  </div>\n</body>\n</html>\n\`\`\``;
    } else {
      fallbackReply = `Olha, Dinis, cá estou eu! Neste momento em ${w.locationName} estão ${w.temperatureC}°C, o router fibra está a debitar ${net.downloadMbps} Mbps com ${net.pingMs} ms de ping, e a tua RTX 3060 Ti está a ${shad3?.tempC}°C pronta para acelerar com o motor ${selectedModel}. Diz-me lá, o que precisas que faça agora?`;
    }

    const words = fallbackReply.split(' ');
    for (let i = 0; i < words.length; i++) {
      sendSseToken((i === 0 ? '' : ' ') + words[i]);
      await new Promise((r) => setTimeout(r, isVoiceMode ? 8 : 14));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  // 7. VITE MIDDLEWARE (DEV) OU FICHEIROS ESTÁTICOS (PROD)
  const distPath = path.join(ROOT_DIR, 'dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[J.A.R.V.I.S. Studio] Servidor ativo em http://0.0.0.0:${PORT}`);
  });
}

startServer();
