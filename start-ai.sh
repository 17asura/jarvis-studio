#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. & Aider — Script Otimizado para RTX 3060 Ti (8GB) + Ryzen 7 5800X
# ==============================================================================

MODEL_PATH="${JARVIS_MODEL:-$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf}"
if [ ! -f "$MODEL_PATH" ]; then
    MODEL_PATH="$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf"
fi

SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
PORT=9931
N_CPU_MOE="${JARVIS_CPU_MOE:-26}"

if [ ! -f "$SERVER_BIN" ] || [ ! -f "$MODEL_PATH" ]; then
    echo "[-] Erro: Binário ou modelo GGUF não encontrado."
    exit 1
fi

if ss -tulpn | grep -q ":$PORT"; then
    echo "[*] A limpar processos anteriores na porta $PORT..."
    pkill -f "llama-server.*$PORT"
    sleep 1
fi

echo "[*] A iniciar o motor 30B-A3B na RTX 3060 Ti (--n-cpu-moe $N_CPU_MOE, 22 camadas GPU)..."
"$SERVER_BIN" \
    -m "$MODEL_PATH" \
    --host 127.0.0.1 --port "$PORT" \
    -ngl 99 \
    --n-cpu-moe "$N_CPU_MOE" \
    -t 8 -tb 14 \
    --load-mode none \
    -c 16384 \
    -b 2048 -ub 512 \
    -ctk q8_0 -ctv q8_0 \
    -fa on \
    --cache-reuse 256 > /dev/null 2>&1 &

SERVER_PID=$!

echo "[*] A aguardar que o modelo carregue na RTX 3060 Ti..."
while ! curl -s "http://127.0.0.1:$PORT/health" | grep -q "ok"; do
    sleep 2
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
