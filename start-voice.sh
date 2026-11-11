#!/bin/bash

MODEL_PATH="$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf"
SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
LLM_PORT=9931
WEB_PORT=3000

if ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; then
    echo "[*] A iniciar o motor local 30B-A3B na porta $LLM_PORT..."
    pkill -f "llama-server.*$LLM_PORT" 2>/dev/null
    "$SERVER_BIN" \
        -m "$MODEL_PATH" \
        --host 0.0.0.0 --port "$LLM_PORT" \
        -ngl 99 \
        --n-cpu-moe 35 \
        --load-mode none \
        -c 16384 \
        -ctk q8_0 -ctv q8_0 \
        -fa on \
        --cache-reuse 256 > /dev/null 2>&1 &
    
    echo "[*] A aguardar que o modelo 30B carregue na RTX 3060 Ti..."
    while ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; do
        sleep 2
    done
fi

echo "[+] Motor 30B-A3B pronto!"
echo "[*] A iniciar o servidor de voz local (Faster-Whisper CPU) em http://localhost:$WEB_PORT ..."

fuser -k "${WEB_PORT}/tcp" 2>/dev/null
~/.venv/bin/uvicorn server:app --app-dir "$HOME/voice-ai" --host 0.0.0.0 --port "$WEB_PORT" &
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
