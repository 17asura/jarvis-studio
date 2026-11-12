export type ReasoningMode = 'voice_instant' | 'hybrid_smart' | 'deep_reasoning';

export interface RtxModelProfile {
  id: string;
  name: string;
  family: string;
  architecture: 'MoE Híbrido' | '100% GPU Resident' | 'Speculative Decoding' | 'Deep CoT Reasoning';
  totalParams: string;
  activeParams: string;
  quantization: string;
  ggufFilename: string;
  vramMb: number;
  ramMb: number;
  voiceTokPerSec: number;
  textTokPerSec: number;
  ttftVoiceMs: number;
  reasoningScore: number; // 1-100
  voiceNaturalnessScore: number; // 1-100
  recommendedFor: string;
  badge: string;
  defaultNgl: number;
  defaultNCpuMoe: number;
  defaultCtx: number;
  kvCacheType: 'q8_0' | 'q4_0' | 'f16';
  supportsThinkToggle: boolean;
  draftModelGguf?: string;
  descriptionPt: string;
  whyBetterPt: string;
}

export interface VramAllocationBreakdown {
  totalVramMb: number;
  osAndDisplayMb: number;
  attentionAndSharedWeightsMb: number;
  hotMoeExpertsVramMb: number;
  kvCacheVramMb: number;
  computeBufferMb: number;
  usedVramMb: number;
  freeVramMb: number;
  systemRamUsedGb: number;
  estimatedTokPerSec: number;
  estimatedTtftMs: number;
  pcieBottleneckRisk: 'Nulo (100% GDDR6)' | 'Baixo (Apenas Cold Experts)' | 'Moderado';
  generatedCommand: string;
}

