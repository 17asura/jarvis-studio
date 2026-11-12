#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. Studio — Arranque com Logs em Tempo Real & Auto-Recovery (RTX 3060 Ti)
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
N_CPU_MOE="${JARVIS_CPU_MOE:-35}"

echo "=========================================================="
echo " 🔍 Diagnóstico Inicial RTX 3060 Ti & Modelo GGUF"
echo "=========================================================="
echo " • Binário: $SERVER_BIN"
echo " • Modelo : $MODEL_PATH"
echo " • Log    : $LOG_FILE (podes ver noutro terminal com: tail -f $LOG_FILE)"
nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,temperature.gpu --format=csv 2>/dev/null || true
echo "=========================================================="

start_llama_with_live_logs() {
    local current_moe=$1
    pkill -f "llama-server.*$LLM_PORT" 2>/dev/null
    sleep 1

    while [ "$current_moe" -le 44 ]; do
        echo ""
        echo "[*] A iniciar llama-server na porta $LLM_PORT com --n-cpu-moe $current_moe ..."
        : > "$LOG_FILE"

        "$SERVER_BIN" \
            -m "$MODEL_PATH" \
            --host 0.0.0.0 --port "$LLM_PORT" \
            -ngl 99 \
            --n-cpu-moe "$current_moe" \
            --load-mode none \
            -c "$CTX_SIZE" \
            -ctk q8_0 -ctv q8_0 \
            -fa on \
            --cache-reuse 256 > "$LOG_FILE" 2>&1 &
        LLM_PID=$!

        # Mostrar os logs do llama-server EM TEMPO REAL no terminal enquanto carrega!
        tail -n +1 -f "$LOG_FILE" &
        TAIL_PID=$!

        local crashed=0
        while ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; do
            if ! kill -0 "$LLM_PID" 2>/dev/null; then
                crashed=1
                break
            fi
            sleep 1
        done

        # Parar o tail -f assim que carregou ou crashou
        kill "$TAIL_PID" 2>/dev/null
        wait "$TAIL_PID" 2>/dev/null

        if [ "$crashed" -eq 0 ]; then
            echo ""
            echo "[+] Motor 30B-A3B carregado e pronto (--n-cpu-moe $current_moe)!"
            return 0
        fi

        echo ""
        echo "[!] O llama-server fechou com erro (vê as linhas acima ou em $LOG_FILE)."
        if grep -qiE "out of memory|cudaMalloc failed|failed to allocate" "$LOG_FILE"; then
            current_moe=$((current_moe + 1))
            echo "[*] Falta de VRAM detetada! A tentar novamente com --n-cpu-moe $current_moe ..."
        else
            echo "[-] Erro de configuração/flag no llama-server. Verifica o log completo em: $LOG_FILE"
            return 1
        fi
    done
    return 1
}

if ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; then
    start_llama_with_live_logs "$N_CPU_MOE" || exit 1
else
    echo "[+] Motor 30B-A3B já está ativo na porta $LLM_PORT!"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${JARVIS_APP_DIR:-$SCRIPT_DIR}"
if [ ! -f "$APP_DIR/server.py" ] && [ -d "$HOME/voice-ai" ]; then
    APP_DIR="$HOME/voice-ai"
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
echo " 📋 Log do modelo: $LOG_FILE"
echo " Prime [Ctrl+C] quando quiseres desligar tudo e limpar a VRAM."
echo "=========================================================="

trap "echo ''; echo '[*] A encerrar...'; kill $WEB_PID 2>/dev/null; pkill -f 'llama-server.*$LLM_PORT'; echo '[+] Tudo desligado!'; exit 0" SIGINT SIGTERM
wait
