import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Send,
  Mic,
  Volume2,
  Code2,
  FileText,
  ExternalLink,
  Brain,
  CloudSun,
  Wifi,
  Server,
  PanelLeft,
  Square
} from 'lucide-react';
import {
  DEFAULT_MEMORY_MD,
  extractInstantMemories,
  applyPhoneticCorrections,
  prepareTextForNaturalSpeech,
  parseMessageSegments,
  parseMemorySections,
  buildSystemPromptWithLiveContext
} from './utils/jarvisLogic';
import { FluidVoiceOrb } from './components/FluidVoiceOrb';
import { ChatGptVoiceView } from './components/ChatGptVoiceView';
import { CommandCenterView } from './components/CommandCenterView';
import { InstantMemoryView } from './components/InstantMemoryView';
import { ArtifactDrawer } from './components/ArtifactDrawer';

const SILENCE_DURATION_MS = 950;
const MIN_SPEECH_MS = 320;

export default function App() {
  const [activeNav, setActiveNav] = useState('chat'); // 'chat' | 'voice' | 'command' | 'memory'
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 960);
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
  const [statusText, setStatusText] = useState('Pronto · Toca no microfone ou escreve abaixo');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micInitialized, setMicInitialized] = useState(false);

  // Telemetria Viva (Meteorologia/GPS, Router/Tráfego, Homelab & GPU)
  const [telemetry, setTelemetry] = useState(null);

  // Memória Instantânea (.MD + Secções + Dicionário Fonético)
  const [coreMemoryMd, setCoreMemoryMd] = useState(DEFAULT_MEMORY_MD);
  const [memorySections, setMemorySections] = useState(() => parseMemorySections(DEFAULT_MEMORY_MD));
  const [corrections, setCorrections] = useState({});
  const [recentExtractions, setRecentExtractions] = useState([]);

  // Artefactos Estilo Claude + Media Gerada (PDF / Imagens)
  const [artifacts, setArtifacts] = useState([]);
  const [activeArtifactId, setActiveArtifactId] = useState(null);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artTab, setArtTab] = useState('code'); // code | preview | run
  const [artConsole, setArtConsole] = useState('');
  const [isStreamingArt, setIsStreamingArt] = useState(false);
  const [generatedMediaMap, setGeneratedMediaMap] = useState({});

  // Refs sincronizadas para eliminar stale closures no loop de voz e atalhos
  const stateRef = useRef('IDLE');
  const messagesRef = useRef([]);
  const currentSessionIdRef = useRef(null);
  const coreMemoryMdRef = useRef(DEFAULT_MEMORY_MD);
  const telemetryRef = useRef(null);
  const correctionsRef = useRef({});
  const autoVadRef = useRef(true);
  const thresholdRef = useRef(12);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const askJarvisFnRef = useRef(null);
  const handleOrbClickRef = useRef(null);

  // Refs de Áudio & DOM (Zero re-renders a 60Hz)
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const volBarDomRef = useRef(null);
  const preRollRingRef = useRef([]);
  const recordedPCMRef = useRef([]);
  const speechStartRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const webSpeechRecRef = useRef(null);
  const liveTranscriptRef = useRef('');

  const audioPlayerRef = useRef(new Audio());
  const ttsQueueRef = useRef([]);
  const isPlayingQueueRef = useRef(false);
  const llmFinishedRef = useRef(false);
  const abortCtrlRef = useRef(null);
  const chatScrollRef = useRef(null);
  const codeScrollRef = useRef(null);

  const setGlobalState = useCallback((st) => {
    stateRef.current = st;
    setJarvisState(st);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    coreMemoryMdRef.current = coreMemoryMd;
    setMemorySections(parseMemorySections(coreMemoryMd));
  }, [coreMemoryMd]);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    correctionsRef.current = corrections;
  }, [corrections]);

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

  // ============================================================================
  // 1. CARREGAR MEMÓRIA, TELEMETRIA VIVA E SESSÕES DE CONVERSA
  // ============================================================================
  const loadMemory = useCallback(async () => {
    try {
      const r = await fetch('/memory');
      if (r.ok) {
        const d = await r.json();
        if (d.markdown) setCoreMemoryMd(d.markdown);
        if (d.corrections) setCorrections(d.corrections);
        if (d.recentExtractions) setRecentExtractions(d.recentExtractions);
      }
    } catch {
      const saved = localStorage.getItem('jarvis_fallback_md');
      if (saved) setCoreMemoryMd(saved);
    }
  }, []);

  const refreshTelemetry = useCallback(async () => {
    try {
      const r = await fetch('/telemetry/all');
      if (r.ok) {
        const d = await r.json();
        setTelemetry(d);
      }
    } catch {}
  }, []);

  const extractArtifactsFromHistory = useCallback((msgs) => {
    const found = [];
    msgs.forEach((m) => {
      if (m.role !== 'assistant') return;
      const segs = parseMessageSegments(m.id, m.content);
      segs.forEach((s) => {
        if (s.type === 'artifact') {
          found.push({
            id: s.id,
            title: s.title,
            lang: s.lang,
            code: s.content,
            isClosed: s.isClosed
          });
        }
      });
    });
    setArtifacts(found);
  }, []);

  const loadSessionMessages = useCallback(
    async (sid) => {
      try {
        const r = await fetch(`/chats/${sid}`);
        if (r.ok) {
          const d = await r.json();
          const loaded = (d.messages || []).map((m, idx) => ({
            id: `${sid}_${idx}`,
            role: m.role,
            content: m.content,
            memoryUpdated: m.memoryUpdated || [],
            groundingSources: m.groundingSources || []
          }));
          setMessages(loaded);
          extractArtifactsFromHistory(loaded);
          return;
        }
      } catch {}
      const localMap = JSON.parse(localStorage.getItem('jarvis_local_msgs') || '{}');
      const loaded = localMap[sid] || [];
      setMessages(loaded);
      extractArtifactsFromHistory(loaded);
    },
    [extractArtifactsFromHistory]
  );

  const loadSessions = useCallback(
    async (selectFirst = false) => {
      try {
        const r = await fetch('/chats');
        if (!r.ok) throw new Error('Offline');
        const d = await r.json();
        if (!d.sessions || d.sessions.length === 0) {
          const nr = await fetch('/chats/new', { method: 'POST' });
          const nd = await nr.json();
          setSessions([nd]);
          setCurrentSessionId(nd.id);
          setMessages([]);
          return;
        }
        setSessions(d.sessions);
        if (selectFirst || !currentSessionIdRef.current) {
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
          if (selectFirst || !currentSessionIdRef.current) {
            setCurrentSessionId(localChats[0].id);
            await loadSessionMessages(localChats[0].id);
          }
        }
      }
    },
    [loadSessionMessages]
  );

  useEffect(() => {
    loadMemory();
    loadSessions(true);
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 6000);
    return () => clearInterval(interval);
  }, [loadMemory, loadSessions, refreshTelemetry]);

  const persistMsg = async (sid, role, content, memoryUpdated = undefined) => {
    const targetSid = sid || currentSessionIdRef.current;
    if (!targetSid) return;
    try {
      await fetch(`/chats/${targetSid}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, memoryUpdated })
      });
      loadSessions(false);
    } catch {
      const localMap = JSON.parse(localStorage.getItem('jarvis_local_msgs') || '{}');
      const list = localMap[targetSid] || [];
      list.push({ id: `${targetSid}_${list.length}`, role, content, memoryUpdated });
      localMap[targetSid] = list;
      localStorage.setItem('jarvis_local_msgs', JSON.stringify(localMap));
    }
  };

  // ============================================================================
  // 2. MOTOR DE VOZ NATURAL (TTS HÍBRIDO SERVER + WEB SPEECH API FALLBACK)
  // ============================================================================
  const speakWithBrowserFallback = (text) => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(prepareTextForNaturalSpeech(text));
        utter.lang = 'pt-PT';
        utter.rate = speedRef.current * 1.04;
        const voices = window.speechSynthesis.getVoices();
        const ptVoice =
          voices.find((v) => v.lang.toLowerCase().includes('pt-pt')) ||
          voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
        if (ptVoice) utter.voice = ptVoice;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    });
  };

  const startListeningState = useCallback(() => {
    preRollRingRef.current = [];
    recordedPCMRef.current = [];
    if (!micInitialized) {
      setGlobalState('IDLE');
      setStatusText('Pronto · Toca no microfone para ativar voz ou escreve abaixo');
      return;
    }
    if (!autoVadRef.current) {
      setGlobalState('IDLE');
      setStatusText('Modo PTT: Toca no botão de voz para gravar');
      return;
    }
    setGlobalState('LISTENING');
    setStatusText('Escuta ativa · Fala naturalmente com o J.A.R.V.I.S.');
  }, [micInitialized, setGlobalState]);

  const processAudioQueue = useCallback(async () => {
    if (isPlayingQueueRef.current) return;
    isPlayingQueueRef.current = true;
    setGlobalState('SPEAKING');
    setStatusText('J.A.R.V.I.S. a falar... (Espaço ou Toca na esfera para interromper)');

    while (ttsQueueRef.current.length > 0) {
      const nextItem = ttsQueueRef.current.shift();
      if (!nextItem) continue;
      const { text, blobPromise } = nextItem;
      const blob = await blobPromise;
      if (stateRef.current !== 'SPEAKING') break;

      if (blob && blob.size > 100) {
        const url = URL.createObjectURL(blob);
        await new Promise((resolve) => {
          const player = audioPlayerRef.current;
          player.src = url;
          player.playbackRate = speedRef.current;
          player.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          player.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          player.play().catch(() => {
            URL.revokeObjectURL(url);
            resolve();
          });
        });
      } else {
        await speakWithBrowserFallback(text);
      }
    }

    isPlayingQueueRef.current = false;
    if (llmFinishedRef.current && ttsQueueRef.current.length === 0 && stateRef.current === 'SPEAKING') {
      startListeningState();
    }
  }, [setGlobalState, startListeningState]);

  const enqueueSentenceForTTS = useCallback(
    (sentenceText) => {
      const clean = prepareTextForNaturalSpeech(sentenceText);
      if (clean.length < 2) return;

      const blobPromise = fetch('/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, voice: voiceRef.current })
      })
        .then(async (r) => {
          if (!r.ok || r.status === 204) return null;
          return await r.blob();
        })
        .catch(() => null);

      ttsQueueRef.current.push({ text: clean, blobPromise });
      if (!isPlayingQueueRef.current) processAudioQueue();
    },
    [processAudioQueue]
  );

  const stopAllAudio = useCallback(() => {
    if (abortCtrlRef.current) {
      try {
        abortCtrlRef.current.abort();
      } catch {}
    }
    ttsQueueRef.current = [];
    audioPlayerRef.current.pause();
    audioPlayerRef.current.src = '';
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isPlayingQueueRef.current = false;
  }, []);

  // ============================================================================
  // 3. CAPTURA DE MICROFONE 48kHz + TRANSCRIÇÃO HÍBRIDA
  // ============================================================================
  const encodeWAVNative = (float32Chunks) => {
    const sr = audioCtxRef.current ? audioCtxRef.current.sampleRate : 48000;
    let totalLen = 0;
    for (const c of float32Chunks) totalLen += c.length;
    const buffer = new ArrayBuffer(44 + totalLen * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };

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
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const finishRecordingAndTranscribe = useCallback(
    async (validSpeech) => {
      setGlobalState('PROCESSING');
      const capturedTranscript = liveTranscriptRef.current.trim();
      liveTranscriptRef.current = '';

      if (!validSpeech || (recordedPCMRef.current.length < 3 && !capturedTranscript)) {
        startListeningState();
        return;
      }

      setStatusText('A transcrever a tua frase...');
      const wavBlob = encodeWAVNative(recordedPCMRef.current);
      recordedPCMRef.current = [];

      const formData = new FormData();
      formData.append('audio', wavBlob, 'voice.wav');

      try {
        const res = await fetch('/transcribe', { method: 'POST', body: formData });
        const data = await res.json();
        let text = (data.text || '').trim();
        if (!text && capturedTranscript) {
          text = applyPhoneticCorrections(capturedTranscript, correctionsRef.current);
        }
        setLiveTranscript('');
        if (text.length > 1 && askJarvisFnRef.current) {
          await askJarvisFnRef.current(text, true);
        } else {
          startListeningState();
        }
      } catch {
        if (capturedTranscript.length > 1 && askJarvisFnRef.current) {
          const corrected = applyPhoneticCorrections(capturedTranscript, correctionsRef.current);
          setLiveTranscript('');
          await askJarvisFnRef.current(corrected, true);
        } else {
          setStatusText('Microfone pronto.');
          setTimeout(startListeningState, 800);
        }
      }
    },
    [setGlobalState, startListeningState]
  );

  const ensureMicrophoneBooted = useCallback(async () => {
    if (micInitialized && audioCtxRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
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

      // Reconhecimento Web Speech API em paralelo para legendas instantâneas PT-PT
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = 'pt-PT';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (ev) => {
            let txt = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              txt += ev.results[i][0].transcript;
            }
            if (txt.trim()) {
              liveTranscriptRef.current = txt.trim();
              setLiveTranscript(txt.trim());
            }
          };
          rec.start();
          webSpeechRecRef.current = rec;
        } catch {}
      }

      const monitorLoop = () => {
        requestAnimationFrame(monitorLoop);
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);

        let sum = 0;
        const bins = Math.min(data.length, 90);
        for (let i = 2; i < bins; i++) sum += data[i];
        const avgVol = Math.min(100, Math.round((sum / bins) * 0.9));

        // Atualização direta no DOM da barra de volume sem re-renderizar o React a 60Hz!
        if (volBarDomRef.current) {
          volBarDomRef.current.style.width = `${stateRef.current === 'SPEAKING' ? 0 : avgVol}%`;
        }

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
      setMicInitialized(true);
      setGlobalState(autoVadRef.current ? 'LISTENING' : 'IDLE');
      setStatusText('Microfone ativo · Escuta inteligente ligada');
      return true;
    } catch (err) {
      setStatusText('Microfone sem permissão ou indisponível — usa o chat ou os comandos de voz.');
      return false;
    }
  }, [micInitialized, finishRecordingAndTranscribe, setGlobalState]);

  // ============================================================================
  // 4. COMUNICAÇÃO COM O LLM + MEMÓRIA INSTANTÂNEA + ARTEFACTOS + PDF/IMG
  // ============================================================================
  const updateLiveArtifactFromStream = useCallback((msgId, rawText, isFinal) => {
    const segs = parseMessageSegments(msgId, rawText);
    segs.forEach((s) => {
      if (s.type === 'artifact') {
        setArtifacts((prev) => {
          const exists = prev.find((a) => a.id === s.id);
          if (!exists) {
            return [
              ...prev,
              { id: s.id, title: s.title, lang: s.lang, code: s.content, isClosed: s.isClosed }
            ];
          }
          return prev.map((a) =>
            a.id === s.id ? { ...a, code: s.content, isClosed: s.isClosed } : a
          );
        });
        setActiveArtifactId(s.id);
        setArtifactPanelOpen(true);
        setIsStreamingArt(!isFinal);

        if (!isFinal) {
          setArtTab('code');
          if (codeScrollRef.current) {
            codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
          }
        } else if (['html', 'svg'].includes((s.lang || '').toLowerCase())) {
          setArtTab('preview');
        }
      } else if (isFinal && s.type === 'pdf' && s.id) {
        fetch('/generate_pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: s.title, content: s.content })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.url) {
              setGeneratedMediaMap((prev) => ({ ...prev, [s.id]: { type: 'pdf', url: d.url, title: s.title } }));
            }
          })
          .catch(() => {});
      } else if (isFinal && s.type === 'image' && s.id) {
        fetch('/generate_image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: s.content })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.url) {
              setGeneratedMediaMap((prev) => ({
                ...prev,
                [s.id]: { type: 'image', url: d.url, prompt: s.content }
              }));
            }
          })
          .catch(() => {});
      }
    });
  }, []);

  const askJarvisLLM = useCallback(
    async (userText, shouldSpeakReply = false) => {
      const cleanUserText = (userText || '').trim();
      if (!cleanUserText) return;

      stopAllAudio();
      setGlobalState('PROCESSING');

      // 1. Extração Instantânea de Memória L1 -> L2 (< 1ms) antes da chamada ao LLM
      const memResult = extractInstantMemories(cleanUserText, coreMemoryMdRef.current);
      const memoryBadges = memResult.extractedFacts.map(
        (f) => `${f.category}: ${f.fact}`
      );
      if (memResult.updated) {
        setCoreMemoryMd(memResult.newMarkdown);
        setRecentExtractions((prev) => [...memResult.extractedFacts, ...prev].slice(0, 20));
      }

      const userMsgId = 'msg_' + Date.now();
      const aiMsgId = 'msg_' + (Date.now() + 1);
      const currentHistory = messagesRef.current;
      const updatedHistory = [
        ...currentHistory,
        {
          id: userMsgId,
          role: 'user',
          content: cleanUserText,
          memoryUpdated: memoryBadges
        }
      ];

      setMessages([
        ...updatedHistory,
        { id: aiMsgId, role: 'assistant', content: '', groundingSources: [] }
      ]);
      persistMsg(currentSessionIdRef.current, 'user', cleanUserText, memoryBadges);

      setStatusText('J.A.R.V.I.S. a processar resposta...');
      llmFinishedRef.current = false;
      abortCtrlRef.current = new AbortController();

      const systemPrompt = buildSystemPromptWithLiveContext(
        cleanUserText,
        memResult.newMarkdown,
        telemetryRef.current
      );

      const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedHistory.slice(-12).map((m) => ({ role: m.role, content: m.content }))
      ];

      try {
        const res = await fetch('/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortCtrlRef.current.signal,
          body: JSON.stringify({
            model: 'qwen3-coder',
            messages: fullMessages,
            stream: true
          })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullReply = '';
        let sentenceBuffer = '';
        let isFirstChunk = true;
        let insideCodeFence = false;
        let groundingSources = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));
                const token = data.choices?.[0]?.delta?.content || '';
                if (data.groundingSources) {
                  groundingSources = data.groundingSources;
                }
                fullReply += token;

                if (shouldSpeakReply || activeNav === 'voice' || micInitialized) {
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
                    const shouldFlushFirst =
                      isFirstChunk && trimmedLen >= 24 && /[,.;:!?\n]/.test(token);
                    const shouldFlushNext =
                      !isFirstChunk && trimmedLen >= 48 && /[.;:!?\n]/.test(token);
                    if (shouldFlushFirst || shouldFlushNext) {
                      enqueueSentenceForTTS(sentenceBuffer);
                      sentenceBuffer = '';
                      isFirstChunk = false;
                    }
                  }
                }

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, content: fullReply, groundingSources }
                      : m
                  )
                );
                updateLiveArtifactFromStream(aiMsgId, fullReply, false);
              } catch {}
            }
          }
        }

        llmFinishedRef.current = true;
        updateLiveArtifactFromStream(aiMsgId, fullReply, true);

        if (
          (shouldSpeakReply || activeNav === 'voice' || micInitialized) &&
          !insideCodeFence &&
          sentenceBuffer.trim().length > 2
        ) {
          enqueueSentenceForTTS(sentenceBuffer);
        } else if (!isPlayingQueueRef.current && ttsQueueRef.current.length === 0) {
          startListeningState();
        }

        persistMsg(currentSessionIdRef.current, 'assistant', fullReply);

        fetch('/memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_text: cleanUserText, ai_text: fullReply })
        })
          .then((r) => r.json())
          .then((memRes) => {
            if (memRes.updated && memRes.markdown) {
              setCoreMemoryMd(memRes.markdown);
            }
            if (memRes.recentExtractions) {
              setRecentExtractions(memRes.recentExtractions);
            }
          })
          .catch(() => {});
      } catch (err) {
        if (err.name !== 'AbortError') {
          setStatusText('Pronto.');
          startListeningState();
        }
      }
    },
    [
      activeNav,
      micInitialized,
      enqueueSentenceForTTS,
      setGlobalState,
      startListeningState,
      stopAllAudio,
      updateLiveArtifactFromStream
    ]
  );

  useEffect(() => {
    askJarvisFnRef.current = askJarvisLLM;
  }, [askJarvisLLM]);

  const handleOrbClick = useCallback(async () => {
    if (stateRef.current === 'SPEAKING' || isPlayingQueueRef.current) {
      stopAllAudio();
      startListeningState();
      return;
    }
    const ok = await ensureMicrophoneBooted();
    if (!ok) return;

    if (!autoVadRef.current) {
      if (stateRef.current !== 'RECORDING') {
        recordedPCMRef.current = [];
        setGlobalState('RECORDING');
        setStatusText('A gravar... Toca novamente para enviar');
      } else {
        finishRecordingAndTranscribe(true);
      }
    } else if (stateRef.current === 'RECORDING') {
      finishRecordingAndTranscribe(true);
    } else {
      recordedPCMRef.current = [];
      setGlobalState('RECORDING');
      speechStartRef.current = performance.now();
      lastVoiceRef.current = performance.now();
      setStatusText('A ouvir a tua frase...');
    }
  }, [
    ensureMicrophoneBooted,
    finishRecordingAndTranscribe,
    setGlobalState,
    startListeningState,
    stopAllAudio
  ]);

  useEffect(() => {
    handleOrbClickRef.current = handleOrbClick;
  }, [handleOrbClick]);

  // Atalho Tecla Espaço (sem stale closures!)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (
        e.code === 'Space' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')
      ) {
        e.preventDefault();
        if (handleOrbClickRef.current) handleOrbClickRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ============================================================================
  // 5. GESTÃO DE SESSÕES, ARTEFACTOS E AÇÕES DO CENTRO DE COMANDO
  // ============================================================================
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
    if (window.innerWidth <= 960) setSidebarOpen(false);
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

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId) || null;

  const continueCutArtifact = async () => {
    if (!activeArtifact) return;
    setIsStreamingArt(true);
    setArtTab('code');
    setStatusText('A continuar código exatamente de onde parou...');

    const tailLines = activeArtifact.code.split('\n').slice(-15).join('\n');
    const continuePrompt = `O teu bloco de código anterior ficou cortado nestas linhas finais:\n\n\`\`\`${activeArtifact.lang}\n${tailLines}\n\`\`\`\n\nContinua IMEDIATAMENTE o código exatamente a partir do caracter seguinte até fechar todo o ficheiro (\`</body></html>\`), dentro de um bloco \`\`\`${activeArtifact.lang} ... \`\`\`. Não repitas o início!`;

    const baseCode = activeArtifact.code;
    try {
      const res = await fetch('/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3-coder',
          messages: [
            {
              role: 'system',
              content: buildSystemPromptWithLiveContext('', coreMemoryMdRef.current, telemetryRef.current)
            },
            { role: 'user', content: continuePrompt }
          ],
          stream: true
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
              rawCont += data.choices?.[0]?.delta?.content || '';
              const m = rawCont.match(/```[a-zA-Z0-9_:-]*\n([\s\S]*?)(?:```|$)/);
              if (m) {
                const merged = baseCode + '\n' + m[1];
                setArtifacts((prev) =>
                  prev.map((a) =>
                    a.id === activeArtifact.id
                      ? { ...a, code: merged, isClosed: rawCont.includes('```', 10) }
                      : a
                  )
                );
              }
            } catch {}
          }
        }
      }
      setIsStreamingArt(false);
      if (['html', 'svg'].includes(activeArtifact.lang.toLowerCase())) setArtTab('preview');
      setStatusText('Código completado.');
    } catch (e) {
      setIsStreamingArt(false);
      setStatusText('Erro ao continuar código.');
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

  const handleSendManual = (e) => {
    if (e) e.preventDefault();
    const t = inputText.trim();
    if (!t) return;
    setInputText('');
    askJarvisLLM(t, false);
  };

  const renderMessageContent = (msg) => {
    if (msg.role === 'user') return <div className="whitespace-pre-wrap">{msg.content}</div>;
    const segments = parseMessageSegments(msg.id, msg.content);

    return (
      <div className="space-y-3">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap leading-relaxed text-slate-100">
                {seg.content}
              </div>
            );
          }
          if (seg.type === 'artifact') {
            return (
              <div
                key={seg.id || i}
                className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-sky-500/50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Code2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">{seg.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {seg.lang?.toUpperCase()} · {seg.linesCount} linhas · Estúdio Interativo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveArtifactId(seg.id);
                    setArtifactPanelOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Abrir Artefacto →
                </button>
              </div>
            );
          }
          if (seg.type === 'pdf') {
            const media = seg.id ? generatedMediaMap[seg.id] : null;
            return (
              <div
                key={seg.id || i}
                className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-emerald-300">{seg.title}</div>
                    <div className="text-[11px] text-slate-400">Documento pronto para exportação</div>
                  </div>
                </div>
                {media?.url && (
                  <a
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0"
                  >
                    Abrir Documento
                  </a>
                )}
              </div>
            );
          }
          if (seg.type === 'image') {
            const media = seg.id ? generatedMediaMap[seg.id] : null;
            return (
              <div key={seg.id || i} className="space-y-2">
                {media?.url ? (
                  <img
                    src={media.url}
                    alt={seg.content}
                    referrerPolicy="no-referrer"
                    className="max-w-full rounded-xl border border-slate-800"
                  />
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 font-mono">
                    A sintetizar imagem: {seg.content}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {msg.groundingSources && msg.groundingSources.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">Fontes Web:</span>
            {msg.groundingSources.map((src, idx) => (
              <a
                key={idx}
                href={src.uri}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <span>{src.title}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const totalMemoryFacts = memorySections.reduce((acc, s) => acc + s.items.length, 0);
  const lastAssistantMsg =
    [...messages].reverse().find((m) => m.role === 'assistant')?.content || '';

  return (
    <div className="flex flex-col h-full w-full bg-[#060a12] text-slate-100 select-none">
      {/* TOP BAR CONTRACT: Strictly 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-5 py-3 bg-slate-950/95 border-b border-slate-800/90 z-30 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('chat');
          }}
          className="text-base font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          J.A.R.V.I.S. Studio
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav aria-label="Navegação Principal" className="flex items-center gap-6 text-xs font-medium text-slate-400 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveNav('chat')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeNav === 'chat'
                ? 'text-slate-100 border-sky-400 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Conversa & Artefactos
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('voice')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeNav === 'voice'
                ? 'text-slate-100 border-sky-400 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Modo Voz
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('command')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeNav === 'command'
                ? 'text-slate-100 border-sky-400 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Rede & Sensores
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('memory')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeNav === 'memory'
                ? 'text-slate-100 border-sky-400 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Memória Instantânea
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveNav('voice');
              ensureMicrophoneBooted();
            }}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Modo Voz Direto
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative select-text">
        {/* VIEW 1: CHAT & CLAUDE ARTIFACT STUDIO */}
        {activeNav === 'chat' && (
          <>
            {/* Collapsible Session Sidebar */}
            {sidebarOpen && (
              <aside
                aria-label="Histórico de Conversas"
                className="w-64 bg-slate-950 border-r border-slate-800/90 flex flex-col p-3 gap-3 z-30 fixed inset-y-0 left-0 lg:static"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={createNewSession}
                    className="flex-1 py-2 px-3 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Conversa
                  </button>
                  <button
                    type="button"
                    aria-label="Ocultar barra lateral"
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 cursor-pointer"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setCurrentSessionId(s.id);
                        loadSessionMessages(s.id);
                        if (window.innerWidth <= 960) setSidebarOpen(false);
                      }}
                      className={`group px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        s.id === currentSessionId
                          ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium'
                          : 'text-slate-300 hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{s.title}</span>
                      <button
                        type="button"
                        aria-label={`Apagar conversa ${s.title}`}
                        onClick={(e) => deleteSession(e, s.id)}
                        className="opacity-70 hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Live Telemetry Summary inside Sidebar */}
                {telemetry && (
                  <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2 text-slate-300 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <CloudSun className="w-3.5 h-3.5 text-sky-400 shrink-0" /> Viana GPS
                      </span>
                      <span className="font-mono text-slate-100 tabular-nums truncate">
                        {telemetry.weather.temperatureC}°C · {telemetry.weather.conditionText}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-slate-300 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Router
                      </span>
                      <span className="font-mono text-slate-100 tabular-nums">
                        {telemetry.network.downloadMbps} Mbps · {telemetry.network.pingMs}ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-slate-300 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" /> RTX 3060 Ti
                      </span>
                      <span className="font-mono text-slate-100 tabular-nums">
                        {telemetry.machines[0]?.vramUsedMb}MB · {telemetry.machines[0]?.tempC}°C
                      </span>
                    </div>
                  </div>
                )}
              </aside>
            )}

            {/* Central Chat Column */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* Sub-toolbar for Workspace Context & Voice Settings */}
              <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  {!sidebarOpen && (
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <PanelLeft className="w-3.5 h-3.5 text-sky-400" />
                      Conversas
                    </button>
                  )}
                  <span className="text-slate-400 hidden sm:inline">
                    {telemetry
                      ? `${telemetry.weather.locationName}: ${telemetry.weather.temperatureC}°C · Router: ${telemetry.network.downloadMbps} Mbps ↓ (${telemetry.network.pingMs}ms) · ${telemetry.gpuSummary}`
                      : 'Sensores domésticos sincronizados'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-slate-400">
                    <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                    <select
                      aria-label="Escolher voz"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="duarte">Voz: Duarte (PT-PT)</option>
                      <option value="raquel">Voz: Raquel / Friday (PT-PT)</option>
                      <option value="piper">Voz: Piper (Offline)</option>
                    </select>
                  </label>

                  {activeArtifact && (
                    <button
                      type="button"
                      onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
                      className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      {artifactPanelOpen ? 'Ocultar Artefacto' : 'Abrir Artefacto'}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Stream */}
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 max-w-4xl w-full mx-auto"
              >
                {/* Quick Action Starters */}
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() =>
                      askJarvisLLM('Como está o tempo hoje em Viana do Castelo e nos próximos dias?', false)
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    Meteorologia & GPS em Viana
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      askJarvisLLM(
                        'Qual é o tráfego atual do router lá de casa, latência ping e estado das máquinas do homelab?',
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    Tráfego do Router & Máquinas de Casa
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      askJarvisLLM(
                        'Lembra-te que o servidor backup do projeto AppRAN corre na porta 8090.',
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    Testar Memória Instantânea
                  </button>
                </div>

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`animate-msg-in flex flex-col ${
                      m.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* Instant Memory Updated Indicator (ChatGPT Style) */}
                    {m.memoryUpdated && m.memoryUpdated.length > 0 && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
                        <Brain className="w-3.5 h-3.5 text-amber-400" />
                        <span>Memória Instantânea Atualizada · {m.memoryUpdated[0]}</span>
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm max-w-[90%] sm:max-w-[84%] ${
                        m.role === 'user'
                          ? 'bg-sky-600 text-white rounded-br-sm'
                          : 'bg-slate-900/85 border border-slate-800/90 text-slate-100 w-full'
                      }`}
                    >
                      {renderMessageContent(m)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Voice + Text Input Bar */}
              <footer className="px-4 py-3 bg-slate-950/95 border-t border-slate-800/90">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                  {/* Mini Reactive Canvas Voice Orb */}
                  <div className="shrink-0 flex items-center gap-2">
                    <FluidVoiceOrb
                      state={jarvisState}
                      analyserRef={analyserRef}
                      size={48}
                      onClick={handleOrbClick}
                      ariaLabel="Ativar ou interromper voz do J.A.R.V.I.S."
                    />
                    {jarvisState === 'SPEAKING' && (
                      <button
                        type="button"
                        aria-label="Parar reprodução de voz"
                        onClick={stopAllAudio}
                        className="p-2 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Status + Non-React 60fps Volume Meter */}
                  <div className="hidden md:flex flex-col gap-1 w-48 shrink-0">
                    <div className="text-[11px] text-slate-400 truncate">
                      {liveTranscript ? `“${liveTranscript}”` : statusText}
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        ref={volBarDomRef}
                        className="h-full bg-sky-400 transition-[width] duration-75"
                        style={{ width: '0%' }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                        style={{ left: `${threshold}%` }}
                      />
                    </div>
                  </div>

                  {/* Text Input Form */}
                  <form onSubmit={handleSendManual} className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      aria-label="Mensagem para o J.A.R.V.I.S."
                      placeholder="Pergunta pelo tempo, GPS, tráfego do router, estado das máquinas ou pede código..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                    <button
                      type="submit"
                      aria-label="Enviar mensagem"
                      className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span>Enviar</span>
                    </button>
                  </form>
                </div>
              </footer>
            </main>

            {/* Split-Screen Claude Artifact Drawer */}
            <ArtifactDrawer
              artifact={activeArtifact}
              isOpen={artifactPanelOpen}
              onClose={() => setArtifactPanelOpen(false)}
              activeTab={artTab}
              setActiveTab={setArtTab}
              consoleOutput={artConsole}
              isStreaming={isStreamingArt}
              onRunArtifact={runCurrentArtifact}
              onContinueCutArtifact={continueCutArtifact}
              codeScrollRef={codeScrollRef}
            />
          </>
        )}

        {/* VIEW 2: CHATGPT LIVE VOICE MODE */}
        {activeNav === 'voice' && (
          <ChatGptVoiceView
            jarvisState={jarvisState}
            statusText={statusText}
            liveTranscript={liveTranscript}
            lastAssistantReply={lastAssistantMsg}
            voice={voice}
            setVoice={setVoice}
            speed={speed}
            setSpeed={setSpeed}
            autoVadMode={autoVadMode}
            setAutoVadMode={setAutoVadMode}
            threshold={threshold}
            setThreshold={setThreshold}
            analyserRef={analyserRef}
            onOrbClick={handleOrbClick}
            onStopAudio={stopAllAudio}
            onQuickVoicePrompt={(prompt) => askJarvisLLM(prompt, true)}
            telemetry={telemetry}
            memoryFactsCount={totalMemoryFacts}
          />
        )}

        {/* VIEW 3: COMMAND CENTER (WEATHER/GPS, ROUTER TRAFFIC, HOMELAB MACHINES) */}
        {activeNav === 'command' && (
          <CommandCenterView
            telemetry={telemetry}
            onRefreshTelemetry={refreshTelemetry}
            onUpdateLocation={async (lat, lon, name) => {
              const r = await fetch('/telemetry/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: lat, longitude: lon, locationName: name })
              });
              if (r.ok) setTelemetry(await r.json());
            }}
            onRunSpeedTest={async () => {
              const r = await fetch('/telemetry/network/speedtest', { method: 'POST' });
              if (r.ok) {
                const d = await r.json();
                if (d.telemetry) setTelemetry(d.telemetry);
              }
            }}
            onMachineAction={async (machineId, action) => {
              const r = await fetch('/telemetry/homelab/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machineId, action })
              });
              if (r.ok) {
                const d = await r.json();
                if (d.telemetry) setTelemetry(d.telemetry);
                return d.message || '';
              }
              return '';
            }}
            onAskJarvisAbout={(prompt) => {
              setActiveNav('chat');
              askJarvisLLM(prompt, true);
            }}
          />
        )}

        {/* VIEW 4: INSTANT MEMORY ENGINE & ARCHITECTURE PLAN */}
        {activeNav === 'memory' && (
          <InstantMemoryView
            coreMemoryMd={coreMemoryMd}
            setCoreMemoryMd={setCoreMemoryMd}
            sections={memorySections}
            corrections={corrections}
            recentExtractions={recentExtractions}
            onSaveMarkdown={async (md) => {
              try {
                const r = await fetch('/memory/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ markdown: md })
                });
                if (r.ok) {
                  const d = await r.json();
                  if (d.markdown) setCoreMemoryMd(d.markdown);
                }
              } catch {
                localStorage.setItem('jarvis_fallback_md', md);
              }
            }}
            onTestInstantExtraction={async (sentence) => {
              const r = await fetch('/memory/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_text: sentence, ai_text: '' })
              });
              if (r.ok) {
                const d = await r.json();
                if (d.markdown) setCoreMemoryMd(d.markdown);
                if (d.recentExtractions) setRecentExtractions(d.recentExtractions);
              }
            }}
            onLearnWord={async (wrong, right) => {
              const r = await fetch('/memory/learn_word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wrong, right })
              });
              if (r.ok) {
                const d = await r.json();
                if (d.corrections) setCorrections(d.corrections);
              }
            }}
            onDeleteWord={async (wrong) => {
              const r = await fetch('/memory/delete_word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wrong })
              });
              if (r.ok) {
                const d = await r.json();
                if (d.corrections) setCorrections(d.corrections);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
