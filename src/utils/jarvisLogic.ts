export interface ExtractedFact {
  id: string;
  category: string;
  fact: string;
  timestamp: string;
  triggerType: 'explicit' | 'implicit' | 'phonetic';
}

export interface InstantMemoryResult {
  updated: boolean;
  newMarkdown: string;
  extractedFacts: ExtractedFact[];
  phoneticCorrection?: { wrong: string; right: string };
}

export interface MemorySection {
  title: string;
  items: string[];
}

export interface RawWebSource {
  title: string;
  uri: string;
  snippet?: string;
  publisher?: string;
  publishedAt?: string;
  sourceType?: 'news' | 'encyclopedia' | 'official' | 'web';
}

export interface VerifiedWebSource {
  title: string;
  uri: string;
  snippet: string;
  publisher: string;
  publishedAt: string;
  trustScore: number; // 0-100
  trustTier: 'Tier 1 · Oficial / Agência' | 'Tier 2 · Imprensa Verificada' | 'Verificado';
}

export interface WeatherTelemetry {
  locationName: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  precipitationMm: number;
  weatherCode: number;
  conditionText: string;
  isDay: boolean;
  dailyForecast: Array<{
    date: string;
    tempMaxC: number;
    tempMinC: number;
    conditionText: string;
    precipProbPercent: number;
  }>;
  updatedAt: string;
  source: string;
}

export interface NetworkRouterTelemetry {
  routerModel: string;
  gatewayIp: string;
  wanIp: string;
  isp: string;
  status: 'online' | 'degraded';
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  dnsPrimary: string;
  wifiBand: string;
  totalRxGbToday: number;
  totalTxGbToday: number;
  connectedDevicesCount: number;
  lastScanTime?: string;
  subnetCidr?: string;
  trafficHistory: Array<{
    time: string;
    downMbps: number;
    upMbps: number;
    pingMs: number;
  }>;
}

export interface HomelabMachine {
  id: string;
  name: string;
  role: string;
  ip: string;
  tailscaleIp: string;
  macAddress?: string;
  vendor?: string;
  iface?: string;
  discoveryMethod?: string;
  trustStatus?: 'trusted' | 'unknown' | 'blocked';
  lastActionOutput?: string;
  os: string;
  specs: string;
  status: 'online' | 'idle' | 'sleeping' | 'offline';
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  tempC: number;
  gpuName?: string;
  vramUsedMb?: number;
  vramTotalMb?: number;
  gpuUtilPercent?: number;
  netDownMbps: number;
  netUpMbps: number;
  uptime: string;
  services: Array<{ name: string; port: number; status: 'running' | 'stopped' }>;
}

export interface FullSystemTelemetry {
  timestamp: string;
  weather: WeatherTelemetry;
  network: NetworkRouterTelemetry;
  machines: HomelabMachine[];
  gpuSummary: string;
  ramSummary: string;
}

export interface ParsedMessageSegment {
  type: 'text' | 'artifact' | 'pdf' | 'image';
  content: string;
  id?: string;
  title?: string;
  lang?: string;
  isClosed?: boolean;
  linesCount?: number;
}

export const DEFAULT_MEMORY_MD = `# Memória Central do J.A.R.V.I.S.

## Identidade & Perfil
- Nome: Dinis Portela Sousa (Shad3 / Asura / 17Asura)
- Localização: Darque, Viana do Castelo, Portugal (GPS: 41.6844, -8.7956)
- Estatuto: Trabalhador-Estudante (Vigilante de Segurança Privada + Estudante de Engenharia)
- Estudos: Licenciatura em Engenharia de Sistemas Informáticos (Pós-Laboral) no IPCA (Barcelos)
- Música: Produtor e artista independente (Trap melancólico / Emo Trap / Pop) — single "FL!RTY", projeto "ECLIPSE"
- Veículo: Renault Clio IV Limited Deluxe 0.9 TCe 90cv (2015)

## Hardware & Infraestrutura Local
- Desktop (Shad3-PC): AMD Ryzen 7 5800X, ASUS TUF B450M-PLUS GAMING, RTX 3060 Ti (8GB VRAM), 32GB RAM DDR4
- Portátil (VivoBook-15): ASUS VivoBook 15 (Ryzen 7 5825U, 16GB RAM, Linux Mint)
- Smartphone: Samsung Galaxy S24 Ultra (Tailscale Mesh ativo)
- Homelab (Ubuntu-Homelab): Ubuntu Server 24.04, Docker, Nginx, Tailscale, Nextcloud, code-server, domínio shad3.dev
- Router Principal: Gateway Fibra 1Gbps (192.168.1.1) com DNS AdGuard + WireGuard / Tailscale subnet router

## Projetos Ativos & Stack
- Stack principal: C# (.NET 10), C, Python, SQL Server, SQLite, React, Vite, Express, Docker, Linux Mint
- Projetos: AppRAN (licenciamento Reserva Agrícola Nacional para AMS), UniSync AI / Vibed_Study, Assistente Local J.A.R.V.I.S.

## Preferências & Regras de Resposta
- Idioma estrito: Português de Portugal (PT-PT)
- Estilo de voz: Natural, fluido, direto, conciso e com acesso em tempo real a meteorologia, GPS, tráfego do router, scanner de rede e verificação de notícias fidedignas.

## Factos & Notas Aprendidas
- [2026-11-12] O motor de Memória Instantânea L1-L4 está ativo para retenção imediata de factos e contexto doméstico.
`;

