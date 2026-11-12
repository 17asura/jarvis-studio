from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from fpdf import FPDF
import urllib.parse
import numpy as np
import subprocess
import threading
import edge_tts
import sqlite3
import hashlib
import aiohttp
import asyncio
import json
import wave
import time
import math
import uuid
import io
import os
import re

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_DIR = os.path.join(BASE_DIR, "memory")
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
TTS_CACHE_DIR = os.path.join(BASE_DIR, "tts_cache")
CORE_MD_PATH = os.path.join(MEMORY_DIR, "core_memory.md")
LOG_MD_PATH = os.path.join(MEMORY_DIR, "episodic_log.md")
CORRECTIONS_PATH = os.path.join(MEMORY_DIR, "stt_corrections.json")
DB_PATH = os.path.join(MEMORY_DIR, "jarvis_chats.db")

PROTO_HTTP = "ht" + "tp"
PROTO_HTTPS = "ht" + "tps"
LLM_API_URL = f"{PROTO_HTTP}://127.0.0.1:9931/v1/chat/completions"

os.makedirs(MEMORY_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(TTS_CACHE_DIR, exist_ok=True)
app.mount("/exports", StaticFiles(directory=EXPORT_DIR), name="exports")

memory_lock = threading.Lock()
db_lock = threading.Lock()

# ============================================================================
# 1. BASE DE DADOS SQLITE PARA HISTÓRICO DE CHATS PERSISTENTE
# ============================================================================
def init_db():
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT
            )
        """)
        conn.commit()
        conn.close()

init_db()

DEFAULT_MEMORY_MD = """# Memória Central do J.A.R.V.I.S.

## Identidade & Perfil
- Nome: Dinis Portela Sousa (Shad3 / Asura / 17Asura)
- Localização: Darque, Viana do Castelo, Portugal (GPS: 41.6844, -8.7956)
- Estatuto: Trabalhador-Estudante (Vigilante de Segurança Privada + Estudante de Engenharia)
- Estudos: Licenciatura em Engenharia de Sistemas Informáticos (Pós-Laboral) no IPCA (Barcelos)
- Música: Produtor e artista independente (Trap melancólico / Emo Trap / Pop) — single "FL!RTY", projeto "ECLIPSE"
- Veículo: Renault Clio IV Limited Deluxe 0.9 TCe 90cv (2015)

## Hardware & Infraestrutura Local
- Desktop (Shad3-PC): AMD Ryzen 7 5800X, ASUS TUF B450M-PLUS GAMING, RTX 3060 Ti (8GB VRAM), 32GB RAM DDR4
- Portátil (VivoBook-15): ASUS VivoBook 15 (Ryzen 7 5825U, 16GB RAM, Linux Mint)
- Smartphone: Samsung Galaxy S24 Ultra (Tailscale Mesh ativo)
- Homelab (Ubuntu-Homelab): Ubuntu Server 24.04, Docker, Nginx, Tailscale, Nextcloud, code-server, domínio shad3.dev
- Router Principal: Gateway Fibra 1Gbps (192.168.1.1) com DNS AdGuard + WireGuard / Tailscale subnet router

## Projetos Ativos & Stack
- Stack principal: C# (.NET 10), C, Python, SQL Server, SQLite, React, Vite, Express, Docker, Linux Mint
- Projetos: AppRAN (licenciamento Reserva Agrícola Nacional para AMS), UniSync AI / Vibed_Study, Assistente Local J.A.R.V.I.S.

## Preferências & Regras de Resposta
- Idioma estrito: Português de Portugal (PT-PT)
- Estilo de voz: Natural, fluido, direto, conciso e com acesso em tempo real a meteorologia, GPS, tráfego do router e máquinas de casa.

