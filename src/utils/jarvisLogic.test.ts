import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInstantMemories,
  applyPhoneticCorrections,
  prepareTextForNaturalSpeech,
  parseMessageSegments,
  parseMemorySections,
  buildSystemPromptWithLiveContext,
  DEFAULT_MEMORY_MD
} from './jarvisLogic';

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

test('prepareTextForNaturalSpeech cleans code blocks and expands technical acronyms', () => {
  const raw = 'Aqui está o código C# na RTX 3060 Ti a 450 Mbps:\n```csharp\nConsole.WriteLine();\n```';
  const spoken = prepareTextForNaturalSpeech(raw);
  assert.ok(spoken.includes('C Sharp'));
  assert.ok(spoken.includes('R T X 30 60 T I'));
  assert.ok(spoken.includes('megabits por segundo'));
  assert.ok(!spoken.includes('Console.WriteLine'));
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

test('buildSystemPromptWithLiveContext injects weather, router, and homelab telemetry', () => {
  const prompt = buildSystemPromptWithLiveContext('Como está o router?', DEFAULT_MEMORY_MD, null);
  assert.ok(prompt.includes('Português de Portugal'));
  assert.ok(prompt.includes('Dinis Portela Sousa'));
});
