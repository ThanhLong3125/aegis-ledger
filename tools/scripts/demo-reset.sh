#!/usr/bin/env bash
# ==============================================================================
# AEGIS LEDGER - DEMO RESET & RECOVERY SCRIPT
# Khôi phục trạng thái nguyên vẹn hoàn toàn của hệ thống sổ cái sau các cuộc demo
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "\n${BOLD}${CYAN}================================================================================${NC}"
echo -e "${BOLD}${CYAN} 🔄 KHÔI PHỤC VÀ TÁI TẠO CƠ SỞ DỮ LIỆU SỔ CÁI HOÀN TOÀN HỢP LỆ                 ${NC}"
echo -e "${BOLD}${CYAN}================================================================================${NC}\n"

# 1. Chạy script seed dữ liệu mẫu hợp lệ
npx ts-node -r tsconfig-paths/register tools/scripts/seed-demo-data.ts

# 2. Chạy audit-cli để khẳng định tính toàn vẹn 100%
echo -e "\n${CYAN}Kiểm tra lại tính toàn vẹn hệ thống bằng audit-cli...${NC}\n"
npm run audit-cli -- verify

echo -e "\n${BOLD}${GREEN}================================================================================${NC}"
echo -e "${BOLD}${GREEN} ✅ HỆ THỐNG ĐÃ TRỞ LẠI TRẠNG THÁI AN TOÀN, SẴN SÀNG CHO PHIÊN DEMO TIẾP THEO!  ${NC}"
echo -e "${BOLD}${GREEN}================================================================================${NC}\n"