// ============================================================================
// 1. MOTOR DE CREDIBILIDADE & FILTRO ANTI-DESINFORMAÇÃO (WEB & NOTÍCIAS)
// ============================================================================
const BLOCKED_OR_UNTRUSTED_PATTERNS = [
  /clickbait/i,
  /fakenews/i,
  /boato/i,
  /rumor-mill/i,
  /conspirac/i,
  /tabloid-gossip/i,
  /spam/i,
  /adserver/i
];

const TIER1_TRUSTED_PUBLISHERS = [
  'rtp',
  'lusa',
  'público',
  'publico',
  'expresso',
  'observador',
  'reuters',
  'associated press',
  'ap news',
  'bbc',
  'euronews',
  'wikipedia',
  'wikipédia',
  'wikidata',
  'diário da república',
  'gov.pt',
  'ipma',
  'nature',
  'science',
  'ieee',
  'guardian',
  'financial times',
  'bloomberg',
  'dw',
  'france 24',
  'afp'
];

const TIER2_VERIFIED_PUBLISHERS = [
  'sic notícias',
  'sic noticias',
  'cnn portugal',
  'jornal de notícias',
  'dn',
  'diário de notícias',
  'eco',
  'sapo',
  'tek sapo',
  'pplware',
  'renascença',
  'tsf',
  'zerozero',
  'abola',
  'record',
  'ojogo',
  'ars technica',
  'the verge',
  'wired',
  'techcrunch',
  'github',
  'microsoft',
  'nvidia'
];

export function scoreAndFilterTrustedSources(rawSources: RawWebSource[]): VerifiedWebSource[] {
  if (!Array.isArray(rawSources) || rawSources.length === 0) return [];

  const seenTitles = new Set<string>();
  const verified: VerifiedWebSource[] = [];

  for (const item of rawSources) {
    const title = (item.title || '').trim();
    const uri = (item.uri || '').trim();
    const snippet = (item.snippet || '').trim();
    const publisher = (item.publisher || 'Fonte Web').trim();

    if (!title || !uri) continue;

    const combinedText = `${title} ${uri} ${publisher} ${snippet}`;
    if (BLOCKED_OR_UNTRUSTED_PATTERNS.some((pat) => pat.test(combinedText))) {
      continue;
    }

    const normTitle = title.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '').slice(0, 48);
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);

    const lowerPubAndUri = `${publisher} ${uri} ${title}`.toLowerCase();
    let trustScore = 76;
    let trustTier: VerifiedWebSource['trustTier'] = 'Verificado';

    if (
      item.sourceType === 'encyclopedia' ||
      item.sourceType === 'official' ||
      TIER1_TRUSTED_PUBLISHERS.some((p) => lowerPubAndUri.includes(p)) ||
      /\.(gov\.pt|europa\.eu|edu|org)\b/i.test(uri)
    ) {
      trustScore = 96;
      trustTier = 'Tier 1 · Oficial / Agência';
    } else if (
      TIER2_VERIFIED_PUBLISHERS.some((p) => lowerPubAndUri.includes(p)) ||
      item.sourceType === 'news'
    ) {
      trustScore = 88;
      trustTier = 'Tier 2 · Imprensa Verificada';
    }

    // Só aceita fontes com credibilidade >= 75
    if (trustScore >= 75) {
      verified.push({
        title,
        uri,
        snippet: snippet || title,
        publisher,
        publishedAt: item.publishedAt || new Date().toLocaleDateString('pt-PT'),
        trustScore,
        trustTier
      });
    }
  }

  return verified.sort((a, b) => b.trustScore - a.trustScore).slice(0, 8);
}

