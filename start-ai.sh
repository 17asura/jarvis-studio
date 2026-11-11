#!/bin/bash

MODEL_PATH="$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf"
SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
PORT=9931

if [ ! -f "$SERVER_BIN" ] || [ ! -f "$MODEL_PATH" ]; then
    echo "[-] Erro: Binário ou modelo GGUF não encontrado."
    exit 1
fi

if ss -tulpn | grep -q ":$PORT"; then
    echo "[*] A limpar processos anteriores na porta $PORT..."
    pkill -f "llama-server.*$PORT"
    sleep 1
fi

echo "[*] A iniciar o motor local 30B-A3B na RTX 3060 Ti + RAM..."
"$SERVER_BIN" \
    -m "$MODEL_PATH" \
    --host 127.0.0.1 --port "$PORT" \
    -ngl 99 \
    --n-cpu-moe 35 \
    --load-mode none \
    -c 16384 \
    -ctk q8_0 -ctv q8_0 \
    -fa on \
    --cache-reuse 256 > /dev/null 2>&1 &

SERVER_PID=$!

echo "[*] A aguardar que o modelo termine de carregar (pode demorar 15-25 segundos)..."
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