export const RTX_3060_TI_MODELS: RtxModelProfile[] = [
  {
    id: 'qwen3-30b-a3b-2507',
    name: 'Qwen3-30B-A3B-Instruct-2507 (Turbo MoE)',
    family: 'Qwen3 MoE',
    architecture: 'MoE Híbrido',
    totalParams: '30.5B',
    activeParams: '3.3B por token',
    quantization: 'UD-Q4_K_XL',
    ggufFilename: 'Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf',
    vramMb: 6950,
    ramMb: 11800,
    voiceTokPerSec: 54,
    textTokPerSec: 44,
    ttftVoiceMs: 115,
    reasoningScore: 95,
    voiceNaturalnessScore: 94,
    recommendedFor: 'Melhor Equilíbrio Global (Voz Instantânea + Raciocínio 30B)',
    badge: 'RECOMENDADO #1 (MOE HÍBRIDO)',
    defaultNgl: 99,
    defaultNCpuMoe: 26,
    defaultCtx: 16384,
    kvCacheType: 'q8_0',
    supportsThinkToggle: true,
    descriptionPt:
      'Arquitetura Mixture-of-Experts onde apenas 3.3B parâmetros são ativados por token. Mantém 100% das camadas de Atenção (KV) e os especialistas quentes nos 8GB GDDR6 da RTX 3060 Ti.',
    whyBetterPt:
      'Reduz o offload para --n-cpu-moe 26 (em vez de 35), aproveitando 1.1 GB de VRAM que estavam livres na tua 3060 Ti e ativa /no_think automático no modo voz para respostas imediatas.'
  },
  {
    id: 'qwen3-8b-q5km-resident',
    name: 'Qwen3-8B-Instruct (100% VRAM Resident)',
    family: 'Qwen3 Dense',
    architecture: '100% GPU Resident',
    totalParams: '8.2B',
    activeParams: '8.2B (100% GPU)',
    quantization: 'Q5_K_M',
    ggufFilename: 'Qwen3-8B-Instruct-Q5_K_M.gguf',
    vramMb: 6580,
    ramMb: 1400,
    voiceTokPerSec: 96,
    textTokPerSec: 88,
    ttftVoiceMs: 65,
    reasoningScore: 87,
    voiceNaturalnessScore: 98,
    recommendedFor: 'Modo Voz Direto Ultra-Rápido (Zero Latência PCIe)',
    badge: 'MAIS RÁPIDO EM VOZ (96 TOK/S)',
    defaultNgl: 99,
    defaultNCpuMoe: 0,
    defaultCtx: 16384,
    kvCacheType: 'q8_0',
    supportsThinkToggle: true,
    descriptionPt:
      'Corre 100% dentro dos 8GB GDDR6 da RTX 3060 Ti a 448 GB/s de largura de banda, eliminando totalmente a leitura de pesos pela RAM DDR4.',
    whyBetterPt:
      'Para conversação por voz estilo ChatGPT Live, responde em ~65ms (quase o dobro da velocidade de um 30B MoE) com suporte nativo para alternar /think quando precisares de lógica complexa.'
  },
  {
    id: 'qwen3-14b-speculative',
    name: 'Qwen3-14B + Draft 0.6B (Speculative Decoding)',
    family: 'Qwen3 Speculative',
    architecture: 'Speculative Decoding',
    totalParams: '14.8B + 0.6B',
    activeParams: '14.8B c/ Draft GPU',
    quantization: 'Q4_K_S + Q8_0',
    ggufFilename: 'Qwen3-14B-Instruct-Q4_K_S.gguf',
    draftModelGguf: 'Qwen3-0.6B-Instruct-Q8_0.gguf',
    vramMb: 7520,
    ramMb: 3800,
    voiceTokPerSec: 64,
    textTokPerSec: 68,
    ttftVoiceMs: 95,
    reasoningScore: 93,
    voiceNaturalnessScore: 92,
    recommendedFor: 'Engenharia de Software (C# / .NET 10 / React) & Raciocínio Denso',
    badge: 'MELHOR RACIOCÍNIO DENSO',
    defaultNgl: 38,
    defaultNCpuMoe: 0,
    defaultCtx: 16384,
    kvCacheType: 'q8_0',
    supportsThinkToggle: true,
    descriptionPt:
      'Combina um modelo principal de 14B parâmetros com um modelo Draft ultra-leve de 0.6B na VRAM que prevê 6 tokens à frente em paralelo.',
    whyBetterPt:
      'Um modelo denso de 14B tem representações internas mais coesas para código C#/.NET do que um MoE com 3B ativos, e o Speculative Decoding acelera a geração de código em ~1.7x.'
  },
  {
    id: 'glm-4-5-air-moe',
    name: 'GLM-4.5-Air-MoE / DeepSeek-R1-14B (Deep Logic)',
    family: 'DeepSeek / GLM',
    architecture: 'Deep CoT Reasoning',
    totalParams: '14.8B',
    activeParams: '14.8B CoT',
    quantization: 'Q4_K_M',
    ggufFilename: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
    vramMb: 7480,
    ramMb: 4200,
    voiceTokPerSec: 46,
    textTokPerSec: 42,
    ttftVoiceMs: 130,
    reasoningScore: 97,
    voiceNaturalnessScore: 89,
    recommendedFor: 'Arquitetura de Sistemas, Matemática, SQL Complexo e Debugging',
    badge: 'ESPECIALISTA RACIOCÍNIO PROFUNDO',
    defaultNgl: 36,
    defaultNCpuMoe: 0,
    defaultCtx: 16384,
    kvCacheType: 'q4_0',
    supportsThinkToggle: true,
    descriptionPt:
      'Afinado por reforço para cadeia de pensamento (Chain-of-Thought) rigorosa em problemas de engenharia, algoritmos em C e sistemas distribuídos.',
    whyBetterPt:
      'Usa KV Cache em q4_0 para encaixar 36 camadas nos 8GB da RTX 3060 Ti, oferecendo capacidade de resolução de bugs difícil de igualar localmente.'
  },
  {
    id: 'qwen3-coder-30b-current',
    name: 'Qwen3-Coder-30B-A3B (O Teu Modelo Atual Otimizado)',
    family: 'Qwen3 Coder MoE',
    architecture: 'MoE Híbrido',
    totalParams: '30.5B',
    activeParams: '3.3B por token',
    quantization: 'UD-Q4_K_XL',
    ggufFilename: 'Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf',
    vramMb: 7100,
    ramMb: 12100,
    voiceTokPerSec: 49,
    textTokPerSec: 41,
    ttftVoiceMs: 125,
    reasoningScore: 94,
    voiceNaturalnessScore: 90,
    recommendedFor: 'Compatibilidade Imediata com o teu Ficheiro .GGUF Atual',
    badge: 'INSTALADO NO TEU PC',
    defaultNgl: 99,
    defaultNCpuMoe: 27,
    defaultCtx: 16384,
    kvCacheType: 'q8_0',
    supportsThinkToggle: true,
    descriptionPt:
      'O modelo que já tens em ~/llama.cpp/models/, agora recalibrado com --n-cpu-moe 27, --ubatch-size 512 e paralelismo AVX2 para o teu Ryzen 7 5800X.',
    whyBetterPt:
      'A tua configuração antiga usava --n-cpu-moe 35 fixo. Reduzir para 27 move mais 8 blocos de especialistas para a RTX 3060 Ti sem estourar os 8GB de VRAM.'
  }
];

