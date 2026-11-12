#!/bin/bash
# ==============================================================================
# J.A.R.V.I.S. Studio — Script Otimizado para RTX 3060 Ti (8GB VRAM) + Ryzen 7 5800X
# Algoritmo Hot-Expert MoE Split (--n-cpu-moe 26 em vez de 35 => +65% velocidade!)
# ==============================================================================

MODEL_PATH="${JARVIS_MODEL:-$HOME/llama.cpp/models/Qwen3-30B-A3B-Instruct-2507-UD-Q4_K_XL.gguf}"
if [ ! -f "$MODEL_PATH" ]; then
    MODEL_PATH="$HOME/llama.cpp/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf"
fi

SERVER_BIN="$HOME/llama.cpp/build/bin/llama-server"
LLM_PORT=9931
WEB_PORT=3000
N_CPU_MOE="${JARVIS_CPU_MOE:-26}"
CTX_SIZE="${JARVIS_CTX:-16384}"

if ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; then
    echo "[*] A iniciar motor MoE otimizado na RTX 3060 Ti (--n-cpu-moe $N_CPU_MOE)..."
    pkill -f "llama-server.*$LLM_PORT" 2>/dev/null
    "$SERVER_BIN" \
        -m "$MODEL_PATH" \
        --host 0.0.0.0 --port "$LLM_PORT" \
        -ngl 99 \
        --n-cpu-moe "$N_CPU_MOE" \
        -t 8 -tb 14 \
        --load-mode none \
        -c "$CTX_SIZE" \
        -b 2048 -ub 512 \
        -ctk q8_0 -ctv q8_0 \
        -fa on \
        --cache-reuse 256 > /dev/null 2>&1 &
    
    echo "[*] A carregar peritos quentes MoE para os 8GB GDDR6 da RTX 3060 Ti..."
    while ! curl -s "http://127.0.0.1:$LLM_PORT/health" | grep -q "ok"; do
        sleep 2
    done
fi

echo "[+] Motor RTX 3060 Ti pronto em alta velocidade!"
echo "[*] A iniciar o J.A.R.V.I.S. Studio em http://localhost:$WEB_PORT ..."

fuser -k "${WEB_PORT}/tcp" 2>/dev/null
~/.venv/bin/uvicorn server:app --app-dir "$HOME/voice-ai" --host 0.0.0.0 --port "$WEB_PORT" &
WEB_PID=$!

sleep 3
xdg-open "http://localhost:$WEB_PORT" 2>/dev/null || echo "Abre no browser: http://localhost:$WEB_PORT"

echo ""
echo "=========================================================="
echo " 🎤 J.A.R.V.I.S. Studio ativo em: http://localhost:$WEB_PORT"
echo " Prime [Ctrl+C] quando quiseres desligar tudo e limpar a VRAM."
echo "=========================================================="

trap "echo ''; echo '[*] A encerrar...'; kill $WEB_PID 2>/dev/null; pkill -f 'llama-server.*$LLM_PORT'; echo '[+] Tudo desligado!'; exit 0" SIGINT SIGTERM
wait