export function shouldTriggerWebVerification(userText: string): boolean {
  const q = (userText || '').trim().toLowerCase();
  if (q.length < 4) return false;
  // Ignorar comandos puramente locais de código ou memória simples sem pergunta externa
  if (/^(lembra-te que|guarda que|memoriza que|quando eu disser)\b/i.test(q) && !/\?/.test(q)) {
    return false;
  }
  return /\b(notícias|noticias|últimas|ultimas|atualidade|hoje|ontem|2025|2026|quem é|quem foi|biografia|história de|historia de|o que é|o que aconteceu|onde fica|presidente|primeiro-ministro|ministro|seleção|jogo|resultado|classificação|preço|cotação|bitcoin| ações|empresa| CEO|fundador|morreu|nasceu|idade|filme|música|álbum|lançamento|pesquisa|procura na internet|verifica|facto|verdade|mentira|falso|mundo|portugal|europa|eua)\b/i.test(
    q
  ) || q.includes('?');
}

// ============================================================================
// 2. SCANNER REAL DE REDE (ARP / IP NEIGH / OUI MAC VENDOR / WAKE-ON-LAN)
// ============================================================================
const OUI_VENDOR_PREFIXES: Record<string, string> = {
  '00:50:56': 'VMware Virtual NIC',
  '00:0C:29': 'VMware Host',
  '52:54:00': 'QEMU / KVM Virtual NIC',
  'BC:24:11': 'Proxmox / Container NIC',
  '02:42:AC': 'Docker Container Network',
  'B8:27:EB': 'Raspberry Pi Foundation',
  'DC:A6:32': 'Raspberry Pi Trading',
  'E4:5F:01': 'Raspberry Pi 4/5',
  '04:42:1A': 'ASUS Computer',
  '3C:7C:3F': 'ASUS / ASUSTek',
  '04:D4:C4': 'ASUSTeK Computer (Shad3-PC / VivoBook)',
  '2C:FD:A1': 'ASUSTeK Computer',
  'F0:2F:74': 'ASUSTeK Computer',
  'A8:5E:45': 'ASUSTeK Computer',
  '18:C0:4D': 'Gigabyte / Workstation NIC',
  'D8:BB:C1': 'Micro-Star (MSI)',
  '00:E0:4C': 'Realtek Semiconductor (2.5GbE / GbE)',
  '24:4B:FE': 'Samsung Electronics (Galaxy S24 Ultra)',
  'C8:3A:6B': 'Samsung Electronics',
  'F4:7B:09': 'Samsung Electronics',
  '8C:85:90': 'Apple Inc.',
  'F0:18:98': 'Apple Inc.',
  '50:EC:50': 'Xiaomi Communications',
  '70:4F:57': 'TP-Link Technologies (Router / Mesh)',
  'B0:BE:76': 'TP-Link Router/Mesh',
  'E8:9F:80': 'Sagemcom / Altice MEO Fibra Gateway',
  '9C:97:26': 'Technicolor / NOS / Vodafone Gateway',
  '30:B5:C2': 'TP-Link / Mesh AP',
  '24:5A:4C': 'Ubiquiti Networks',
  '74:83:C2': 'Ubiquiti Networks',
  '24:6F:28': 'Espressif IoT (ESP32 Smart Home)'
};

export function lookupMacVendor(mac: string): string {
  if (!mac) return 'Dispositivo LAN';
  const clean = mac.trim().toUpperCase().replace(/-/g, ':');
  if (clean === '00:00:00:00:00:00' || clean === 'FF:FF:FF:FF:FF:FF') {
    return 'Interface do Sistema';
  }
  const prefix = clean.slice(0, 8);
  if (OUI_VENDOR_PREFIXES[prefix]) {
    return OUI_VENDOR_PREFIXES[prefix];
  }
  // Verificar bit Locally Administered (2, 6, A, E no segundo hex char do primeiro octeto)
  const secondChar = clean.charAt(1);
  if (['2', '6', 'A', 'E'].includes(secondChar)) {
    return 'MAC Privado / Virtual (Android / iOS / Container)';
  }
  return 'Equipamento Ethernet / Wi-Fi (IEEE 802)';
}

export interface ParsedArpEntry {
  ip: string;
  mac: string;
  vendor: string;
  iface: string;
  state: string;
}

