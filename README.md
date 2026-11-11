# ⚡ J.A.R.V.I.S. Studio (100% Local AI Voice & Code Assistant)

Estúdio multimodal de Inteligência Artificial e Engenharia de Software desenhado para correr localmente numa **NVIDIA RTX 3060 Ti (8GB VRAM) + 32GB RAM**, combinando inferência híbrida MoE (`llama.cpp`) com reconhecimento e síntese de voz de ultra-baixa latência.

## 🏗️ Arquitetura do Sistema
- **Motor LLM (`llama-server`):** `Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL` com offloading parcial de especialistas MoE (`--n-cpu-moe 35`) e KV Cache quantizada em `q8_0`.
- **Reconhecimento de Voz (STT):** `Faster-Whisper` (`small`, INT8 na CPU) com captura nativa WAV PCM 48kHz, Ring Buffer de Pré-Roll (600ms) e dicionário fonético adaptativo PT-PT.
- **Síntese de Voz (TTS):** Fila assíncrona de *Lookahead Prefetch* com suporte para vozes neurais PT-PT (`DuarteNeural` / `RaquelNeural`) e fallback 100% offline via `Piper TTS` (`pt_PT-tugão-medium`).
- **Memória Persistente (`.md` + SQLite):** Injeção de contexto a partir de `memory/core_memory.md`, consolidação automática sem bloqueio da GPU e histórico completo de sessões em SQLite.
- **Artefactos Interativos (Estilo Claude):** Painel split-screen com visualização de código, *Live Preview* (HTML/CSS/JS/SVG), execução local de scripts Python/Bash e geração sob pedido de documentos PDF (`fpdf2`) e imagens.
- **Mobile Ready:** Compatível com acesso remoto seguro via HTTPS em `tailscale serve`.

## 🚀 Como Executar
```bash
chmod +x start-voice.sh
./start-voice.sh
