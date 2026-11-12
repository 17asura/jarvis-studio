#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. Studio — Arranque Inteligente com Proteção Anti-OOM (RTX 3060 Ti 8GB)
# ==============================================================================

MODEL_PATH="${JARVIS_MODEL:-$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf}"
if [ ! -f "$MODEL_PATH" ] && [ -f "$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf" ]; then
    MODEL_PATH="$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf"
fi

SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
LLM_PORT=9931
WEB_PORT=3000
LOG_FILE="/tmp/jarvis-llama-server.log"
CTX_SIZE="${JARVIS_CTX:-16384}"

# Detetar VRAM livre real na RTX 3060 Ti para escolher o --n-cpu-moe seguro (evita crash cudaMalloc OOM)
FREE_VRAM_MB=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ')
if [ -n "$JARVIS_CPU_MOE" ]; then
    N_CPU_MOE="$JARVIS_CPU_MOE"
elif [ -n "$FREE_VRAM_MB" ] && [ "$FREE_VRAM_MB" -ge 7200 ] 2>/dev/null; then
    N_CPU_MOE=34
elif [ -n "$FREE_VRAM_MB" ] && [ "$FREE_VRAM_MB" -ge 6600 ] 2>/dev/null; then
    N_CPU_MOE=35
else
    N_CPU_MOE=36
fi

start_llama_with_fallback() {
    local current_moe=$1
    pkill -f "llama-server.*$LLM_PORT" 2>/dev/null
    sleep 1

    while [ "$current_moe" -le 44 ]; do
        echo "[*] A iniciar motor 30B-A3B na porta $LLM_PORT (--n-cpu-moe $current_moe | VRAM livre: ${FREE_VRAM_MB:-N/A} MB)..."
        : > "$LOG_FILE"
        "$SERVER_BIN" \
            -m "$MODEL_PATH" \
            --host 0.0.0.0 --port "$LLM_PORT" \
            -ngl 99 \
            --n-cpu-moe "$current_moe" \
            -t 8 \
            --load-mode none \
            -c "$CTX_SIZE" \
            -ctk q8_0 -ctv q8_0 \
            -fa on \
            --cache-reuse 256 > "$LOG_FILE" 2>&1 &
        LLM_PID=$!

        echo "[*] A carregar modelo na RTX 3060 Ti (PID $LLM_PID — log em $LOG_FILE)..."
        local elapsed=0
        local crashed=0
        while ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; do
            # Verificar se o processo llama-server morreu (ex: Out of Memory na VRAM)
            if ! kill -0 "$LLM_PID" 2>/dev/null; then
                crashed=1
                break
            fi
            sleep 2
            elapsed=$((elapsed + 2))
            if [ $((elapsed % 10)) -eq 0 ]; then
                echo "    ... a carregar pesos (${elapsed}s decorridos)"
            fi
        done

        if [ "$crashed" -eq 0 ]; then
            echo "[+] Motor 30B-A3B carregado com sucesso (--n-cpu-moe $current_moe)!"
            return 0
        fi

        echo "[!] O llama-server terminou inesperadamente com --n-cpu-moe $current_moe. Últimas linhas do log:"
        tail -n 6 "$LOG_FILE"
        if grep -qiE "out of memory|cudaMalloc failed|failed to allocate" "$LOG_FILE"; then
            current_moe=$((current_moe + 2))
            echo "[*] A recuperar automaticamente de falta de VRAM: a tentar com --n-cpu-moe $current_moe..."
        else
            echo "[-] Erro fatal ao iniciar llama-server (verifica $LOG_FILE)."
            return 1
        fi
    done
    return 1
}

if ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; then
    start_llama_with_fallback "$N_CPU_MOE" || exit 1
else
    echo "[+] Motor 30B-A3B já está ativo na porta $LLM_PORT!"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${JARVIS_APP_DIR:-$SCRIPT_DIR}"
if [ ! -f "$APP_DIR/server.py" ] && [ -d "$HOME/voice-ai" ]; then
    APP_DIR="$HOME/voice-ai"
fi

# Compilar o frontend React atualizado se o npm estiver disponível
if command -v npm >/dev/null 2>&1 && [ -f "$APP_DIR/package.json" ]; then
    if [ ! -f "$APP_DIR/dist/index.html" ] || [ "$APP_DIR/src/App.jsx" -nt "$APP_DIR/dist/index.html" ]; then
        echo "[*] A compilar a interface React atualizada (npm run build)..."
        (cd "$APP_DIR" && npm run build >/dev/null 2>&1) || true
    fi
fi

echo "[*] A iniciar o servidor de voz local (Faster-Whisper CPU) em http://localhost:$WEB_PORT ..."

fuser -k "${WEB_PORT}/tcp" 2>/dev/null
~/.venv/bin/uvicorn server:app --app-dir "$APP_DIR" --host 0.0.0.0 --port "$WEB_PORT" &
WEB_PID=$!

sleep 3
xdg-open "http://localhost:$WEB_PORT" 2>/dev/null || echo "Abre no browser: http://localhost:$WEB_PORT"

echo ""
echo "=========================================================="
echo " 🎤 WebApp 100% Local ativa em: http://localhost:$WEB_PORT"
echo " Prime [Ctrl+C] quando quiseres desligar tudo e limpar a VRAM."
echo "=========================================================="

trap "echo ''; echo '[*] A encerrar...'; kill $WEB_PID 2>/dev/null; pkill -f 'llama-server.*$LLM_PORT'; echo '[+] Tudo desligado!'; exit 0" SIGINT SIGTERM
wait