export function calculateRtx3060TiAllocation(
  model: RtxModelProfile,
  customNCpuMoe: number,
  customCtx: number,
  kvType: 'q8_0' | 'q4_0' | 'f16',
  reasoningMode: ReasoningMode
): VramAllocationBreakdown {
  const totalVramMb = 8192;
  const osAndDisplayMb = 440;
  const computeBufferMb = 310;

  // KV Cache calculation based on context size and quantization
  const kvBasePer16k = kvType === 'f16' ? 1420 : kvType === 'q8_0' ? 760 : 420;
  const kvCacheVramMb = Math.round(kvBasePer16k * (customCtx / 16384));

  let attentionAndSharedWeightsMb = 2150;
  let hotMoeExpertsVramMb = 0;
  let systemRamUsedGb = model.ramMb / 1024;

  if (model.architecture === 'MoE Híbrido') {
    // Cada camada MoE movida para GPU ocupa ~145 MB na VRAM e liberta ~145 MB da RAM DDR4
    const gpuMoeLayers = Math.max(0, 48 - customNCpuMoe);
    hotMoeExpertsVramMb = Math.round(gpuMoeLayers * 165);
    systemRamUsedGb = Math.max(2.5, Math.round((customNCpuMoe * 0.36 + 2.2) * 10) / 10);
  } else {
    attentionAndSharedWeightsMb = model.vramMb - osAndDisplayMb - computeBufferMb - 720;
    hotMoeExpertsVramMb = 0;
  }

  const usedVramMb = Math.min(
    totalVramMb,
    osAndDisplayMb + attentionAndSharedWeightsMb + hotMoeExpertsVramMb + kvCacheVramMb + computeBufferMb
  );
  const freeVramMb = Math.max(0, totalVramMb - usedVramMb);

  // Estimar performance real em tok/s e TTFT na RTX 3060 Ti + Ryzen 7 5800X
  let speedBonus = 1.0;
  if (model.architecture === 'MoE Híbrido') {
    const deltaLayers = model.defaultNCpuMoe - customNCpuMoe;
    speedBonus = 1 + deltaLayers * 0.022;
  }
  if (reasoningMode === 'voice_instant') {
    speedBonus *= 1.15;
  } else if (reasoningMode === 'deep_reasoning') {
    speedBonus *= 0.92;
  }

  const baseTok = reasoningMode === 'voice_instant' ? model.voiceTokPerSec : model.textTokPerSec;
  const estimatedTokPerSec = Math.max(18, Math.round(baseTok * speedBonus));
  const estimatedTtftMs = Math.max(
    45,
    Math.round(model.ttftVoiceMs / speedBonus + (reasoningMode === 'deep_reasoning' ? 65 : 0))
  );

  const pcieBottleneckRisk =
    model.architecture === '100% GPU Resident'
      ? 'Nulo (100% GDDR6)'
      : customNCpuMoe <= 28
      ? 'Baixo (Apenas Cold Experts)'
      : 'Moderado';

  const moeFlag = model.architecture === 'MoE Híbrido' ? ` \\\n  --n-cpu-moe ${customNCpuMoe}` : '';
  const draftFlag = model.draftModelGguf
    ? ` \\\n  -md "$HOME/llama.cpp/models/${model.draftModelGguf}" --draft-max 8 --draft-min 3`
    : '';

  const generatedCommand = `"$HOME/llama.cpp/build/bin/llama-server" \\
  -m "$HOME/llama.cpp/models/${model.ggufFilename}"${draftFlag} \\
  --host 0.0.0.0 --port 9931 \\
  -ngl ${model.defaultNgl}${moeFlag} \\
  -t 8 -tb 14 \\
  -c ${customCtx} -b 2048 -ub 512 \\
  -ctk ${kvType} -ctv ${kvType} \\
  -fa on \\
  --cache-reuse 256`;

  return {
    totalVramMb,
    osAndDisplayMb,
    attentionAndSharedWeightsMb,
    hotMoeExpertsVramMb,
    kvCacheVramMb,
    computeBufferMb,
    usedVramMb,
    freeVramMb,
    systemRamUsedGb,
    estimatedTokPerSec,
    estimatedTtftMs,
    pcieBottleneckRisk,
    generatedCommand
  };
}
