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
- Estilo de voz: Natural, fluido, direto, conciso e com acesso em tempo real a meteorologia, GPS, tráfego do router e máquinas de casa.

## Factos & Notas Aprendidas
- [2026-11-12] O motor de Memória Instantânea L1-L4 está ativo para retenção imediata de factos e contexto doméstico.
`;

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

  // recuar linhas vazias antes do próximo cabeçalho
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

  // 1. Correção fonética por voz: "quando eu disser X escreve Y" / "corrige X para Y"
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

  // 2. Gatilhos explícitos de memória ("lembra-te que...", "guarda na memória...", "memoriza que...", "aponta que...")
  const explicitPatterns = [
    /(?:lembra-te que|lembra te que|lembra-te de que|lembra-te:|guarda na memória que|guarda na memória:|guarda que|memoriza que|aponta que|nota que|não te esqueças que|regista que)\s+([^.!?\n]+(?:[.!?\n]|$))/gi
  ];

  for (const pat of explicitPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pat.exec(cleanInput)) !== null) {
      let rawFact = match[1].trim().replace(/[.!?]+$/, '').trim();
      // Cortar perguntas anexadas no fim (ex: "... e como está o tráfego do router?")
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

  // 3. Gatilhos implícitos de factos pessoais/infraestrutura se nenhum explícito disparou
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
    [/\bAppRAN\b/gi, 'App Rã'],
    [/\bMbps\b/gi, 'megabits por segundo'],
    [/\bGbps\b/gi, 'gigabits por segundo'],
    [/\.md\b/gi, ' Markdown'],
    [/\bJSON\b/gi, 'Jason']
  ];

  for (const [pat, rep] of replacements) {
    t = t.replace(pat, rep);
  }
  t = t.replace(/[*#_`~>|]/g, '');
  return t.replace(/\s+/g, ' ').trim();
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

export function buildSystemPromptWithLiveContext(
  userText: string,
  memoryMd: string,
  telemetry: FullSystemTelemetry | null
): string {
  const lower = (userText || '').toLowerCase();
  const wantsPdf = /\b(pdf|documento pdf|gera um pdf|cria um pdf|exporta para pdf)\b/.test(lower);
  const wantsImage = /\b(gera uma imagem|cria uma imagem|desenha uma imagem|gera uma foto|cria uma foto)\b/.test(lower);

  let telemetrySection = '';
  if (telemetry) {
    const w = telemetry.weather;
    const net = telemetry.network;
    const machinesList = telemetry.machines
      .map(
        (m) =>
          `  * ${m.name} (${m.ip} / Tailscale ${m.tailscaleIp}) [${m.status.toUpperCase()}]: CPU ${m.cpuPercent}%, RAM ${m.ramUsedGb}/${m.ramTotalGb}GB, Temp ${m.tempC}°C${
            m.gpuName ? `, GPU ${m.gpuName} (${m.vramUsedMb}/${m.vramTotalMb}MB VRAM, ${m.gpuUtilPercent}%)` : ''
          }, Tráfego ${m.netDownMbps} Mbps ↓ / ${m.netUpMbps} Mbps ↑`
      )
      .join('\n');

    telemetrySection = `
TELEMETRIA EM TEMPO REAL (INTERNET, METEOROLOGIA/GPS, ROUTER & MÁQUINAS DE CASA):
- Data/Hora Atual: ${new Date().toLocaleString('pt-PT')}
- Localização GPS & Meteorologia (${w.locationName} [${w.latitude.toFixed(4)}, ${w.longitude.toFixed(4)}]):
  * Estado: ${w.conditionText}, Temperatura: ${w.temperatureC}°C (Sensação: ${w.apparentTemperatureC}°C)
  * Humidade: ${w.humidityPercent}%, Vento: ${w.windSpeedKmh} km/h, Precipitação: ${w.precipitationMm} mm
- Router & Tráfego de Internet (${net.routerModel} - Gateway ${net.gatewayIp} / WAN ${net.wanIp}):
  * ISP: ${net.isp} (${net.wifiBand}) | Latência Ping: ${net.pingMs} ms (Jitter ${net.jitterMs} ms, Perda ${net.packetLossPercent}%)
  * Velocidade Atual em Tempo Real: Download ${net.downloadMbps} Mbps | Upload ${net.uploadMbps} Mbps
  * Consumo Hoje: ${net.totalRxGbToday} GB recebidos / ${net.totalTxGbToday} GB enviados | ${net.connectedDevicesCount} dispositivos ativos na LAN
- Estado das Máquinas em Casa (Homelab & Dispositivos):
${machinesList}
`;
  }

  let prompt = `O teu nome é J.A.R.V.I.S. És o assistente pessoal de voz, inteligência artificial e centro de comando doméstico do Dinis.

REGRAS DE OURO:
1. Fala SEMPRE em Português de Portugal (PT-PT) de forma natural, fluida, inteligente e direta (estilo assistente de voz avançado como o ChatGPT Voice).
2. Tens acesso total em tempo real aos sensores de meteorologia/GPS, ao router doméstico (tráfego, ping, dispositivos na rede), às máquinas lá de casa (Shad3-PC com RTX 3060 Ti, Ubuntu-Homelab shad3.dev, VivoBook-15, S24-Ultra) e à internet. Quando o Dinis perguntar pelo tempo, rede, router ou máquinas, responde com os valores exatos da secção TELEMETRIA EM TEMPO REAL abaixo.
3. Em conversa normal ou por voz, sê conciso (1 a 3 frases claras e naturais) para que a síntese de voz seja imediata.
4. ARTEFACTOS DE CÓDIGO (ESTILO CLAUDE): Quando o Dinis pedir código ou uma página HTML/3D, diz primeiro 1 frase curta introdutória e coloca o código COMPLETO dentro de \`\`\`linguagem:Titulo_Do_Artefacto ... \`\`\`.
   - REGRA CRÍTICA PARA HTML/WEB: Escreve SEMPRE o ficheiro completo até ao \`</html>\` final!
5. PROIBIDO CRIAR PDFs OU IMAGENS NÃO SOLICITADOS: NUNCA uses blocos \`\`\`pdf nem \`\`\`image a menos que o Dinis tenha pedido explicitamente na mensagem atual.`;

  if (wantsPdf) {
    prompt += `\n6. O DINIS PEDIU UM PDF AGORA: Inclui o documento num bloco \`\`\`pdf:Titulo_Do_PDF\nConteúdo...\n\`\`\`.`;
  }
  if (wantsImage) {
    prompt += `\n6. O DINIS PEDIU UMA IMAGEM AGORA: Inclui a descrição visual num bloco \`\`\`image\nDescrição detalhada...\n\`\`\`.`;
  }

  prompt += `\n${telemetrySection}\nMEMÓRIA PERSISTENTE INSTANTÂNEA DO DINIS (core_memory.md):\n${memoryMd || DEFAULT_MEMORY_MD}`;
  return prompt;
}