export function parseArpTableOutput(arpProcText: string, ipNeighText: string = ''): ParsedArpEntry[] {
  const map = new Map<string, ParsedArpEntry>();

  // 1. Parse /proc/net/arp format:
  // IP address       HW type     Flags       HW address            Mask     Device
  // 192.168.1.1      0x1         0x2         e8:9f:80:11:22:33     *        enp4s0
  for (const rawLine of (arpProcText || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('IP address')) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 6) {
      const ip = parts[0];
      const flags = parts[2];
      const mac = parts[3].toUpperCase();
      const iface = parts[5];
      if (
        /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) &&
        /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) &&
        mac !== '00:00:00:00:00:00' &&
        flags !== '0x0'
      ) {
        map.set(ip, { ip, mac, vendor: lookupMacVendor(mac), iface, state: 'REACHABLE' });
      }
    }
  }

  // 2. Parse `ip neigh show` format:
  // 192.168.1.20 dev enp4s0 lladdr 04:d4:c4:aa:bb:cc REACHABLE
  for (const rawLine of (ipNeighText || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s+dev\s+(\S+)\s+lladdr\s+([0-9a-fA-F:]{17})\s+(\S+)/);
    if (m) {
      const ip = m[1];
      const iface = m[2];
      const mac = m[3].toUpperCase();
      const state = m[4].toUpperCase();
      if (mac !== '00:00:00:00:00:00' && state !== 'FAILED' && state !== 'INCOMPLETE') {
        map.set(ip, { ip, mac, vendor: lookupMacVendor(mac), iface, state });
      }
    }
  }

  return Array.from(map.values());
}

export function createWakeOnLanPacket(mac: string): Uint8Array {
  const cleanHex = (mac || '').replace(/[^0-9a-fA-F]/g, '');
  if (cleanHex.length !== 12) {
    throw new Error(`Endereço MAC inválido para Wake-on-LAN: ${mac}`);
  }
  const macBytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    macBytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  const packet = new Uint8Array(102);
  for (let i = 0; i < 6; i++) {
    packet[i] = 0xff;
  }
  for (let rep = 1; rep <= 16; rep++) {
    packet.set(macBytes, rep * 6);
  }
  return packet;
}

export function mapWmoWeatherCodeToPt(code: number): string {
  const map: Record<number, string> = {
    0: 'Céu limpo',
    1: 'Geralmente limpo',
    2: 'Parcialmente nublado',
    3: 'Encoberto',
    45: 'Nevoeiro',
    48: 'Nevoeiro com geada',
    51: 'Chuvisco fraco',
    53: 'Chuvisco moderado',
    55: 'Chuvisco denso',
    61: 'Chuva fraca',
    63: 'Chuva moderada',
    65: 'Chuva forte',
    71: 'Neve fraca',
    80: 'Aguaceiros fracos',
    81: 'Aguaceiros moderados',
    82: 'Aguaceiros fortes',
    95: 'Trovoada',
    96: 'Trovoada com granizo'
  };
  return map[code] || 'Condições variáveis';
}

export function classifyMemoryCategory(factText: string): string {
  const lower = factText.toLowerCase();
  if (/\b(rtx|gpu|cpu|ram|servidor|ubuntu|docker|router|ip|porta|tailscale|nextcloud|homelab|portátil|pc|máquina|rede|wifi)\b/.test(lower)) {
    return 'Hardware & Infraestrutura Local';
  }
  if (/\b(projeto|c#|python|react|sql|appran|unisync|código|api|git|exame|ipca|aula|trabalho|estudo)\b/.test(lower)) {
    return 'Projetos Ativos & Stack';
  }
  if (/\b(prefiro|fala sempre|responde|idioma|voz|estilo|chama-me|nunca uses)\b/.test(lower)) {
    return 'Preferências & Regras de Resposta';
  }
  if (/\b(chamo-me|vivo em|moro em|meu carro|minha namorada|anos|música|single)\b/.test(lower)) {
    return 'Identidade & Perfil';
  }
  return 'Factos & Notas Aprendidas';
}

export function insertFactIntoMarkdownSection(
  markdown: string,
  category: string,
  bulletLine: string
): string {
  const baseMd = markdown.trim() || DEFAULT_MEMORY_MD.trim();
  const lines = baseMd.split('\n');
  const headerTarget = `## ${category}`.toLowerCase();

  let sectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase() === headerTarget) {
      sectionIdx = i;
      break;
    }
  }

  if (sectionIdx === -1) {
    return `${baseMd}\n\n## ${category}\n${bulletLine}\n`;
  }

  let insertAt = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('## ')) {
      insertAt = i;
      break;
    }
  }

  while (insertAt > sectionIdx + 1 && lines[insertAt - 1].trim() === '') {
    insertAt--;
  }

  lines.splice(insertAt, 0, bulletLine);
  return lines.join('\n').trim() + '\n';
}

