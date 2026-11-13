import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInstantMemories,
  applyPhoneticCorrections,
  prepareTextForNaturalSpeech,
  shouldFlushSpeechChunk,
  parseMessageSegments,
  parseMemorySections,
  buildSystemPromptWithLiveContext,
  scoreAndFilterTrustedSources,
  shouldTriggerWebVerification,
  lookupMacVendor,
  parseArpTableOutput,
  createWakeOnLanPacket,
  DEFAULT_MEMORY_MD
} from './jarvisLogic';
import {
  RTX_3060_TI_MODELS,
  calculateRtx3060TiAllocation
} from './rtxOptimizer';

test('extractInstantMemories extracts explicit memory commands and categorizes them', () => {
  const input = 'Jarvis, lembra-te que o servidor backup corre na porta 8090 e como está o tempo?';
  const res = extractInstantMemories(input, DEFAULT_MEMORY_MD, '2026-11-12');
  assert.equal(res.updated, true);
  assert.equal(res.extractedFacts.length, 1);
  assert.equal(res.extractedFacts[0].category, 'Hardware & Infraestrutura Local');
  assert.equal(res.extractedFacts[0].fact, 'O servidor backup corre na porta 8090');
  assert.ok(res.newMarkdown.includes('- [2026-11-12] O servidor backup corre na porta 8090'));
});

test('extractInstantMemories extracts voice phonetic correction commands', () => {
  const input = 'Quando eu disser jarbas escreve Jarvis.';
  const res = extractInstantMemories(input, DEFAULT_MEMORY_MD, '2026-11-12');
  assert.equal(res.updated, true);
  assert.deepEqual(res.phoneticCorrection, { wrong: 'jarbas', right: 'Jarvis' });
});

test('extractInstantMemories deduplicates existing facts', () => {
  const first = extractInstantMemories(
    'Memoriza que tenho exame de C# na sexta-feira.',
    DEFAULT_MEMORY_MD,
    '2026-11-12'
  );
  assert.equal(first.updated, true);
  const second = extractInstantMemories(
    'Memoriza que tenho exame de C# na sexta-feira.',
    first.newMarkdown,
    '2026-11-12'
  );
  assert.equal(second.updated, false);
});

test('applyPhoneticCorrections replaces longest match first case-insensitively', () => {
  const corrections = {
    'jarbas': 'Jarvis',
    'ipê cá': 'IPCA',
    'cê sharp': 'C#'
  };
  const corrected = applyPhoneticCorrections(
    'Olá jarbas, ajuda-me no projeto de cê sharp para o ipê cá',
    corrections
  );
  assert.equal(corrected, 'Olá Jarvis, ajuda-me no projeto de C# para o IPCA');
});

test('prepareTextForNaturalSpeech cleans code blocks and humanizes units and acronyms', () => {
  const raw = 'Estão 16.5°C e o código C# na RTX 3060 Ti corre a 450 Mbps (5ms):\n```csharp\nConsole.WriteLine();\n```';
  const spoken = prepareTextForNaturalSpeech(raw);
  assert.ok(spoken.includes('16 vírgula 5 graus'));
  assert.ok(spoken.includes('C Sharp'));
  assert.ok(spoken.includes('R T X 30 60 T I'));
  assert.ok(spoken.includes('megabits por segundo'));
  assert.ok(spoken.includes('5 milissegundos'));
  assert.ok(!spoken.includes('Console.WriteLine'));
});

test('shouldFlushSpeechChunk flushes first clause early at >= 8 chars on comma for fast voice TTFA', () => {
  assert.equal(shouldFlushSpeechChunk('Olha, Dinis,', ',', true), true);
  assert.equal(shouldFlushSpeechChunk('Olá', 'á', true), false);
});

test('calculateRtx3060TiAllocation computes exact 8192MB VRAM budget, OOM protection, and CLI flags', () => {
  const moeModel = RTX_3060_TI_MODELS[0];
  const safeAlloc = calculateRtx3060TiAllocation(moeModel, 34, 16384, 'q8_0', 'voice_instant');
  assert.equal(safeAlloc.totalVramMb, 8192);
  assert.equal(safeAlloc.isOomRisk, false);
  assert.ok(safeAlloc.usedVramMb <= 8192);
  assert.ok(safeAlloc.freeVramMb > 150);
  assert.ok(safeAlloc.generatedCommand.includes('--n-cpu-moe 34'));

  const oomAlloc = calculateRtx3060TiAllocation(moeModel, 26, 16384, 'q8_0', 'voice_instant');
  assert.equal(oomAlloc.isOomRisk, true);
});

