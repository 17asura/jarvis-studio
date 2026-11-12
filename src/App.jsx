import React, { useState, useEffect, useRef } from 'react';

const SILENCE_DURATION_MS = 950;
const MIN_SPEECH_MS = 320;

export default function App() {
  const [booted, setBooted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 860);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  // Voz & Hardware
  const [voice, setVoice] = useState(() => localStorage.getItem('jarvis_voice') || 'duarte');
  const [speed, setSpeed] = useState(1.0);
  const [threshold, setThreshold] = useState(12);
  const [autoVadMode, setAutoVadMode] = useState(true);
  const [jarvisState, setJarvisState] = useState('IDLE'); // IDLE | LISTENING | RECORDING | PROCESSING | SPEAKING
  const [statusText, setStatusText] = useState('Pronto');
  const [micVolume, setMicVolume] = useState(0);
  const [metrics, setMetrics] = useState({ stt: '--', llm: '--', tts: '--' });
  const [hwStats, setHwStats] = useState('RTX 3060 Ti');

  // Memória .MD
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [coreMemoryMd, setCoreMemoryMd] = useState('');
  const [wrongWord, setWrongWord] = useState('');
  const [rightWord, setRightWord] = useState('');

  // Artefactos Estilo Claude
  const [artifacts, setArtifacts] = useState([]);
  const [activeArtifactId, setActiveArtifactId] = useState(null);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artTab, setArtTab] = useState('code'); // code | preview | run
  const [artConsole, setArtConsole] = useState('');
  const [isStreamingArt, setIsStreamingArt] = useState(false);

  // Refs para loop de áudio e streaming sem stale closures
  const stateRef = useRef('IDLE');
  const autoVadRef = useRef(true);
  const thresholdRef = useRef(12);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const preRollRingRef = useRef([]);
  const recordedPCMRef = useRef([]);
  const speechStartRef = useRef(0);
  const lastVoiceRef = useRef(0);

  const audioPlayerRef = useRef(new Audio());
  const ttsQueueRef = useRef([]);
  const isPlayingQueueRef = useRef(false);
  const llmFinishedRef = useRef(false);
  const abortCtrlRef = useRef(null);
  const chatScrollRef = useRef(null);
  const codeScrollRef = useRef(null);

  const setGlobalState = (st) => {
    stateRef.current = st;
    setJarvisState(st);
  };

  useEffect(() => {
    voiceRef.current = voice;
    localStorage.setItem('jarvis_voice', voice);
  }, [voice]);

  useEffect(() => {
    speedRef.current = speed;
    audioPlayerRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    autoVadRef.current = autoVadMode;
  }, [autoVadMode]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Atalho Tecla Espaço para calar voz
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        handleOrbClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ============================================================================
  // 1. CARREGAR MEMÓRIA .MD, SESSÕES SQLITE E HARDWARE
  // ============================================================================
  const loadMemory = async () => {
    try {
      const r = await fetch('/memory');
      if (r.ok) {
        const d = await r.json();
        setCoreMemoryMd(d.markdown || '');
      }
    } catch {
      setCoreMemoryMd(localStorage.getItem('jarvis_fallback_md') || '# Memória Central do J.A.R.V.I.S.\n- Nome: Dinis\n');
    }
  };

  const loadSessions = async (selectFirst = false) => {
    try {
      const r = await fetch('/chats');
      if (!r.ok) throw new Error('Offline');
      const d = await r.json();
      if (!d.sessions || d.sessions.length === 0) {
        await createNewSession();
        return;
      }
      setSessions(d.sessions);
      if (selectFirst || !currentSessionId) {
        const firstId = d.sessions[0].id;
        setCurrentSessionId(firstId);
        await loadSessionMessages(firstId);
      }
    } catch {
      const localChats = JSON.parse(localStorage.getItem('jarvis_local_sessions') || '[]');
      if (localChats.length === 0) {
        const sid = 'local_' + Date.now();
        const initial = [{ id: sid, title: 'Conversa Studio' }];
        localStorage.setItem('jarvis_local_sessions', JSON.stringify(initial));
        setSessions(initial);
        setCurrentSessionId(sid);
      } else {
        setSessions(localChats);
        setCurrentSessionId(localChats[0].id);
      }
    }
  };

  const loadSessionMessages = async (sid) => {
    try {
      const r = await fetch(`/chats/${sid}`);
      if (r.ok) {
        const d = await r.json();
        const loaded = (d.messages || []).map((m, idx) => ({
          id: `${sid}_${idx}`,
          role: m.role,
          content: m.content
        }));
        setMessages(loaded);
        extractArtifactsFromHistory(loaded);
      }
    } catch {}
  };

  const extractArtifactsFromHistory = (msgs) => {
    const found = [];
    msgs.forEach((m) => {
      if (m.role !== 'assistant') return;
      const regex = /```([a-zA-Z0-9_:-]*)\n([\s\S]*?)(?:```|$)/g;
      let match;
      let idx = 0;
      while ((match = regex.exec(m.content)) !== null) {
        const rawTag = (match[1] || 'code').trim();
        if (rawTag.startsWith('pdf') || rawTag === 'image' || rawTag === 'img') continue;
        const lang = rawTag.split(':')[0] || 'code';
        const title = rawTag.includes(':') ? rawTag.split(':')[1].replace(/_/g, ' ') : `Artefacto ${lang.toUpperCase()}`;
        found.push({
          id: `art_${m.id}_${idx++}`,
          title,
          lang,
          code: match[2],
          isClosed: match[0].endsWith('```')
        });
      }
    });
    setArtifacts(found);
  };

  const createNewSession = async () => {
    stopAllAudio();
    try {
      const r = await fetch('/chats/new', { method: 'POST' });
      const d = await r.json();
      setCurrentSessionId(d.id);
      setMessages([]);
      await loadSessions(false);
    } catch {
      const sid = 'local_' + Date.now();
      setSessions((prev) => [{ id: sid, title: 'Nova Conversa' }, ...prev]);
      setCurrentSessionId(sid);
      setMessages([]);
    }
    if (window.innerWidth <= 860) setSidebarOpen(false);
  };

  const deleteSession = async (e, sid) => {
    e.stopPropagation();
    try {
      await fetch(`/chats/${sid}`, { method: 'DELETE' });
      await loadSessions(currentSessionId === sid);
    } catch {
      setSessions((prev) => prev.filter((s) => s.id !== sid));
    }
  };

  const persistMsg = async (sid, role, content) => {
    if (!sid) return;
    try {
      await fetch(`/chats/${sid}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content })
      });
      loadSessions(false);
    } catch {}
  };

  // ============================================================================
  // 2. SISTEMA DE VOZ NATURAL E GRAVADOR 48kHz
  // ============================================================================
  const enqueueSentenceForTTS = (sentenceText) => {
    const clean = sentenceText
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*#_`~]/g, '')
      .trim();
    if (clean.length < 2) return;

    const t0 = performance.now();
    const audioPromise = fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, voice: voiceRef.current })
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const b = await r.blob();
        setMetrics((m) => ({ ...m, tts: Math.round(performance.now() - t0) }));
        return b;
      })
      .catch(() => null);

    ttsQueueRef.current.push(audioPromise);
    if (!isPlayingQueueRef.current) processAudioQueue();
  };

  const processAudioQueue = async () => {
    if (isPlayingQueueRef.current) return;
    isPlayingQueueRef.current = true;
    setGlobalState('SPEAKING');
    setStatusText('Jarvis a falar... (Toca no 🔊 ou Espaço para calar)');

    while (ttsQueueRef.current.length > 0) {
      const nextPromise = ttsQueueRef.current.shift();
      const blob = await nextPromise;
      if (!blob || blob.size < 100 || stateRef.current !== 'SPEAKING') continue;

      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const player = audioPlayerRef.current;
        player.src = url;
        player.playbackRate = speedRef.current;
        player.onended = () => { URL.revokeObjectURL(url); resolve(); };
        player.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        player.play().catch(() => resolve());
      });
    }

    isPlayingQueueRef.current = false;
    if (llmFinishedRef.current && ttsQueueRef.current.length === 0 && stateRef.current === 'SPEAKING') {
      startListeningState();
    }
  };

  const stopAllAudio = () => {
    if (abortCtrlRef.current) {
      try { abortCtrlRef.current.abort(); } catch {}
    }
    ttsQueueRef.current = [];
    audioPlayerRef.current.pause();
    audioPlayerRef.current.src = '';
    isPlayingQueueRef.current = false;
  };

  const startListeningState = () => {
    preRollRingRef.current = [];
    recordedPCMRef.current = [];
    if (!autoVadRef.current) {
      setGlobalState('IDLE');
      setStatusText('Modo Toque: Toca no botão 👆 para gravar');
      return;
    }
    setGlobalState('LISTENING');
    setStatusText('Estou a ouvir-te...');
  };

  const encodeWAVNative = (float32Chunks) => {
    const sr = audioCtxRef.current ? audioCtxRef.current.sampleRate : 48000;
    let totalLen = 0;
    for (const c of float32Chunks) totalLen += c.length;
    const buffer = new ArrayBuffer(44 + totalLen * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + totalLen * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, totalLen * 2, true);

    let offset = 44;
    for (const chunk of float32Chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const bootJarvis = async () => {
    setBooted(true);
    await loadMemory();
    await loadSessions(true);

    // Poll de estatísticas da RTX 3060 Ti
    fetch('/system_stats').then((r) => r.json()).then((d) => {
      if (d.gpu) setHwStats(`${d.gpu} | ${d.ram}`);
    }).catch(() => {});

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
      source.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);

      scriptNode.onaudioprocess = (e) => {
        const raw = new Float32Array(e.inputBuffer.getChannelData(0));
        if (stateRef.current === 'LISTENING') {
          preRollRingRef.current.push(raw);
          if (preRollRingRef.current.length > 10) preRollRingRef.current.shift();
        } else if (stateRef.current === 'RECORDING') {
          recordedPCMRef.current.push(raw);
        }
      };

      const monitorLoop = () => {
        requestAnimationFrame(monitorLoop);
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);

        let sum = 0;
        const bins = Math.min(data.length, 90);
        for (let i = 2; i < bins; i++) sum += data[i];
        const avgVol = Math.min(100, Math.round((sum / bins) * 0.9));
        setMicVolume(stateRef.current === 'SPEAKING' ? 0 : avgVol);

        if (!autoVadRef.current || ['PROCESSING', 'SPEAKING'].includes(stateRef.current)) return;

        const now = performance.now();
        if (stateRef.current === 'LISTENING') {
          if (avgVol >= thresholdRef.current) {
            recordedPCMRef.current = [...preRollRingRef.current];
            preRollRingRef.current = [];
            setGlobalState('RECORDING');
            setStatusText('A ouvir a tua frase...');
            speechStartRef.current = now;
            lastVoiceRef.current = now;
          }
        } else if (stateRef.current === 'RECORDING') {
          if (avgVol >= thresholdRef.current) {
            lastVoiceRef.current = now;
          } else if (now - lastVoiceRef.current > SILENCE_DURATION_MS) {
            const totalDur = lastVoiceRef.current - speechStartRef.current;
            finishRecordingAndTranscribe(totalDur >= MIN_SPEECH_MS);
          }
        }
      };
      requestAnimationFrame(monitorLoop);

      const agora = new Date();
      const hora = agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 20 ? 'Boa tarde' : 'Boa noite';
      const greeting = `${saudacao} Dinis. São ${hora} e o estúdio React está operacional. Como te posso ajudar?`;

      llmFinishedRef.current = true;
      enqueueSentenceForTTS(greeting);
    } catch (err) {
      setStatusText('Microfone indisponível: ' + err.message);
    }
  };

  const finishRecordingAndTranscribe = async (validSpeech) => {
    setGlobalState('PROCESSING');
    if (!validSpeech || recordedPCMRef.current.length < 3) {
      startListeningState();
      return;
    }

    setStatusText('A transcrever...');
    const wavBlob = encodeWAVNative(recordedPCMRef.current);
    recordedPCMRef.current = [];

    const formData = new FormData();
    formData.append('audio', wavBlob, 'voice.wav');

    try {
      const res = await fetch('/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      setMetrics((m) => ({ ...m, stt: data.ms || '--' }));
      const text = (data.text || '').trim();
      if (text.length > 1) {
        await askJarvisLLM(text);
      } else {
        startListeningState();
      }
    } catch (err) {
      setStatusText('Erro STT: ' + err.message);
      setTimeout(startListeningState, 1000);
    }
  };

  const handleOrbClick = () => {
    if (stateRef.current === 'SPEAKING' || isPlayingQueueRef.current) {
      stopAllAudio();
      startListeningState();
      return;
    }
    if (!autoVadRef.current) {
      if (stateRef.current !== 'RECORDING') {
        recordedPCMRef.current = [];
        setGlobalState('RECORDING');
        setStatusText('A gravar... Toca novamente no 🔴 para enviar');
      } else {
        finishRecordingAndTranscribe(true);
      }
    } else if (stateRef.current === 'RECORDING') {
      finishRecordingAndTranscribe(true);
    }
  };

  // ============================================================================
  // 3. COMUNICAÇÃO COM O LLM + ARTEFACTOS ESTILO CLAUDE + CONTINUAR CÓDIGO
  // ============================================================================
  const detectIntent = (text) => {
    const t = text.toLowerCase();
    return {
      wantsPdf: /\b(pdf|documento pdf|gera um pdf|cria um pdf|exporta para pdf)\b/.test(t),
      wantsImage: /\b(gera uma imagem|cria uma imagem|desenha uma imagem|gera uma foto|cria uma foto)\b/.test(t)
    };
  };

  const buildSystemPrompt = (userText = '') => {
    const intent = detectIntent(userText);
    let prompt = `O teu nome é Jarvis. És o assistente pessoal de engenharia de sistemas e IA do Dinis a correr localmente numa RTX 3060 Ti.

REGRAS DE OURO:
1. Fala SEMPRE em Português de Portugal (PT-PT) de forma natural, fluida e direta.
2. Quando estiveres apenas a conversar ou a responder a dúvidas simples, responde apenas com texto conversacional limpo (1 a 3 frases), SEM criar blocos de código, SEM criar PDFs e SEM criar imagens.
3. ARTEFACTOS DE CÓDIGO (ESTILO CLAUDE): Quando o Dinis pedir código ou uma página HTML/3D, diz primeiro 1 frase curta introdutória e coloca o código COMPLETO dentro de \`\`\`linguagem ... \`\`\`.
   - REGRA CRÍTICA PARA HTML/WEB: Escreve SEMPRE o ficheiro completo até ao \`</html>\` final! Mantém o CSS compacto para garantir espaço para todo o \`<body>\` e \`<script>\`.
4. PROIBIDO CRIAR PDFs OU IMAGENS NÃO SOLICITADOS: NUNCA uses blocos \`\`\`pdf nem \`\`\`image a menos que o Dinis tenha pedido explicitamente na mensagem atual!`;

    if (intent.wantsPdf) prompt += `\n5. O DINIS PEDIU UM PDF AGORA: Usa \`\`\`pdf:Titulo_Do_PDF ... \`\`\`.`;
    if (intent.wantsImage) prompt += `\n5. O DINIS PEDIU UMA IMAGEM AGORA: Usa \`\`\`image ... \`\`\`.`;

    prompt += `\n\nMEMÓRIA PERSISTENTE DO DINIS (core_memory.md):\n${coreMemoryMd}`;
    return prompt;
  };

  const askJarvisLLM = async (userText) => {
    const userMsgId = 'msg_' + Date.now();
    const aiMsgId = 'msg_' + (Date.now() + 1);
    const updatedHistory = [...messages, { id: userMsgId, role: 'user', content: userText }];

    setMessages([...updatedHistory, { id: aiMsgId, role: 'assistant', content: '' }]);
    persistMsg(currentSessionId, 'user', userText);

    setStatusText('Jarvis a responder...');
    llmFinishedRef.current = false;
    abortCtrlRef.current = new AbortController();
    const t0Llm = performance.now();
    let gotFirstToken = false;

    const fullMessages = [
      { role: 'system', content: buildSystemPrompt(userText) },
      ...updatedHistory.slice(-12).map((m) => ({ role: m.role, content: m.content }))
    ];

    try {
      const res = await fetch('/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrlRef.current.signal,
        body: JSON.stringify({ model: 'qwen3-coder', messages: fullMessages, stream: true, temperature: 0.4, max_tokens: 8192 })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullReply = '';
      let sentenceBuffer = '';
      let isFirstChunk = true;
      let insideCodeFence = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const token = data.choices[0]?.delta?.content || '';
              if (!gotFirstToken && token.trim()) {
                gotFirstToken = true;
                setMetrics((m) => ({ ...m, llm: Math.round(performance.now() - t0Llm) }));
              }
              fullReply += token;

              const fenceCount = (fullReply.match(/```/g) || []).length;
              const nowInsideFence = fenceCount % 2 === 1;

              if (nowInsideFence && !insideCodeFence) {
                const cleanIntro = sentenceBuffer.replace(/`/g, '').trim();
                if (cleanIntro.length > 2) enqueueSentenceForTTS(cleanIntro);
                sentenceBuffer = '';
              }
              insideCodeFence = nowInsideFence;

              if (!insideCodeFence) {
                sentenceBuffer += token.replace(/`/g, '');
                const trimmedLen = sentenceBuffer.trim().length;
                const shouldFlushFirst = isFirstChunk && trimmedLen >= 22 && /[,.;:!?\n]/.test(token);
                const shouldFlushNext = !isFirstChunk && trimmedLen >= 45 && /[.;:!?\n]/.test(token);
                if (shouldFlushFirst || shouldFlushNext) {
                  enqueueSentenceForTTS(sentenceBuffer);
                  sentenceBuffer = '';
                  isFirstChunk = false;
                }
              }

              setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullReply } : m)));
              updateLiveArtifactFromStream(aiMsgId, fullReply, false);
            } catch {}
          }
        }
      }

      llmFinishedRef.current = true;
      updateLiveArtifactFromStream(aiMsgId, fullReply, true);

      if (!insideCodeFence && sentenceBuffer.trim().length > 2) {
        enqueueSentenceForTTS(sentenceBuffer);
      } else if (!isPlayingQueueRef.current && ttsQueueRef.current.length === 0) {
        startListeningState();
      }

      persistMsg(currentSessionId, 'assistant', fullReply);

      fetch('/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_text: userText, ai_text: fullReply })
      })
        .then((r) => r.json())
        .then((memRes) => {
          if (memRes.updated && memRes.markdown) setCoreMemoryMd(memRes.markdown);
        })
        .catch(() => {});
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatusText('Erro ao comunicar com o servidor local.');
        startListeningState();
      }
    }
  };

  const updateLiveArtifactFromStream = (msgId, rawText, isFinal) => {
    const cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const regex = /```([a-zA-Z0-9_:-]*)\n([\s\S]*?)(?:```|$)/g;
    let match;
    let idx = 0;

    while ((match = regex.exec(cleanText)) !== null) {
      const rawTag = (match[1] || 'code').trim();
      if (rawTag.toLowerCase().startsWith('pdf') || ['image', 'img'].includes(rawTag.toLowerCase())) continue;

      const lang = rawTag.split(':')[0] || 'code';
      const title = rawTag.includes(':') ? rawTag.split(':')[1].replace(/_/g, ' ') : `Artefacto ${lang.toUpperCase()}`;
      const artId = `art_${msgId}_${idx++}`;
      const isClosed = match[0].endsWith('```');
      const code = match[2];

      setArtifacts((prev) => {
        const exists = prev.find((a) => a.id === artId);
        if (!exists) return [...prev, { id: artId, title, lang, code, isClosed }];
        return prev.map((a) => (a.id === artId ? { ...a, code, isClosed } : a));
      });

      setActiveArtifactId(artId);
      setArtifactPanelOpen(true);
      setIsStreamingArt(!isFinal);

      if (!isFinal) {
        setArtTab('code');
        if (codeScrollRef.current) codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
      } else if (['html', 'svg'].includes(lang.toLowerCase())) {
        setArtTab('preview');
      }
    }
  };

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId) || null;

  const continueCutArtifact = async () => {
    if (!activeArtifact) return;
    setIsStreamingArt(true);
    setArtTab('code');
    setStatusText('A continuar código exatamente de onde parou...');

    const tailLines = activeArtifact.code.split('\n').slice(-15).join('\n');
    const continuePrompt = `O teu bloco de código anterior ficou cortado a meio nestas linhas finais:\n\n\`\`\`${activeArtifact.lang}\n${tailLines}\n\`\`\`\n\nContinua IMEDIATAMENTE o código exatamente a partir do caracter seguinte até fechar todo o ficheiro (\`</body></html>\`), dentro de um bloco \`\`\`${activeArtifact.lang} ... \`\`\`. Não repitas o início!`;

    const baseCode = activeArtifact.code;
    try {
      const res = await fetch('/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3-coder',
          messages: [{ role: 'system', content: buildSystemPrompt('') }, { role: 'user', content: continuePrompt }],
          stream: true,
          temperature: 0.3,
          max_tokens: 8192
        })
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let rawCont = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              rawCont += data.choices[0]?.delta?.content || '';
              const m = rawCont.match(/```[a-zA-Z0-9_:-]*\n([\s\S]*?)(?:```|$)/);
              if (m) {
                const merged = baseCode + '\n' + m[1];
                setArtifacts((prev) =>
                  prev.map((a) => (a.id === activeArtifact.id ? { ...a, code: merged, isClosed: rawCont.includes('```', 10) } : a))
                );
              }
            } catch {}
          }
        }
      }
      setIsStreamingArt(false);
      if (['html', 'svg'].includes(activeArtifact.lang.toLowerCase())) setArtTab('preview');
      setStatusText('Código completado!');
    } catch (e) {
      setIsStreamingArt(false);
      setStatusText('Erro ao continuar: ' + e.message);
    }
  };

  const runCurrentArtifact = async () => {
    if (!activeArtifact) return;
    const lang = activeArtifact.lang.toLowerCase();
    if (['html', 'svg'].includes(lang)) {
      setArtTab('preview');
      return;
    }
    setArtTab('run');
    setArtConsole(`[*] A executar ${activeArtifact.lang} no servidor...\n`);
    try {
      const r = await fetch('/run_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: activeArtifact.lang, code: activeArtifact.code })
      });
      const d = await r.json();
      setArtConsole(`=== Output (${d.ms}ms) ===\n${d.output}`);
    } catch (e) {
      setArtConsole('Erro na execução: ' + e.message);
    }
  };

  const buildSafePreviewHtml = (art) => {
    if (!art) return '';
    let code = art.code || '';
    const hasStyleOpen = /<style[^>]*>/i.test(code);
    const hasStyleClose = /<\/style>/i.test(code);
    if (hasStyleOpen && !hasStyleClose) {
      return (
        code +
        "</style></head><body style='background:#090d16;color:#f59e0b;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;'><div><h2>⚠️ Código cortado dentro do &lt;style&gt;</h2><p style='color:#94a3b8;margin-top:10px;'>Clica no botão laranja <b>⏩ Continuar Código</b> no topo do painel para terminar o ficheiro!</p></div></body></html>"
      );
    }
    return code;
  };

  const renderMessageContent = (msg) => {
    if (msg.role === 'user') return msg.content;
    const cleanText = (msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const parts = [];
    const regex = /```([a-zA-Z0-9_:-]*)\n([\s\S]*?)(?:```|$)/g;
    let lastIndex = 0;
    let match;
    let idx = 0;

    while ((match = regex.exec(cleanText)) !== null) {
      const before = cleanText.slice(lastIndex, match.index);
      if (before.trim()) parts.push(<div key={`p_${idx}`} className="prose-text">{before.trim()}</div>);

      const rawTag = (match[1] || 'code').trim();
      const codeContent = match[2];
      const artId = `art_${msg.id}_${idx++}`;
      const lang = rawTag.split(':')[0] || 'code';
      const title = rawTag.includes(':') ? rawTag.split(':')[1].replace(/_/g, ' ') : `Artefacto ${lang.toUpperCase()}`;
      const linesCount = codeContent.split('\n').length;

      parts.push(
        <div
          key={artId}
          className="claude-artifact-pill"
          onClick={() => {
            setActiveArtifactId(artId);
            setArtifactPanelOpen(true);
          }}
        >
          <div className="pill-info">
            <span className="pill-title">🧩 {title}</span>
            <span className="pill-sub">{lang.toUpperCase()} • {linesCount} linhas • Abrir no painel lateral</span>
          </div>
          <button className="pill-btn">Abrir Artefacto ➔</button>
        </div>
      );

      lastIndex = regex.lastIndex;
    }

    const rem = cleanText.slice(lastIndex);
    if (rem.trim()) parts.push(<div key="rem" className="prose-text">{rem.trim()}</div>);
    return parts.length > 0 ? parts : <div className="prose-text">{cleanText}</div>;
  };

  const handleSendManual = () => {
    const t = inputText.trim();
    if (!t) return;
    setInputText('');
    stopAllAudio();
    setGlobalState('PROCESSING');
    askJarvisLLM(t);
  };

  const isArtIncomplete =
    activeArtifact &&
    !isStreamingArt &&
    (!activeArtifact.isClosed || (activeArtifact.lang.toLowerCase() === 'html' && !/<\/html>/i.test(activeArtifact.code)));

  return (
    <>
      {!booted && (
        <div className="boot-overlay">
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '3px' }}>
            J.A.R.V.I.S. STUDIO (REACT)
          </div>
          <p style={{ color: 'var(--muted)', maxWidth: 480, lineHeight: 1.5 }}>
            Arquitetura React + Vite compatível com <strong>Google AI Studio</strong> e com o teu servidor local <strong>RTX 3060 Ti</strong>.
          </p>
          <button className="boot-btn" onClick={bootJarvis}>⚡ INICIAR J.A.R.V.I.S.</button>
        </div>
      )}

      <header>
        <div className="header-left">
          <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰ Chats</button>
          <strong style={{ color: 'var(--accent)', fontSize: '0.95rem' }}>J.A.R.V.I.S.</strong>
          <span className="hw-badge">STT: {metrics.stt}ms | LLM: {metrics.llm}ms | TTS: {metrics.tts}ms</span>
          <span className="hw-badge">{hwStats}</span>
        </div>
        <div className="header-right">
          <select className="ctrl-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="duarte">🗣️ Voz: Duarte (Natural PT-PT)</option>
            <option value="raquel">🗣️ Voz: Raquel (Friday PT-PT)</option>
            <option value="piper">⚡ Voz: Piper (Offline)</option>
          </select>
          <button className={`icon-btn ${autoVadMode ? 'active' : ''}`} onClick={() => setAutoVadMode(!autoVadMode)}>
            {autoVadMode ? '🎙️ Auto' : '👆 PTT'}
          </button>
          <button className="icon-btn" onClick={() => setMemoryModalOpen(true)}>🧠 .MD</button>
          {activeArtifact && (
            <button className="icon-btn" onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}>🧩 Artefacto</button>
          )}
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && (
          <aside className="chat-sidebar">
            <button className="new-chat-btn" onClick={createNewSession}>+ Nova Conversa</button>
            <div className="session-list">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`session-item ${s.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentSessionId(s.id);
                    loadSessionMessages(s.id);
                    if (window.innerWidth <= 860) setSidebarOpen(false);
                  }}
                >
                  <span className="session-title">💬 {s.title}</span>
                  <button className="del-chat-btn" onClick={(e) => deleteSession(e, s.id)}>🗑️</button>
                </div>
              ))}
            </div>
          </aside>
        )}

        <main className="chat-column">
          <div className="chat-scroll" ref={chatScrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                {renderMessageContent(m)}
              </div>
            ))}
          </div>
        </main>

        {artifactPanelOpen && activeArtifact && (
          <section className="artifact-panel">
            <div className="art-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--accent)', fontSize: '0.88rem' }}>
                  🧩 {activeArtifact.title} ({activeArtifact.lang.toUpperCase()})
                </strong>
                <div className="art-tabs">
                  <button className={`art-tab ${artTab === 'code' ? 'active' : ''}`} onClick={() => setArtTab('code')}>💻 Código</button>
                  <button className={`art-tab ${artTab === 'preview' ? 'active' : ''}`} onClick={() => setArtTab('preview')}>👁️ Preview</button>
                  <button className={`art-tab ${artTab === 'run' ? 'active' : ''}`} onClick={runCurrentArtifact}>▶️ Executar</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isArtIncomplete && (
                  <button className="icon-btn" style={{ background: '#f59e0b', color: '#000', border: 'none' }} onClick={continueCutArtifact}>
                    ⏩ Continuar Código
                  </button>
                )}
                <button className="icon-btn" onClick={() => navigator.clipboard.writeText(activeArtifact.code)}>📋 Copiar</button>
                <button className="icon-btn" style={{ color: 'var(--rec)' }} onClick={() => setArtifactPanelOpen(false)}>✕</button>
              </div>
            </div>
            <div className="art-body">
              {artTab === 'code' && (
                <pre className="art-code-view" ref={codeScrollRef}>
                  <code>{activeArtifact.code}</code>
                </pre>
              )}
              {artTab === 'preview' && (
                <iframe
                  className="art-preview-frame"
                  sandbox="allow-scripts allow-modals allow-same-origin"
                  srcDoc={buildSafePreviewHtml(activeArtifact)}
                  title="Artifact Preview"
                />
              )}
              {artTab === 'run' && <div className="art-console-view">{artConsole}</div>}
            </div>
          </section>
        )}
      </div>

      {memoryModalOpen && (
        <div className="memory-modal">
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: 'var(--accent)' }}>🧠 Memória Persistente (core_memory.md)</strong>
              <button className="icon-btn" onClick={() => setMemoryModalOpen(false)}>✕ Fechar</button>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.82rem', background: 'var(--card)', padding: 10, borderRadius: 8 }}>
              <label>
                Sensibilidade Microfone:
                <input type="range" min="4" max="40" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
              </label>
              <label>
                Velocidade Voz:
                <select className="ctrl-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ marginLeft: 6 }}>
                  <option value={1.0}>1.0x (Natural)</option>
                  <option value={1.08}>1.08x</option>
                  <option value={1.15}>1.15x</option>
                </select>
              </label>
            </div>
            <textarea className="memory-editor" value={coreMemoryMd} onChange={(e) => setCoreMemoryMd(e.target.value)} spellCheck={false} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input
                  type="text"
                  placeholder="Ouvido errado (ex: jarbas)"
                  value={wrongWord}
                  onChange={(e) => setWrongWord(e.target.value)}
                  style={{ flex: 1, padding: 7, borderRadius: 6, background: '#050811', color: '#fff', border: '1px solid var(--border)' }}
                />
                <input
                  type="text"
                  placeholder="Correto (ex: Jarvis)"
                  value={rightWord}
                  onChange={(e) => setRightWord(e.target.value)}
                  style={{ flex: 1, padding: 7, borderRadius: 6, background: '#050811', color: '#fff', border: '1px solid var(--border)' }}
                />
                <button
                  className="icon-btn"
                  onClick={async () => {
                    if (!wrongWord || !rightWord) return;
                    await fetch('/memory/learn_word', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ wrong: wrongWord, right: rightWord })
                    });
                    setWrongWord('');
                    setRightWord('');
                  }}
                >
                  + Ensinar
                </button>
              </div>
              <button
                className="icon-btn"
                style={{ background: '#10b981', color: '#000', border: 'none' }}
                onClick={async () => {
                  await fetch('/memory/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ markdown: coreMemoryMd })
                  }).catch(() => localStorage.setItem('jarvis_fallback_md', coreMemoryMd));
                  setMemoryModalOpen(false);
                }}
              >
                💾 Guardar .MD
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <div className="hud-row">
          <div className={`orb ${jarvisState.toLowerCase()}`} onClick={handleOrbClick}>
            {jarvisState === 'SPEAKING' ? '🔊' : jarvisState === 'RECORDING' ? '🔴' : jarvisState === 'PROCESSING' ? '⏳' : autoVadMode ? '🎙️' : '👆'}
          </div>
          <div className="meter-wrap">
            <div className="status-label">{statusText}</div>
            <div className="vol-bar-bg">
              <div className="vol-bar" style={{ width: `${micVolume}%` }} />
              <div className="thresh-line" style={{ left: `${threshold}%` }} />
            </div>
          </div>
          <div className="input-group">
            <input
              type="text"
              className="text-input"
              placeholder="Escreve ou fala com o Jarvis..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendManual()}
            />
            <button className="send-btn" onClick={handleSendManual}>➤</button>
          </div>
        </div>
      </footer>
    </>
  );
}