export function extractInstantMemories(
  userText: string,
  existingMarkdown: string,
  dateStamp: string = new Date().toISOString().slice(0, 10)
): InstantMemoryResult {
  const cleanInput = (userText || '').trim();
  if (!cleanInput) {
    return { updated: false, newMarkdown: existingMarkdown, extractedFacts: [] };
  }

  let currentMd = existingMarkdown || DEFAULT_MEMORY_MD;
  const extractedFacts: ExtractedFact[] = [];
  let phoneticCorrection: { wrong: string; right: string } | undefined;

  const phoneticRegex = /(?:quando eu disser|se eu disser|corrige a palavra)\s+['"]?([\w\sÀ-ÿ-]+?)['"]?\s+(?:escreve|entende|corrige para|para|é)\s+['"]?([\w\sÀ-ÿ#.\-+]+?)['"]?(?:[.!?]|$)/i;
  const mCorr = cleanInput.match(phoneticRegex);
  if (mCorr) {
    const wrong = mCorr[1].trim().toLowerCase();
    const right = mCorr[2].trim();
    if (wrong && right && wrong !== right.toLowerCase()) {
      phoneticCorrection = { wrong, right };
      const factStr = `Correção fonética de voz: "${wrong}" → "${right}"`;
      const category = 'Preferências & Regras de Resposta';
      const bullet = `- [${dateStamp}] ${factStr}`;
      if (!currentMd.toLowerCase().includes(factStr.toLowerCase())) {
        currentMd = insertFactIntoMarkdownSection(currentMd, category, bullet);
        extractedFacts.push({
          id: `mem_${Date.now()}_phon`,
          category,
          fact: factStr,
          timestamp: dateStamp,
          triggerType: 'phonetic'
        });
      }
    }
  }

  const explicitPatterns = [
    /(?:lembra-te que|lembra te que|lembra-te de que|lembra-te:|guarda na memória que|guarda na memória:|guarda que|memoriza que|aponta que|nota que|não te esqueças que|regista que)\s+([^.!?\n]+(?:[.!?\n]|$))/gi
  ];

  for (const pat of explicitPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pat.exec(cleanInput)) !== null) {
      let rawFact = match[1].trim().replace(/[.!?]+$/, '').trim();
      rawFact = rawFact.replace(/\s+e\s+(?:como|qual|quais|onde|quanto|podes|diz-me)\b.*$/i, '').trim();
      if (rawFact.length >= 4) {
        const formattedFact = rawFact.charAt(0).toUpperCase() + rawFact.slice(1);
        const category = classifyMemoryCategory(formattedFact);
        const bullet = `- [${dateStamp}] ${formattedFact}`;
        if (!currentMd.toLowerCase().includes(formattedFact.toLowerCase())) {
          currentMd = insertFactIntoMarkdownSection(currentMd, category, bullet);
          extractedFacts.push({
            id: `mem_${Date.now()}_${extractedFacts.length}`,
            category,
            fact: formattedFact,
            timestamp: dateStamp,
            triggerType: 'explicit'
          });
        }
      }
    }
  }

  if (extractedFacts.length === 0) {
    const implicitPatterns = [
      /(?:comprei um|comprei uma|instalei o|instalei a|configurei o|configurei a|mudei a porta d[oa]|o meu novo projeto é|estou a desenvolver o|tenho exame de|tenho teste de)\s+([^.!?\n]+)/i
    ];
    for (const pat of implicitPatterns) {
      const m = cleanInput.match(pat);
      if (m && m[0]) {
        let rawFact = m[0].trim().replace(/[.!?]+$/, '').trim();
        rawFact = rawFact.replace(/\s+e\s+(?:como|qual|quais|onde|quanto|podes|diz-me)\b.*$/i, '').trim();
        if (rawFact.length >= 6) {
          const formattedFact = rawFact.charAt(0).toUpperCase() + rawFact.slice(1);
          const category = classifyMemoryCategory(formattedFact);
          const bullet = `- [${dateStamp}] ${formattedFact}`;
          if (!currentMd.toLowerCase().includes(formattedFact.toLowerCase())) {
            currentMd = insertFactIntoMarkdownSection(currentMd, category, bullet);
            extractedFacts.push({
              id: `mem_${Date.now()}_imp`,
              category,
              fact: formattedFact,
              timestamp: dateStamp,
              triggerType: 'implicit'
            });
          }
        }
      }
    }
  }

  return {
    updated: extractedFacts.length > 0,
    newMarkdown: currentMd,
    extractedFacts,
    phoneticCorrection
  };
}

