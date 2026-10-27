#!/usr/bin/env bash
# ==============================================================================
# AEGIS LEDGER - ATTACK DEMO 3: STATE-LEVEL HISTORICAL REWRITE ATTACK
# Kịch bản: Kẻ tấn công tinh vi (State-Level / Rogue Admin) sửa đổi log
# VÀ cố tình ghi đè Merkle Root trong Epoch #0 để hợp thức hóa dữ liệu nội bộ.
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "\n${BOLD}${RED}================================================================================${NC}"
echo -e "${BOLD}${RED} 🚨 DEMO ATTACK #3: TẤN CÔNG TÁI VIẾT LỊCH SỬ (HISTORICAL REWRITE & ROOT FORGERY)${NC}"
echo -e "${BOLD}${RED}================================================================================${NC}\n"

echo -e "${CYAN}📌 Mục tiêu kịch bản:${NC}"
echo -e "   1. Hacker tinh vi cho rằng nếu chỉ sửa log thì Merkle Tree sẽ phát hiện."
echo -e "      Do đó, Hacker sửa luôn cả giá trị 'merkle_root' trong bảng 'epoch_blocks'."
echo -e "   2. Hacker tưởng rằng đã qua mặt được hệ thống kiểm tra nội bộ."
echo -e "   3. Tuy nhiên, kiến trúc 4 lớp phòng vệ của AegisLedger lập tức vạch trần:"
echo -e "      - LỚP 1: Chữ ký số Ed25519 của Validator bị sai lệch (SIGNATURE FORGERY)."
echo -e "      - LỚP 2: Khối Epoch #1 kế tiếp bị gãy chuỗi (HASH CHAIN BROKEN) vì previousEpochRoot không khớp."
echo -e "      - LỚP 3: Mốc neo kiểm toán ngoại vi Ethereum / RFC3161 TSA tố cáo sự sai khác (ANCHOR MISMATCH)!\n"

# Đảm bảo tamper-watcher đang chạy để bắt CDC và bắn Telegram
if ! curl -s http://localhost:4002/health > /dev/null 2>&1; then
  echo -e "${CYAN}🚀 Khởi động Tamper Watcher service (Fastify) chạy ngầm để lắng nghe CDC...${NC}"
  npx ts-node -r tsconfig-paths/register apps/tamper-watcher/src/main.ts > /dev/null 2>&1 &
  sleep 3
fi

echo -e "${YELLOW}--- [BƯỚC 1]: DỮ LIỆU EPOCH #0 VÀ EPOCH #1 NGUYÊN BẢN ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT epoch_number, merkle_root, previous_epoch_root, signature FROM epoch_blocks ORDER BY epoch_number ASC;"

echo -e "\n${YELLOW}--- [BƯỚC 2]: HACKER GHI ĐÈ MERKLE ROOT CỦA EPOCH #0 BẰNG ROOT GIẢ MẠO ---${NC}"
FAKE_ROOT="baadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaadbaad"
echo -e "${PURPLE}Bypass trigger và cập nhật merkle_root = ${FAKE_ROOT}...${NC}"

docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db <<EOF
ALTER TABLE epoch_blocks DISABLE TRIGGER USER;
UPDATE epoch_blocks 
SET merkle_root = '${FAKE_ROOT}' 
WHERE epoch_number = 0;
ALTER TABLE epoch_blocks ENABLE TRIGGER USER;
EOF

echo -e "${GREEN}  -> Lệnh giả mạo Merkle Root đã thực thi trên PostgreSQL.${NC}"

echo -e "\n${YELLOW}--- [BƯỚC 3]: DỮ LIỆU EPOCH BLOCK SAU KHI BỊ GIẢ MẠO ROOT ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT epoch_number, merkle_root, previous_epoch_root FROM epoch_blocks ORDER BY epoch_number ASC;"

echo -e "\n${YELLOW}--- [BƯỚC 4]: KÍCH HOẠT PHÒNG THỦ ACTIVE DEFENSE TRÊN REDIS ---${NC}"
docker exec -i aegis_redis redis-cli -a aegis_redis_pass_2026 set AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS "true" >/dev/null 2>&1
echo -e "${BOLD}${RED}  🚨 [ACTIVE DEFENSE ENGAGED] Đã kích hoạt cờ đỏ khóa cổng rút tiền trên Redis!${NC}"

echo -e "\n${YELLOW}--- [BƯỚC 5]: CHẠY CÔNG CỤ KIỂM TOÁN MẬT MÃ HỌC ĐỘC LẬP (AUDIT-CLI) ---${NC}"
echo -e "${CYAN}Chạy 'npm run audit-cli -- verify' phát hiện 3 lớp phòng vệ sụp đổ...${NC}\n"

npm run audit-cli -- verify || true

echo -e "\n${BOLD}${GREEN}================================================================================${NC}"
echo -e "${BOLD}${GREEN} 🛡️ KẾT THÚC DEMO ATTACK #3: HACKER KHÔNG THỂ QUA MẶT CHỮ KÝ SỐ VÀ BLOCKCHAIN ANCHOR!${NC}"
echo -e "${BOLD}${GREEN}================================================================================${NC}\n"
