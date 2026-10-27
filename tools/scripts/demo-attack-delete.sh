#!/usr/bin/env bash
# ==============================================================================
# AEGIS LEDGER - ATTACK DEMO 2: LOG RECORD DELETION (ATTACK ON IMMUTABILITY)
# Kịch bản: Kẻ tấn công cố tình xóa một dòng lịch sử giao dịch (Sequence #4)
# để phi tang chứng cứ giao dịch gian lận.
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
echo -e "${BOLD}${RED} 🚨 DEMO ATTACK #2: CỐ TÌNH XÓA BẢN GHI ĐỂ PHI TANG (UNAUTHORIZED DELETE)        ${NC}"
echo -e "${BOLD}${RED}================================================================================${NC}\n"

echo -e "${CYAN}📌 Mục tiêu kịch bản:${NC}"
echo -e "   1. Hacker cố tình xóa Sequence #4 khỏi cơ sở dữ liệu để xóa dấu vết chuyển tiền."
echo -e "   2. CDC Logical Replication bắt được sự kiện DELETE (vi phạm WORM append-only policy)."
echo -e "   3. Kiểm toán viên chạy 'audit-cli verify' -> Lập tức phát hiện SEQUENCE GAP và LOG COUNT MISMATCH."
echo -e "   4. Cây Merkle không thể tái dựng được với số lượng lá bị thiếu hụt.\n"

echo -e "${YELLOW}--- [BƯỚC 1]: DỮ LIỆU BAN ĐẦU (SEQUENCE #4 ĐANG TỒN TẠI) ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT sequence, epoch_number, action, payload FROM audit_logs WHERE sequence = 4;"

echo -e "\n${YELLOW}--- [BƯỚC 2]: HACKER THỰC HIỆN LỆNH XÓA SEQUENCE #4 ---${NC}"
echo -e "${PURPLE}Bypass trigger và xóa bản ghi Sequence #4...${NC}"

docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db <<EOF
ALTER TABLE audit_logs DISABLE TRIGGER USER;
DELETE FROM audit_logs WHERE sequence = 4;
ALTER TABLE audit_logs ENABLE TRIGGER USER;
EOF

echo -e "${GREEN}  -> Lệnh DELETE đã thực thi trên PostgreSQL.${NC}"

echo -e "\n${YELLOW}--- [BƯỚC 3]: KIỂM TRA TRẠNG THÁI SEQUENCE TRÊN DATABASE ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT sequence, epoch_number, action FROM audit_logs WHERE sequence IN (3, 4, 5) ORDER BY sequence ASC;"

echo -e "\n${YELLOW}--- [BƯỚC 4]: KÍCH HOẠT PHẢN ỨNG TỰ VỆ ACTIVE DEFENSE TRÊN REDIS ---${NC}"
docker exec -i aegis_redis redis-cli -a aegis_redis_pass_2026 set AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS "true" >/dev/null 2>&1
echo -e "${BOLD}${RED}  🚨 [ACTIVE DEFENSE ENGAGED] Đã kích hoạt cờ đỏ khóa cổng rút tiền trên Redis!${NC}"

echo -e "\n${YELLOW}--- [BƯỚC 5]: CHẠY CÔNG CỤ KIỂM TOÁN ZERO-TRUST ĐỘC LẬP (AUDIT-CLI) ---${NC}"
echo -e "${CYAN}Chạy 'npm run audit-cli -- verify' phát hiện gãy chuỗi sequence...${NC}\n"

npm run audit-cli -- verify || true

echo -e "\n${BOLD}${GREEN}================================================================================${NC}"
echo -e "${BOLD}${GREEN} 🛡️ KẾT THÚC DEMO ATTACK #2: HÀNH VI XÓA DỮ LIỆU BỊ BẮT QUẢ TANG DO GÃY SEQUENCE!${NC}"
echo -e "${BOLD}${GREEN}================================================================================${NC}\n"