export function parseMemorySections(markdown: string): MemorySection[] {
  const lines = (markdown || DEFAULT_MEMORY_MD).split('\n');
  const sections: MemorySection[] = [];
  let current: MemorySection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), items: [] };
      sections.push(current);
    } else if (line.startsWith('- ') && current) {
      current.items.push(line.slice(2).trim());
    }
  }
  return sections;
}

export function applyPhoneticCorrections(
  text: string,
  corrections: Record<string, string>
): string {
  if (!text || !corrections) return text || '';
  let result = text;
  const sortedKeys = Object.keys(corrections).sort((a, b) => b.length - a.length);
  for (const wrong of sortedKeys) {
    if (!wrong.trim()) continue;
    const right = corrections[wrong];
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi');
    result = result.replace(regex, right);
  }
  return result;
}

export function prepareTextForNaturalSpeech(text: string): string {
  if (!text) return '';
  let t = text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\s\S]*?```/g, '');

  const replacements: Array<[RegExp, string]> = [
    [/(\d+)\.(\d+)\s*°C\b/gi, '$1 vírgula $2 graus'],
    [/(\d+)\s*°C\b/gi, '$1 graus'],
    [/(\d+)\.(\d+)\s*%/g, '$1 vírgula $2 por cento'],
    [/(\d+)\s*%/g, '$1 por cento'],
    [/(\d+)\.(\d+)\s*Mbps\b/gi, '$1 vírgula $2 megabits por segundo'],
    [/(\d+)\.(\d+)\s*Gbps\b/gi, '$1 vírgula $2 gigabits por segundo'],
    [/(\d+)\.(\d+)\s*GB\b/gi, '$1 vírgula $2 gigabytes'],
    [/(\d+)\s*GB\b/gi, '$1 gigabytes'],
    [/(\d+)\s*MB\b/gi, '$1 megabytes'],
    [/(\d+)\.(\d+)\s*ms\b/gi, '$1 vírgula $2 milissegundos'],
    [/(\d+)\s*ms\b/gi, '$1 milissegundos'],
    [/(\d+)\.(\d+)\s*km\/h\b/gi, '$1 vírgula $2 quilómetros por hora'],
    [/(\d+)\s*km\/h\b/gi, '$1 quilómetros por hora'],
    [/\bC#/gi, 'C Sharp'],
    [/\.NET\b/gi, 'Dot Net'],
    [/\bSQLite\b/gi, 'S Q Lite'],
    [/\bSQL\b/gi, 'S Q L'],
    [/\bIPCA\b/gi, 'Ipca'],
    [/\bAPI\b/gi, 'A P I'],
    [/\bGPU\b/gi, 'G P U'],
    [/\bCPU\b/gi, 'C P U'],
    [/\bVRAM\b/gi, 'V Ram'],
    [/\bRTX 3060 Ti\b/gi, 'R T X 30 60 T I'],
    [/\bMoE\b/g, 'M o E'],
    [/\bAppRAN\b/gi, 'App Rã'],
    [/\bMbps\b/gi, 'megabits por segundo'],
    [/\bGbps\b/gi, 'gigabits por segundo'],
    [/\.md\b/gi, ' Markdown'],
    [/\bJSON\b/gi, 'Jason'],
    [/↓/g, 'de download'],
    [/↑/g, 'de upload']
  ];

  for (const [pat, rep] of replacements) {
    t = t.replace(pat, rep);
  }
  t = t.replace(/[*#_`~>|]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

export function shouldFlushSpeechChunk(
  sentenceBuffer: string,
  latestToken: string,
  isFirstChunk: boolean
): boolean {
  const trimmedLen = sentenceBuffer.trim().length;
  if (trimmedLen < 6) return false;

  if (isFirstChunk) {
    if (trimmedLen >= 8 && /[,.;:!?\n—-]/.test(latestToken)) return true;
    if (trimmedLen >= 34 && /\s/.test(latestToken)) return true;
    return false;
  }

  if (trimmedLen >= 26 && /[.;:!?\n]/.test(latestToken)) return true;
  if (trimmedLen >= 48 && /[,—-]/.test(latestToken)) return true;
  return false;
}

