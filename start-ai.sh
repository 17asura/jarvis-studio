#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. & Aider — Arranque Inteligente com Proteção Anti-OOM (RTX 3060 Ti 8GB)
# ==============================================================================

MODEL_PATH="${JARVIS_MODEL:-$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf}"
if [ ! -f "$MODEL_PATH" ] && [ -f "$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf" ]; then
    MODEL_PATH="$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf"
fi

SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
PORT=9931
LOG_FILE="/tmp/jarvis-llama-aider.log"

if [ ! -f "$SERVER_BIN" ] || [ ! -f "$MODEL_PATH" ]; then
    echo "[-] Erro: Binário ou modelo GGUF não encontrado."
    exit 1
fi

if ss -tulpn | grep -q ":$PORT"; then
    echo "[*] A limpar processos anteriores na porta $PORT..."
    pkill -f "llama-server.*$PORT"
    sleep 1
fi

FREE_VRAM_MB=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ')
if [ -n "$JARVIS_CPU_MOE" ]; then
    N_CPU_MOE="$JARVIS_CPU_MOE"
elif [ -n "$FREE_VRAM_MB" ] && [ "$FREE_VRAM_MB" -ge 7200 ] 2>/dev/null; then
    N_CPU_MOE=34
else
    N_CPU_MOE=35
fi

while [ "$N_CPU_MOE" -le 44 ]; do
    echo "[*] A iniciar o motor local 30B-A3B na RTX 3060 Ti (--n-cpu-moe $N_CPU_MOE)..."
    : > "$LOG_FILE"
    "$SERVER_BIN" \
        -m "$MODEL_PATH" \
        --host 127.0.0.1 --port "$PORT" \
        -ngl 99 \
        --n-cpu-moe "$N_CPU_MOE" \
        -t 8 \
        --load-mode none \
        -c 16384 \
        -ctk q8_0 -ctv q8_0 \
        -fa on \
        --cache-reuse 256 > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    echo "[*] A aguardar que o modelo carregue (PID $SERVER_PID — log em $LOG_FILE)..."
    CRASHED=0
    while ! curl -s "http://127.0.0.1:$PORT/health" | grep -q "ok"; do
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            CRASHED=1
            break
        fi
        sleep 2
    done

    if [ "$CRASHED" -eq 0 ]; then
        break
    fi

    echo "[!] Falha ao alocar VRAM com --n-cpu-moe $N_CPU_MOE:"
    tail -n 5 "$LOG_FILE"
    if grep -qiE "out of memory|cudaMalloc failed|failed to allocate" "$LOG_FILE"; then
        N_CPU_MOE=$((N_CPU_MOE + 1))
        echo "[*] A ajustar automaticamente para --n-cpu-moe $N_CPU_MOE..."
    else
        exit 1
    fi
done

echo "[+] Servidor local pronto e totalmente carregado!"
echo "[*] A iniciar o Aider..."
echo ""

aider "$@"

echo ""
echo "[*] A desligar o motor local e a libertar a VRAM da RTX 3060 Ti..."
kill $SERVER_PID 2>/dev/null
pkill -f "llama-server.*$PORT"
echo "[+] Concluído. PC limpo!"