test('scoreAndFilterTrustedSources filters fake/clickbait news and scores Tier 1 & Tier 2 publishers', () => {
  const raw = [
    {
      title: 'Boato chocante: vais ficar chocado com esta fofoca!',
      uri: 'https://fofocas-fake-news.xyz/artigo',
      snippet: 'Clickbait falso',
      publisher: 'Fofocas XYZ'
    },
    {
      title: 'Banco de Portugal atualiza previsões económicas para 2026 - RTP Notícias',
      uri: 'https://www.rtp.pt/noticias/economia/bds-2026',
      snippet: 'Relatório oficial confirma crescimento do PIB.',
      publisher: 'RTP Notícias',
      publishedAt: '12 Nov 2026'
    },
    {
      title: 'Nova arquitetura NVIDIA e avanços em IA - SAPO Tek',
      uri: 'https://tek.sapo.pt/noticias/computadores/artigo',
      snippet: 'Análise técnica detalhada.',
      publisher: 'SAPO Tek'
    }
  ];

  const verified = scoreAndFilterTrustedSources(raw);
  assert.equal(verified.length, 2);
  assert.equal(verified[0].trustScore, 96);
  assert.equal(verified[0].trustTier, 'Tier 1 · Oficial / Agência');
  assert.equal(verified[1].trustScore, 88);
  assert.equal(verified[1].trustTier, 'Tier 2 · Imprensa Verificada');
});

test('shouldTriggerWebVerification detects news, person queries, and current facts', () => {
  assert.equal(shouldTriggerWebVerification('Quais são as últimas notícias sobre Portugal?'), true);
  assert.equal(shouldTriggerWebVerification('Quem é Cristiano Ronaldo e onde joga atualmente?'), true);
  assert.equal(shouldTriggerWebVerification('Cria um botão em HTML'), false);
});

test('parseArpTableOutput and lookupMacVendor parse Linux ARP & ip neigh and resolve OUI vendor', () => {
  const procArp = `IP address       HW type     Flags       HW address            Mask     Device
192.168.1.1      0x1         0x2         b0:be:76:12:34:56     *        eth0
192.168.1.35     0x1         0x2         04:42:1a:99:88:77     *        eth0`;

  const ipNeigh = `192.168.1.50 dev wlan0 lladdr c8:3a:6b:aa:bb:cc REACHABLE`;

  const entries = parseArpTableOutput(procArp, ipNeigh);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].ip, '192.168.1.1');
  assert.equal(entries[0].vendor, 'TP-Link Router/Mesh');
  assert.equal(entries[1].ip, '192.168.1.35');
  assert.equal(entries[1].vendor, 'ASUS Computer');
  assert.equal(entries[2].ip, '192.168.1.50');
  assert.equal(entries[2].vendor, 'Samsung Electronics');
  assert.equal(lookupMacVendor('3c:7c:3f:11:22:33'), 'ASUS / ASUSTek');
});

test('createWakeOnLanPacket builds valid 102-byte IEEE 802 Magic Packet', () => {
  const pkt = createWakeOnLanPacket('04:42:1A:99:88:77');
  assert.ok(pkt);
  assert.equal(pkt.length, 102);
  // First 6 bytes are 0xFF
  for (let i = 0; i < 6; i++) {
    assert.equal(pkt[i], 0xff);
  }
  // Followed by 16 repetitions of MAC
  assert.equal(pkt[6], 0x04);
  assert.equal(pkt[7], 0x42);
  assert.equal(pkt[8], 0x1a);
  assert.equal(pkt[101], 0x77);
});

test('parseMessageSegments extracts text, code artifacts, pdf, and image blocks', () => {
  const sample = `<think>raciocínio interno</think>Claro Dinis, aqui tens o dashboard:\n\`\`\`html:Monitor_Rede\n<html><body>Olá</body></html>\n\`\`\`\nE o relatório:\n\`\`\`pdf:Relatorio_Red\nLinha 1\n\`\`\``;
  const segs = parseMessageSegments('m1', sample);
  assert.equal(segs.length, 4);
  assert.equal(segs[0].type, 'text');
  assert.equal(segs[1].type, 'artifact');
  assert.equal(segs[1].title, 'Monitor Rede');
  assert.equal(segs[1].lang, 'html');
  assert.equal(segs[2].type, 'text');
  assert.equal(segs[3].type, 'pdf');
  assert.equal(segs[3].title, 'Relatorio Red');
});

test('parseMemorySections parses markdown sections and items accurately', () => {
  const sections = parseMemorySections(DEFAULT_MEMORY_MD);
  assert.ok(sections.length >= 4);
  assert.equal(sections[0].title, 'Identidade & Perfil');
  assert.ok(sections[0].items.some((item) => item.includes('Dinis')));
});

test('buildSystemPromptWithLiveContext injects voice mode prosody and verified web dossier', () => {
  const prompt = buildSystemPromptWithLiveContext('Como está o router?', DEFAULT_MEMORY_MD, null, {
    isVoiceMode: true,
    selectedModelName: 'Qwen3-8B-Instruct (100% VRAM Resident)',
    verifiedWebDossier: '- [RTP Notícias | Confiança: 96%] Notícia verificada'
  });
  assert.ok(prompt.includes('MODO VOZ DIRETO ATIVO'));
  assert.ok(prompt.includes('Dinis Portela Sousa'));
  assert.ok(prompt.includes('DOSSIER DE FACT-CHECKING & NOTÍCIAS VERIFICADAS'));
  assert.ok(prompt.includes('RTP Notícias'));
});