export function parseMessageSegments(msgId: string, rawContent: string): ParsedMessageSegment[] {
  const cleanText = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!cleanText) return [];

  const segments: ParsedMessageSegment[] = [];
  const regex = /```([a-zA-Z0-9_:-]*)\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(cleanText)) !== null) {
    const before = cleanText.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ type: 'text', content: before });
    }

    const rawTag = (match[1] || 'code').trim();
    const body = match[2] || '';
    const isClosed = match[0].endsWith('```');
    const lowerTag = rawTag.toLowerCase();

    if (lowerTag.startsWith('pdf')) {
      const title = rawTag.includes(':')
        ? rawTag.split(':').slice(1).join(':').replace(/_/g, ' ')
        : 'Documento J.A.R.V.I.S.';
      segments.push({
        type: 'pdf',
        id: `pdf_${msgId}_${idx++}`,
        title,
        content: body.trim(),
        isClosed
      });
    } else if (lowerTag === 'image' || lowerTag === 'img') {
      segments.push({
        type: 'image',
        id: `img_${msgId}_${idx++}`,
        content: body.trim(),
        isClosed
      });
    } else {
      const lang = rawTag.split(':')[0] || 'code';
      const title = rawTag.includes(':')
        ? rawTag.split(':').slice(1).join(':').replace(/_/g, ' ')
        : `Artefacto ${lang.toUpperCase()}`;
      segments.push({
        type: 'artifact',
        id: `art_${msgId}_${idx++}`,
        title,
        lang,
        content: body,
        isClosed,
        linesCount: body.split('\n').length
      });
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = cleanText.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: 'text', content: remaining });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: cleanText }];
}

export interface PromptContextOptions {
  isVoiceMode?: boolean;
  selectedModelName?: string;
  reasoningMode?: 'voice_instant' | 'hybrid_smart' | 'deep_reasoning';
  verifiedWebDossier?: string;
}

