#!/bin/bash

# Configuration
PORT1=3000
PORT2=3001
LOG_FILE="vite.log"
PID_FILE=".vite.pid"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

show_logo() {
    clear
    echo -e "${CYAN}"
    echo " █████╗ ███╗   ██╗████████╗██╗ ██████╗ ██████╗  █████╗ ██╗   ██╗██╗████████╗██╗   ██╗"
    echo "██╔══██╗████╗  ██║╚══██╔══╝██║██╔════╝ ██╔══██╗██╔══██╗██║   ██║██║╚══██╔══╝╚██╗ ██╔╝"
    echo "███████║██╔██╗ ██║   ██║   ██║██║  ███╗██████╔╝███████║██║   ██║██║   ██║    ╚████╔╝ "
    echo "██╔══██║██║╚██╗██║   ██║   ██║██║   ██║██╔══██╗██╔══██║╚██╗ ██╔╝██║   ██║     ╚██╔╝  "
    echo "██║  ██║██║ ╚████║   ██║   ██║╚██████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║   ██║      ██║   "
    echo "╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝   ╚═╝      ╚═╝   "
    echo -e "${BLUE}                    --- MUSIC VISUALIZER MANAGER ---${NC}"
    echo ""
}

cleanup_ports() {
    echo -e "${YELLOW}Portlar kontrol ediliyor ($PORT1, $PORT2)...${NC}"
    for port in $PORT1 $PORT2; do
        PID=$(lsof -t -i:$port)
        if [ ! -z "$PID" ]; then
            echo -e "${RED}Port $port üzerinde çalışan işlem ($PID) sonlandırılıyor...${NC}"
            kill -9 $PID 2>/dev/null
        fi
    done
}

start_app() {
    cleanup_ports
    echo -e "${GREEN}Vite sunucusu başlatılıyor...${NC}"
    # Install if missing
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Bağımlılıklar eksik, npm install yapılıyor...${NC}"
        npm install
    fi
    
    # Run in background and save PID
    # We use nohup to keep it running and redirect output to log
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    
    echo -e "${GREEN}Uygulama arka planda başlatıldı!${NC}"
    echo -e "${BLUE}Logları '4' numarasını tuşlayarak takip edebilirsiniz.${NC}"
    sleep 2
}

stop_app() {
    echo -e "${RED}Uygulama durduruluyor...${NC}"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        kill $PID 2>/dev/null
        rm "$PID_FILE"
    fi
    cleanup_ports
    echo -e "${GREEN}Durduruldu.${NC}"
    sleep 1
}

show_log() {
    echo -e "${BLUE}Loglar takip ediliyor (Çıkmak için Ctrl+C)...${NC}"
    tail -f "$LOG_FILE"
}

# Main Loop
while true; do
    show_logo
    echo -e "${GREEN}1)${NC} Start Application"
    echo -e "${RED}2)${NC} Stop Application"
    echo -e "${YELLOW}3)${NC} Restart Application"
    echo -e "${BLUE}4)${NC} View Logs"
    echo -e "${RED}5)${NC} Quit (Kill All)"
    echo ""
    read -p "Seçiminiz [1-5]: " choice

    case $choice in
        1)
            start_app
            ;;
        2)
            stop_app
            ;;
        3)
            stop_app
            start_app
            ;;
        4)
            show_log
            ;;
        5)
            stop_app
            echo -e "${YELLOW}Güle güle!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Geçersiz seçim!${NC}"
            sleep 1
            ;;
    esac
done