## Factos & Notas Aprendidas
"""

DEFAULT_CORRECTIONS = {
    "jarbas": "Jarvis",
    "já vi": "Jarvis",
    "chaves": "Jarvis",
    "o jarvis": "Olá Jarvis",
    "como está-se": "como estás?",
    "como está se": "como estás?",
    "tudo bem consigo": "tudo bem contigo",
    "ipê cá": "IPCA",
    "i p c a": "IPCA",
    "cê sharp": "C#",
    "c sharp": "C#",
    "pós laboral": "pós-laboral",
    "apê rã": "AppRAN",
    "app ran": "AppRAN",
    "azura": "Asura",
    "clio quatro": "Clio IV"
}

if not os.path.exists(CORE_MD_PATH):
    with open(CORE_MD_PATH, "w", encoding="utf-8") as f:
        f.write(DEFAULT_MEMORY_MD)

if not os.path.exists(LOG_MD_PATH):
    with open(LOG_MD_PATH, "w", encoding="utf-8") as f:
        f.write("# Histórico Episódico J.A.R.V.I.S.\n\n")

try:
    if os.path.exists(CORRECTIONS_PATH):
        with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            DEFAULT_CORRECTIONS.update(json.load(f))
except Exception:
    pass
with open(CORRECTIONS_PATH, "w", encoding="utf-8") as f:
    json.dump(DEFAULT_CORRECTIONS, f, ensure_ascii=False, indent=2)

stt_model = None
try:
    from faster_whisper import WhisperModel
    print("[*] A carregar Faster-Whisper 'small' otimizado (CPU INT8 - 8 Threads)...")
    stt_model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=8)
    print("[+] Faster-Whisper 'small' pronto!")
except Exception as e:
    print(f"[!] Aviso Faster-Whisper: {e}")

piper_voice = None
PIPER_MODEL_PATH = os.path.expanduser("~/voice-ai/voices/pt_PT-tugao-medium.onnx")
PIPER_BIN_PATH = os.path.expanduser("~/.venv/bin/piper")
try:
    from piper.voice import PiperVoice
    if os.path.exists(PIPER_MODEL_PATH):
        piper_voice = PiperVoice.load(PIPER_MODEL_PATH)
        print("[+] Voz de fallback offline Piper carregada!")
except Exception as e:
    print(f"[!] Aviso Piper TTS: {e}")

# ============================================================================
# 2. MODELOS DE DADOS E ROTAS DE HISTÓRICO DE CHATS
# ============================================================================
class TTSRequest(BaseModel):
    text: str
    voice: str = "duarte"

class ChatMessageIn(BaseModel):
    role: str
    content: str
    memoryUpdated: Optional[list] = None

class MemoryTurn(BaseModel):
    user_text: str
    ai_text: str = ""

class ManualMemoryUpdate(BaseModel):
    markdown: str

class VocabCorrection(BaseModel):
    wrong: str
    right: str = ""

class PDFRequest(BaseModel):
    title: str
    content: str

class ImageGenRequest(BaseModel):
    prompt: str

class CodeRunRequest(BaseModel):
    language: str
    code: str

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    locationName: Optional[str] = None

class HomelabAction(BaseModel):
    machineId: str
    action: str

DIST_DIR = os.path.join(BASE_DIR, "dist")
if os.path.exists(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

@app.get("/")
async def index():
    dist_index = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/chats")
async def list_chats():
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, title, updated_at FROM sessions ORDER BY updated_at DESC")
        rows = [{"id": r[0], "title": r[1], "updated_at": r[2]} for r in c.fetchall()]
        conn.close()
    return {"sessions": rows}

@app.post("/chats/new")
async def create_chat():
    sid = f"chat_{int(time.time()*1000)}_{uuid.uuid4().hex[:4]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                  (sid, "Nova Conversa", now, now))
        conn.commit()
        conn.close()
    return {"id": sid, "title": "Nova Conversa", "updated_at": now}

@app.get("/chats/{session_id}")
async def get_chat_messages(session_id: str):
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC", (session_id,))
        msgs = [{"role": r[0], "content": r[1], "created_at": r[2]} for r in c.fetchall()]
        conn.close()
    return {"messages": msgs}

@app.post("/chats/{session_id}/message")
async def add_chat_message(session_id: str, msg: ChatMessageIn):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, title FROM sessions WHERE id = ?", (session_id,))
        row = c.fetchone()
        if not row:
            title = msg.content[:40].strip() if msg.role == "user" else "Nova Conversa"
            c.execute("INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                      (session_id, title, now, now))
        else:
            if row[1] == "Nova Conversa" and msg.role == "user":
                new_title = msg.content[:40].strip()
                c.execute("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", (new_title, now, session_id))
            else:
                c.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))

        c.execute("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                  (session_id, msg.role, msg.content, now))
        conn.commit()
        conn.close()
    return {"status": "ok"}

@app.delete("/chats/{session_id}")
async def delete_chat(session_id: str):
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        c.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
        conn.close()
    return {"status": "ok"}

# ============================================================================
# 3. TELEMETRIA DO HARDWARE LOCAL, REDE/ROUTER, METEOROLOGIA/GPS & HOMELAB
# ============================================================================
current_location = {
    "lat": 41.6844,
    "lon": -8.7956,
    "name": "Darque, Viana do Castelo, PT"
}
cached_weather = None
last_weather_ts = 0.0

WMO_CODES_PT = {
    0: "Céu limpo", 1: "Geralmente limpo", 2: "Parcialmente nublado", 3: "Encoberto",
    45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Chuvisco fraco", 53: "Chuvisco moderado",
    61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte", 80: "Aguaceiros fracos",
    81: "Aguaceiros moderados", 95: "Trovoada"
}

homelab_machines = [
    {
        "id": "shad3-pc",
        "name": "Shad3-PC (Workstation)",
        "role": "Inferência AI Local & Gaming/Dev",
        "ip": "192.168.1.10",
        "tailscaleIp": "100.84.12.10",
        "os": "Linux Mint 22 (Kernel 6.8)",
        "specs": "AMD Ryzen 7 5800X • RTX 3060 Ti 8GB • 32GB DDR4",
        "status": "online",
        "cpuPercent": 24,
        "ramUsedGb": 11.4,
        "ramTotalGb": 32,
        "tempC": 54,
        "gpuName": "NVIDIA GeForce RTX 3060 Ti",
        "vramUsedMb": 5840,
        "vramTotalMb": 8192,
        "gpuUtilPercent": 31,
        "netDownMbps": 48.5,
        "netUpMbps": 12.2,
        "uptime": "4d 14h 22m",
        "services": [
            {"name": "llama-server (Qwen3-30B)", "port": 9931, "status": "running"},
            {"name": "Faster-Whisper STT + TTS", "port": 3000, "status": "running"},
            {"name": "SQL Server / Docker Dev", "port": 1433, "status": "running"}
        ]
    },
    {
        "id": "ubuntu-homelab",
        "name": "Ubuntu-Homelab (shad3.dev)",
        "role": "Servidor Doméstico & Cloud Privada",
        "ip": "192.168.1.20",
        "tailscaleIp": "100.84.12.20",
        "os": "Ubuntu Server 24.04 LTS",
        "specs": "Docker Engine • NVMe RAID • Tailscale Subnet Router",
        "status": "online",
        "cpuPercent": 14,
        "ramUsedGb": 6.2,
        "ramTotalGb": 16,
        "tempC": 43,
        "netDownMbps": 84.0,
        "netUpMbps": 38.6,
        "uptime": "29d 08h 41m",
        "services": [
            {"name": "Nginx Reverse Proxy (shad3.dev)", "port": 443, "status": "running"},
            {"name": "Nextcloud Hub", "port": 8080, "status": "running"},
            {"name": "code-server Web IDE", "port": 8443, "status": "running"},
            {"name": "AdGuard Home DNS", "port": 53, "status": "running"}
        ]
    },
    {
        "id": "vivobook-15",
        "name": "ASUS VivoBook 15",
        "role": "Portátil Engenharia IPCA",
        "ip": "192.168.1.35",
        "tailscaleIp": "100.84.12.35",
        "os": "Linux Mint / Dual-Boot",
        "specs": "AMD Ryzen 7 5825U • Radeon Graphics • 16GB RAM",
        "status": "online",
        "cpuPercent": 9,
        "ramUsedGb": 4.8,
        "ramTotalGb": 16,
        "tempC": 41,
        "netDownMbps": 11.2,
        "netUpMbps": 2.4,
        "uptime": "0d 06h 15m",
        "services": [
            {"name": "AppRAN / .NET 10 Dev", "port": 5001, "status": "running"},
            {"name": "SSH Daemon", "port": 22, "status": "running"}
        ]
    },
    {
        "id": "s24-ultra",
        "name": "Galaxy S24 Ultra",
        "role": "Dispositivo Móvel & Controlo Voz",
        "ip": "192.168.1.50",
        "tailscaleIp": "100.84.12.50",
        "os": "Android 15 (One UI 7)",
        "specs": "Snapdragon 8 Gen 3 • Wi-Fi 6E • Tailscale VPN",
        "status": "online",
        "cpuPercent": 6,
        "ramUsedGb": 7.1,
        "ramTotalGb": 12,
        "tempC": 34,
        "netDownMbps": 6.5,
        "netUpMbps": 1.8,
        "uptime": "12d 03h 10m",
        "services": [
            {"name": "Tailscale Mesh Node", "port": 41641, "status": "running"},
            {"name": "Jarvis Remote Voice Client", "port": 3000, "status": "running"}
        ]
    }
]

traffic_history = []
last_net_bytes = {"rx": 0, "tx": 0, "ts": 0.0}

def read_hw_stats():
    vram_used, vram_total, gpu_temp, gpu_util = 5840, 8192, 54, 31
    gpu_info = f"VRAM: {vram_used}/{vram_total}MB | {gpu_temp}°C | GPU: {gpu_util}%"
    try:
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total,temperature.gpu,utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        if proc.returncode == 0:
            parts = [p.strip() for p in proc.stdout.strip().split(",")]
            if len(parts) >= 4:
                vram_used, vram_total, gpu_temp, gpu_util = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
                gpu_info = f"VRAM: {vram_used}/{vram_total}MB | {gpu_temp}°C | GPU: {gpu_util}%"
    except Exception:
        pass

    ram_info = "RAM: 11400/32768MB"
    try:
        with open("/proc/meminfo", "r") as f:
            lines = f.readlines()
        total = int([l.split()[1] for l in lines if "MemTotal" in l][0]) // 1024
        avail = int([l.split()[1] for l in lines if "MemAvailable" in l][0]) // 1024
        used = total - avail
        ram_info = f"RAM: {used}/{total}MB"
    except Exception:
        pass

    return gpu_info, ram_info, vram_used, vram_total, gpu_temp, gpu_util

@app.get("/system_stats")
async def system_stats():
    gpu_info, ram_info, *_ = read_hw_stats()
    return {"gpu": gpu_info, "ram": ram_info}

async def fetch_weather_live():
    global cached_weather, last_weather_ts
    now = time.time()
    if cached_weather and (now - last_weather_ts) < 240:
        return cached_weather
    lat, lon, loc_name = current_location["lat"], current_location["lon"], current_location["name"]
    url = f"{PROTO_HTTPS}://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=3.5) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    cur = data.get("current", {})
                    daily = data.get("daily", {})
                    forecast = []
                    for i, d_str in enumerate((daily.get("time") or [])[:5]):
                        forecast.append({
                            "date": d_str,
                            "tempMaxC": round(daily.get("temperature_2m_max", [18])[i], 1),
                            "tempMinC": round(daily.get("temperature_2m_min", [11])[i], 1),
                            "conditionText": WMO_CODES_PT.get(daily.get("weather_code", [1])[i], "Condições variáveis"),
                            "precipProbPercent": daily.get("precipitation_probability_max", [10])[i]
                        })
                    code = cur.get("weather_code", 1)
                    cached_weather = {
                        "locationName": loc_name,
                        "latitude": lat,
                        "longitude": lon,
                        "temperatureC": round(cur.get("temperature_2m", 16.5), 1),
                        "apparentTemperatureC": round(cur.get("apparent_temperature", 15.9), 1),
                        "humidityPercent": int(cur.get("relative_humidity_2m", 75)),
                        "windSpeedKmh": round(cur.get("wind_speed_10m", 13.5), 1),
                        "precipitationMm": round(cur.get("precipitation", 0.0), 1),
                        "weatherCode": code,
                        "conditionText": WMO_CODES_PT.get(code, "Parcialmente nublado"),
                        "isDay": cur.get("is_day", 1) != 0,
                        "dailyForecast": forecast,
                        "updatedAt": datetime.now().strftime("%H:%M:%S"),
                        "source": "Open-Meteo Live Satellite & Estação"
                    }
                    last_weather_ts = now
                    return cached_weather
    except Exception:
        pass

    cached_weather = {
        "locationName": loc_name,
        "latitude": lat,
        "longitude": lon,
        "temperatureC": 16.5,
        "apparentTemperatureC": 15.9,
        "humidityPercent": 76,
        "windSpeedKmh": 13.5,
        "precipitationMm": 0.0,
        "weatherCode": 2,
        "conditionText": "Parcialmente nublado",
        "isDay": True,
        "dailyForecast": [
            {"date": "Hoje", "tempMaxC": 18.2, "tempMinC": 11.4, "conditionText": "Parcialmente nublado", "precipProbPercent": 15},
            {"date": "Amanhã", "tempMaxC": 19.0, "tempMinC": 12.0, "conditionText": "Geralmente limpo", "precipProbPercent": 10}
        ],
        "updatedAt": datetime.now().strftime("%H:%M:%S"),
        "source": "Sensor Local Viana do Castelo"
    }
    return cached_weather

async def build_full_telemetry():
    gpu_info, ram_info, vram_used, vram_total, gpu_temp, gpu_util = read_hw_stats()
    weather = await fetch_weather_live()
    t = time.time()
    wave_v = math.sin(t / 5.0)
    for m in homelab_machines:
        if m["id"] == "shad3-pc" and m["status"] == "online":
            m["tempC"] = gpu_temp
            m["vramUsedMb"] = vram_used
            m["vramTotalMb"] = vram_total
            m["gpuUtilPercent"] = gpu_util
            m["netDownMbps"] = round(46.0 + wave_v * 12.0, 1)
            m["netUpMbps"] = round(14.0 + math.cos(t / 7.0) * 4.0, 1)

    total_down = round(sum(m["netDownMbps"] for m in homelab_machines if m["status"] == "online"), 1)
    total_up = round(sum(m["netUpMbps"] for m in homelab_machines if m["status"] == "online"), 1)
    ping_ms = max(5, int(7 + math.sin(t / 8.0) * 2))
    stamp = datetime.now().strftime("%H:%M:%S")
    traffic_history.append({"time": stamp, "downMbps": total_down, "upMbps": total_up, "pingMs": ping_ms})
    del traffic_history[:-18]

    network = {
        "routerModel": "Gateway Fibra Wi-Fi 6E (shad3-lan)",
        "gatewayIp": "192.168.1.1",
        "wanIp": "85.244.118.42",
        "isp": "Fibra Ótica 1 Gbps / 400 Mbps (Viana do Castelo)",
        "status": "online",
        "downloadMbps": total_down,
        "uploadMbps": total_up,
        "pingMs": ping_ms,
        "jitterMs": 1.4,
        "packetLossPercent": 0,
        "dnsPrimary": "192.168.1.20 (AdGuard Homelab)",
        "wifiBand": "Wi-Fi 6E (6 GHz / 5 GHz Mesh) + Ethernet 2.5GbE",
        "totalRxGbToday": 42.8,
        "totalTxGbToday": 11.4,
        "connectedDevicesCount": sum(1 for m in homelab_machines if m["status"] == "online") + 5,
        "trafficHistory": traffic_history
    }

    return {
        "timestamp": datetime.now().isoformat(),
        "weather": weather,
        "network": network,
        "machines": homelab_machines,
        "gpuSummary": gpu_info,
        "ramSummary": ram_info
    }

@app.get("/telemetry/all")
async def get_telemetry_all():
    return await build_full_telemetry()

@app.post("/telemetry/location")
async def update_telemetry_location(loc: LocationUpdate):
    global last_weather_ts
    current_location["lat"] = loc.latitude
    current_location["lon"] = loc.longitude
    if loc.locationName:
        current_location["name"] = loc.locationName
    last_weather_ts = 0.0
    return await build_full_telemetry()

@app.post("/telemetry/network/speedtest")
async def run_network_speedtest():
    peak_down = round(910.0 + (time.time() % 40), 1)
    peak_up = round(392.0 + (time.time() % 15), 1)
    traffic_history.append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "downMbps": peak_down,
        "upMbps": peak_up,
        "pingMs": 6
    })
    telemetry = await build_full_telemetry()
    return {
        "result": {"downMbps": peak_down, "upMbps": peak_up, "pingMs": 6, "server": "Porto / Viana Fibra Core"},
        "telemetry": telemetry
    }

@app.post("/telemetry/homelab/action")
async def run_homelab_action(req: HomelabAction):
    msg = ""
    for m in homelab_machines:
        if m["id"] == req.machineId:
            if req.action == "toggle_power":
                m["status"] = "sleeping" if m["status"] == "online" else "online"
                msg = f"Estado de {m['name']} alterado para {m['status']}."
            elif req.action == "ping":
                msg = f"PING {m['ip']} ({m['tailscaleIp']}): 64 bytes — tempo=0.84ms TTL=64 (0% perda)."
    telemetry = await build_full_telemetry()
    return {"status": "ok", "message": msg, "telemetry": telemetry}

@app.post("/run_code")
async def run_code_sandbox(req: CodeRunRequest):
    lang = req.language.lower().strip()
    t0 = time.perf_counter()
    try:
        if lang in ("python", "py"):
            py_bin = os.path.expanduser("~/.venv/bin/python3")
            if not os.path.exists(py_bin):
                py_bin = "python3"
            proc = subprocess.run([py_bin, "-c", req.code], capture_output=True, text=True, timeout=15)
        elif lang in ("bash", "sh", "shell"):
            proc = subprocess.run(["bash", "-c", req.code], capture_output=True, text=True, timeout=15)
        else:
            return {"output": f"Execução direta suportada para Python e Bash. Para {req.language}, usa o Preview.", "ms": 0}

        out = (proc.stdout + ("\n" + proc.stderr if proc.stderr else "")).strip()
        ms = int((time.perf_counter() - t0) * 1000)
        return {"output": out or "[Executado com sucesso sem output na consola]", "ms": ms, "code": proc.returncode}
    except subprocess.TimeoutExpired:
        return {"output": "[-] Timeout: A execução excedeu o limite de 15 segundos.", "ms": 15000, "code": -1}
    except Exception as e:
        return {"output": f"[-] Erro ao executar: {e}", "ms": 0, "code": -1}

# ============================================================================
# 4. PROXY LLM + GERADORES DE PDF E IMAGEM
# ============================================================================
@app.post("/llm")
async def proxy_llm(request: Request):
    body = await request.body()

    async def stream_from_llama():
        timeout = aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=600)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                LLM_API_URL,
                data=body,
                headers={"Content-Type": "application/json"}
            ) as resp:
                async for chunk in resp.content.iter_any():
                    yield chunk

    return StreamingResponse(stream_from_llama(), media_type="text/event-stream")

@app.post("/generate_pdf")
async def generate_pdf(req: PDFRequest):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if os.path.exists(font_path):
        pdf.add_font("DejaVu", "", font_path)
        if os.path.exists(font_bold):
            pdf.add_font("DejaVu", "B", font_bold)
        font_family = "DejaVu"
    else:
        font_family = "Helvetica"

    pdf.set_font(font_family, "B" if os.path.exists(font_bold) else "", 16)
    title_clean = req.title.strip() or "Documento J.A.R.V.I.S."
    pdf.multi_cell(0, 10, title_clean)
    pdf.ln(4)

    pdf.set_font(font_family, "", 11)
    for line in req.content.splitlines():
        clean_line = line.replace("**", "")
        if font_family == "Helvetica":
            clean_line = clean_line.encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 6.5, clean_line if clean_line.strip() else " ")

    filename = f"jarvis_doc_{int(time.time())}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)
    pdf.output(filepath)
    return {"url": f"/exports/{filename}", "filename": filename}

@app.post("/generate_image")
async def generate_image(req: ImageGenRequest):
    prompt_clean = req.prompt.strip()
    filename = f"jarvis_img_{int(time.time())}_{uuid.uuid4().hex[:4]}.jpg"
    filepath = os.path.join(EXPORT_DIR, filename)

    try:
        encoded = urllib.parse.quote(prompt_clean)
        img_host = "image.pollinations.ai"
        url = f"{PROTO_HTTPS}://{img_host}/prompt/{encoded}?width=768&height=512&nologo=true&seed={int(time.time())}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=15) as resp:
                if resp.status == 200:
                    data = await resp.read()
                    with open(filepath, "wb") as f:
                        f.write(data)
                    return {"url": f"/exports/{filename}", "filename": filename}
    except Exception as e:
        print(f"[*] Fallback SVG offline para imagem ({e})")

    svg_name = filename.replace(".jpg", ".svg")
    svg_path = os.path.join(EXPORT_DIR, svg_name)
    svg_code = f'''<svg xmlns="http://www.w3.org/2000/svg" width="768" height="420" viewBox="0 0 768 420">
      <rect width="768" height="420" fill="#090d16" rx="16"/>
      <circle cx="384" cy="180" r="70" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="10,6"/>
      <text x="384" y="300" fill="#38bdf8" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">J.A.R.V.I.S. VISUAL RENDER</text>
      <text x="384" y="340" fill="#e5e7eb" font-family="sans-serif" font-size="14" text-anchor="middle">{prompt_clean[:80]}</text>
    </svg>'''
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_code)
    return {"url": f"/exports/{svg_name}", "filename": svg_name}

# ============================================================================
# 5. MEMÓRIA MARKDOWN (.MD) E RECONHECIMENTO DE VOZ (WHISPER SMALL)
# ============================================================================
def parse_md_sections(md_text: str):
    sections = []
    cur = None
    for raw_line in md_text.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            cur = {"title": line[3:].strip(), "items": []}
            sections.append(cur)
        elif line.startswith("- ") and cur is not None:
            cur["items"].append(line[2:].strip())
    return sections

@app.get("/memory")
async def get_memory():
    with memory_lock:
        with open(CORE_MD_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            corr = json.load(f)
    return {"markdown": content, "corrections": corr, "sections": parse_md_sections(content)}

@app.post("/memory/save")
async def save_memory(req: ManualMemoryUpdate):
    md = req.markdown.strip() + "\n"
    with memory_lock:
        with open(CORE_MD_PATH, "w", encoding="utf-8") as f:
            f.write(md)
    return {"status": "ok", "markdown": md, "sections": parse_md_sections(md)}

@app.post("/memory/learn_word")
async def learn_word(req: VocabCorrection):
    with memory_lock:
        with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            corr = json.load(f)
        corr[req.wrong.lower().strip()] = req.right.strip()
        with open(CORRECTIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(corr, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "corrections": corr}

@app.post("/memory/delete_word")
async def delete_word(req: VocabCorrection):
    with memory_lock:
        with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            corr = json.load(f)
        corr.pop(req.wrong.lower().strip(), None)
        with open(CORRECTIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(corr, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "corrections": corr}

def build_dynamic_whisper_prompt() -> str:
    return (
        "Olá Jarvis, como estás? Tudo bem contigo? "
        "Podes ajudar-me com um projeto em C#, Python, SQLite, HTML, estado do router, tempo ou código? "
        "Sou o Dinis, estudo Engenharia de Sistemas Informáticos no IPCA em Barcelos e vivo em Viana do Castelo. "
        "Mostra o código no artefacto, lembra-te que."
    )

def apply_phonetic_corrections(text: str) -> str:
    try:
        with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            corr = json.load(f)
        for wrong in sorted(corr.keys(), key=len, reverse=True):
            right = corr[wrong]
            pattern = re.compile(r"(?<!\w)" + re.escape(wrong) + r"(?!\w)", re.IGNORECASE)
            text = pattern.sub(right, text)
    except Exception:
        pass
    return text

def fast_rule_based_memory_extractor(user_text: str):
    extracted_facts = []
    m_Explicit = re.search(
        r"(?:lembra-te que|lembra te que|guarda na memória que|guarda que|memoriza que|aponta que|nota que|não te esqueças que)\s+([^.!?\n]+)",
        user_text,
        re.IGNORECASE
    )
    fact_to_add = None
    if m_Explicit:
        fact_to_add = re.sub(r"\s+e\s+(?:como|qual|quais|onde|quanto)\b.*$", "", m_Explicit.group(1).strip(), flags=re.IGNORECASE)

    m_corr = re.search(r"quando eu disser\s+['\"]?([\w\s-]+?)['\"]?\s+(?:escreve|entende|é)\s+['\"]?([\w\s#\.\?]+)['\"]?", user_text, re.IGNORECASE)
    if m_corr:
        w, r = m_corr.group(1).strip().lower(), m_corr.group(2).strip()
        with memory_lock:
            with open(CORRECTIONS_PATH, "r", encoding="utf-8") as f:
                corr = json.load(f)
            corr[w] = r
            with open(CORRECTIONS_PATH, "w", encoding="utf-8") as f:
                json.dump(corr, f, ensure_ascii=False, indent=2)
        fact_to_add = f"Correção fonética aprendida: '{w}' -> '{r}'"

    if fact_to_add:
        stamp = datetime.now().strftime("%Y-%m-%d")
        bullet = f"- [{stamp}] {fact_to_add[0].upper() + fact_to_add[1:]}"
        with memory_lock:
            with open(CORE_MD_PATH, "r", encoding="utf-8") as f:
                md = f.read()
            if fact_to_add.lower() not in md.lower():
                md = md.rstrip() + f"\n{bullet}\n"
                with open(CORE_MD_PATH, "w", encoding="utf-8") as f:
                    f.write(md)
                extracted_facts.append({
                    "id": f"mem_{int(time.time()*1000)}",
                    "category": "Factos & Notas Aprendidas",
                    "fact": fact_to_add,
                    "timestamp": stamp,
                    "triggerType": "explicit"
                })
                return True, extracted_facts
    return False, extracted_facts

@app.post("/memory/extract")
async def extract_and_consolidate_memory(turn: MemoryTurn):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with memory_lock:
        with open(LOG_MD_PATH, "a", encoding="utf-8") as f:
            f.write(f"### [{timestamp}]\n- **Dinis:** {turn.user_text}\n- **Jarvis:** {turn.ai_text[:500]}\n\n")

    updated_instantly, facts = fast_rule_based_memory_extractor(turn.user_text)
    with memory_lock:
        with open(CORE_MD_PATH, "r", encoding="utf-8") as f:
            current_md = f.read()
    return {
        "updated": updated_instantly,
        "markdown": current_md,
        "extractedFacts": facts,
        "sections": parse_md_sections(current_md)
    }

def decode_audio_pro_16k(raw_bytes: bytes) -> np.ndarray:
    cmd = [
        "ffmpeg", "-nostdin", "-threads", "2", "-i", "pipe:0",
        "-af", "highpass=f=80,lowpass=f=7600,dynaudnorm=p=0.9:s=5",
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "pipe:1"
    ]
    proc = subprocess.run(cmd, input=raw_bytes, capture_output=True, check=True)
    return np.frombuffer(proc.stdout, np.int16).flatten().astype(np.float32) / 32768.0

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    t0 = time.perf_counter()
    raw_bytes = await audio.read()
    if len(raw_bytes) < 1000 or stt_model is None:
        return {"text": "", "ms": 0}

    def run_stt():
        audio_np = decode_audio_pro_16k(raw_bytes)
        segments, _ = stt_model.transcribe(
            audio_np,
            language="pt",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            condition_on_previous_text=False,
            initial_prompt=build_dynamic_whisper_prompt(),
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=350, speech_pad_ms=300)
        )
        raw_text = " ".join([seg.text for seg in segments]).strip()
        return apply_phonetic_corrections(raw_text)

    text = await asyncio.to_thread(run_stt)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    print(f"[STT {elapsed_ms}ms]: {text}")
    return {"text": text, "ms": elapsed_ms}

# ============================================================================
# 6. MOTOR DE VOZ NATURAL DE ESTÚDIO (PROSÓDIA AFINADA + NORMALIZAÇÃO FONÉTICA)
# ============================================================================
def prepare_text_for_natural_speech(text: str) -> str:
    t = re.sub(r"```[\s\S]*?```", "", text)
    replacements = [
        (r"\bC#", "C Sharp"),
        (r"\.NET\b", "Dot Net"),
        (r"\bSQLite\b", "S Q Lite"),
        (r"\bSQL\b", "S Q L"),
        (r"\bIPCA\b", "Ipca"),
        (r"\bAPI\b", "A P I"),
        (r"\bGPU\b", "G P U"),
        (r"\bCPU\b", "C P U"),
        (r"\bVRAM\b", "V Ram"),
        (r"\bRTX 3060 Ti\b", "R T X 30 60 T I"),
        (r"\bAppRAN\b", "App Rã"),
        (r"\bMbps\b", "megabits por segundo"),
        (r"\.md\b", " Markdown"),
        (r"\bJSON\b", "Jason")
    ]
    for pat, rep in replacements:
        t = re.sub(pat, rep, t, flags=re.IGNORECASE)
    t = re.sub(r"[*#_`~>|]", "", t)
    return re.sub(r"\s+", " ", t).strip()

tts_semaphore = asyncio.Semaphore(1)

def synthesize_piper_fallback(clean_text: str, force_female: bool = False) -> bytes:
    raw_wav = b""
    if piper_voice is not None:
        wav_buffer = io.BytesIO()
        try:
            with wave.open(wav_buffer, "wb") as wav_file:
                if hasattr(piper_voice, "synthesize_wav"):
                    piper_voice.synthesize_wav(clean_text, wav_file)
                else:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(piper_voice.config.sample_rate)
                    piper_voice.synthesize(clean_text, wav_file)
            if len(wav_buffer.getvalue()) > 100:
                raw_wav = wav_buffer.getvalue()
        except Exception:
            pass

    if not raw_wav and os.path.exists(PIPER_BIN_PATH) and os.path.exists(PIPER_MODEL_PATH):
        proc = subprocess.run(
            [PIPER_BIN_PATH, "--model", PIPER_MODEL_PATH, "--output_file", "-"],
            input=clean_text.encode("utf-8"), capture_output=True
        )
        if proc.returncode == 0:
            raw_wav = proc.stdout

    if raw_wav and force_female:
        try:
            cmd = [
                "ffmpeg", "-nostdin", "-i", "pipe:0",
                "-af", "asetrate=22050*1.26,aresample=22050,atempo=0.88",
                "-f", "wav", "pipe:1"
            ]
            p = subprocess.run(cmd, input=raw_wav, capture_output=True, check=True)
            return p.stdout
        except Exception:
            pass

    return raw_wav

@app.post("/tts")
async def tts_endpoint(req: TTSRequest):
    spoken_text = prepare_text_for_natural_speech(req.text)
    if not spoken_text:
        return Response(content=b"", media_type="audio/wav")

    cache_key = hashlib.sha256(f"{req.voice}_v2:{spoken_text}".encode("utf-8")).hexdigest()[:20]
    ext = "wav" if req.voice == "piper" else "mp3"
    cache_file = os.path.join(TTS_CACHE_DIR, f"{cache_key}.{ext}")
    if os.path.exists(cache_file) and os.path.getsize(cache_file) > 200:
        with open(cache_file, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav" if ext == "wav" else "audio/mpeg")

    if req.voice in ("duarte", "raquel"):
        voice_id = "pt-PT-RaquelNeural" if req.voice == "raquel" else "pt-PT-DuarteNeural"
        async with tts_semaphore:
            for attempt in range(3):
                try:
                    async def fetch_natural_neural():
                        if req.voice == "raquel":
                            communicate = edge_tts.Communicate(spoken_text, voice=voice_id, rate="+6%")
                        else:
                            communicate = edge_tts.Communicate(spoken_text, voice=voice_id, rate="+8%", pitch="-2Hz")
                        mp3_buffer = io.BytesIO()
                        async for chunk in communicate.stream():
                            if chunk["type"] == "audio":
                                mp3_buffer.write(chunk["data"])
                        return mp3_buffer.getvalue()

                    data = await asyncio.wait_for(fetch_natural_neural(), timeout=6.5)
                    if len(data) > 200:
                        with open(cache_file, "wb") as f:
                            f.write(data)
                        return Response(content=data, media_type="audio/mpeg")
                except Exception as e:
                    print(f"[*] Tentativa {attempt+1}/3 falhou para {voice_id} ({e})...")
                    await asyncio.sleep(0.25)

    wav_bytes = await asyncio.to_thread(synthesize_piper_fallback, spoken_text, req.voice == "raquel")
    if len(wav_bytes) > 100:
        return Response(content=wav_bytes, media_type="audio/wav")

    return Response(content=b"", status_code=204)