export function buildSystemPromptWithLiveContext(
  userText: string,
  memoryMd: string,
  telemetry: FullSystemTelemetry | null,
  options?: PromptContextOptions
): string {
  const lower = (userText || '').toLowerCase();
  const wantsPdf = /\b(pdf|documento pdf|gera um pdf|cria um pdf|exporta para pdf)\b/.test(lower);
  const wantsImage = /\b(gera uma imagem|cria uma imagem|desenha uma imagem|gera uma foto|cria uma foto)\b/.test(lower);
  const isVoice = options?.isVoiceMode ?? false;
  const activeEngine = options?.selectedModelName || 'Qwen3-30B-A3B-Instruct-2507 (Turbo MoE)';
  const rMode = options?.reasoningMode || (isVoice ? 'voice_instant' : 'hybrid_smart');

  let telemetrySection = '';
  if (telemetry) {
    const w = telemetry.weather;
    const net = telemetry.network;
    const machinesList = telemetry.machines
      .map(
        (m) =>
          `  * ${m.name} [IP: ${m.ip} | MAC: ${m.macAddress || 'N/A'} | Fabricante: ${m.vendor || 'LAN'} | Estado: ${m.status.toUpperCase()}]: CPU ${m.cpuPercent}%, RAM ${m.ramUsedGb}/${m.ramTotalGb}GB, Temp ${m.tempC}°C, Portas Abertas: ${
            m.services.map((s) => `${s.name}(:${s.port})`).join(', ') || 'Nenhuma'
          }`
      )
      .join('\n');

    telemetrySection = `
TELEMETRIA EM TEMPO REAL (METEOROLOGIA/GPS, SCANNER DE REDE ARP/NMAP & MÁQUINAS DESCOBERTAS):
- Data/Hora Atual: ${new Date().toLocaleString('pt-PT')}
- Motor AI Ativo na RTX 3060 Ti: ${activeEngine} (Modo: ${rMode})
- Localização GPS & Meteorologia (${w.locationName} [${w.latitude.toFixed(4)}, ${w.longitude.toFixed(4)}]):
  * Estado: ${w.conditionText}, Temperatura: ${w.temperatureC}°C (Sensação: ${w.apparentTemperatureC}°C)
  * Humidade: ${w.humidityPercent}%, Vento: ${w.windSpeedKmh} km/h, Precipitação: ${w.precipitationMm} mm
- Router & Scanner de Rede (${net.routerModel} - Gateway ${net.gatewayIp} / Sub-rede ${net.subnetCidr || '192.168.1.0/24'}):
  * Latência Ping: ${net.pingMs} ms | Velocidade: Download ${net.downloadMbps} Mbps / Upload ${net.uploadMbps} Mbps
  * Dispositivos Reais Detetados no Scan LAN/ARP: ${telemetry.machines.length} equipamentos ligados
- Lista Exata de Dispositivos Ligados na Rede:
${machinesList}
`;
  }

  const voiceHumanInstruction = isVoice
    ? `\nMODO VOZ DIRETO ATIVO (PROSÓDIA HUMANA ULTRA-RÁPIDA):
- Estás a falar em voz alta com o Dinis em tempo real. Sê caloroso, expressivo, espontâneo e 100% humano!
- Começa com uma expressão curta seguida de vírgula (ex: "Olha, Dinis,", "Ora bem,", "Claro,", "Deixa-me ver aqui,") para que o motor de voz comece a falar em menos de 150ms.
- NUNCA uses listas com bullets, asteriscos ou formatação robótica quando falas; liga as ideias numa frase corrida, natural e direta (1 a 2 frases curtas).`
    : `\nESTILO DE CONVERSAÇÃO HUMANA:
- Fala como um parceiro de engenharia próximo, perspicaz e natural em Português de Portugal (PT-PT), sem soar a assistente robótico.`;

  let prompt = `O teu nome é J.A.R.V.I.S. És o parceiro pessoal de voz, inteligência artificial e centro de comando doméstico do Dinis.
${voiceHumanInstruction}

REGRAS DE OURO E RIGOR FACTUAL (ZERO ALUCINAÇÕES):
1. Fala SEMPRE em Português de Portugal (PT-PT) autêntico, humano, fluido e natural.
2. PROTOCOLO ANTI-DESINFORMAÇÃO: Nunca inventes notícias, datas, cargos políticos, resultados desportivos ou factos biográficos sobre pessoas. Quando o "DOSSIÊ DE FACTO-CHECKING & NOTÍCIAS VERIFICADAS EM TEMPO REAL" estiver presente abaixo, baseia a tua resposta EXCLUSIVAMENTE nesses dados verificados e menciona a fonte fidedigna (ex: RTP, Lusa, Público, Reuters, Wikipédia). Se algo não puder ser confirmado com certeza, admite-o abertamente.
3. REDE E DISPOSITIVOS: Usa apenas os IPs, endereços MAC, fabricantes e portas que constam na "Lista Exata de Dispositivos Ligados na Rede" abaixo (obtidos por scan real ARP/Nmap).
4. ARTEFACTOS DE CÓDIGO (ESTILO CLAUDE): Quando o Dinis pedir código ou uma página HTML/3D, diz primeiro 1 frase curta introdutória e coloca o código COMPLETO dentro de \`\`\`linguagem:Titulo_Do_Artefacto ... \`\`\`.
   - REGRA CRÍTICA PARA HTML/WEB: Escreve SEMPRE o ficheiro completo até ao \`</html>\` final!
5. PROIBIDO CRIAR PDFs OU IMAGENS NÃO SOLICITADOS: NUNCA uses blocos \`\`\`pdf nem \`\`\`image a menos que o Dinis tenha pedido explicitamente na mensagem atual.`;

  if (wantsPdf) {
    prompt += `\n6. O DINIS PEDIU UM PDF AGORA: Inclui o documento num bloco \`\`\`pdf:Titulo_Do_PDF\nConteúdo...\n\`\`\`.`;
  }
  if (wantsImage) {
    prompt += `\n6. O DINIS PEDIU UMA IMAGEM AGORA: Inclui a descrição visual num bloco \`\`\`image\nDescrição detalhada...\n\`\`\`.`;
  }

  if (options?.verifiedWebDossier) {
    prompt += `\n\n### DOSSIER DE FACT-CHECKING & NOTÍCIAS VERIFICADAS EM TEMPO REAL:\n${options.verifiedWebDossier}\n`;
  }

  prompt += `\n${telemetrySection}\nMEMÓRIA PERSISTENTE INSTANTÂNEA DO DINIS (core_memory.md):\n${memoryMd || DEFAULT_MEMORY_MD}`;
  return prompt;
}
