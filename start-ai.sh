#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. & Aider — Arranque com Logs em Tempo Real (RTX 3060 Ti 8GB)
# ==============================================================================

MODEL_PATH="${JARVIS_MODEL:-$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf}"
if [ ! -f "$MODEL_PATH" ] && [ -f "$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf" ]; then
    MODEL_PATH="$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf"
fi

SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
PORT=9931
LOG_FILE="/tmp/jarvis-llama-server.log"
N_CPU_MOE="${JARVIS_CPU_MOE:-35}"

if [ ! -f "$SERVER_BIN" ] || [ ! -f "$MODEL_PATH" ]; then
    echo "[-] Erro: Binário ($SERVER_BIN) ou modelo ($MODEL_PATH) não encontrado."
    exit 1
fi

if ss -tulpn | grep -q ":$PORT"; then
    echo "[*] A limpar processos anteriores na porta $PORT..."
    pkill -f "llama-server.*$PORT"
    sleep 1
fi

while [ "$N_CPU_MOE" -le 44 ]; do
    echo "[*] A iniciar o motor local 30B-A3B na RTX 3060 Ti (--n-cpu-moe $N_CPU_MOE)..."
    echo "[*] Log em tempo real ($LOG_FILE):"
    : > "$LOG_FILE"
    "$SERVER_BIN" \
        -m "$MODEL_PATH" \
        --host 127.0.0.1 --port "$PORT" \
        -ngl 99 \
        --n-cpu-moe "$N_CPU_MOE" \
        --load-mode none \
        -c 16384 \
        -ctk q8_0 -ctv q8_0 \
        -fa on \
        --cache-reuse 256 > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    tail -n +1 -f "$LOG_FILE" &
    TAIL_PID=$!

    CRASHED=0
    while ! curl -s "http://127.0.0.1:$PORT/health" | grep -q "ok"; do
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            CRASHED=1
            break
        fi
        sleep 1
    done

    kill "$TAIL_PID" 2>/dev/null
    wait "$TAIL_PID" 2>/dev/null

    if [ "$CRASHED" -eq 0 ]; then
        break
    fi

    echo "[!] O llama-server terminou com erro (--n-cpu-moe $N_CPU_MOE)."
    if grep -qiE "out of memory|cudaMalloc failed|failed to allocate" "$LOG_FILE"; then
        N_CPU_MOE=$((N_CPU_MOE + 1))
        echo "[*] A tentar novamente com --n-cpu-moe $N_CPU_MOE..."
    else
        echo "[-] Consulta o ficheiro $LOG_FILE para mais detalhes."
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
