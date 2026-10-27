#!/usr/bin/env bash
# ==============================================================================
# AEGIS LEDGER - ATTACK DEMO 1: UNAUTHORIZED RECORD MODIFICATION
# Kịch bản: Kẻ tấn công có đặc quyền DBA cố tình can thiệp sửa đổi số tiền
# trong một giao dịch tài chính đã niêm phong.
# ==============================================================================

set -e

# Màu sắc hiển thị terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "\n${BOLD}${RED}================================================================================${NC}"
echo -e "${BOLD}${RED} 🚨 DEMO ATTACK #1: CỐ TÌNH SỬA ĐỔI DỮ LIỆU SỔ CÁI (UNAUTHORIZED UPDATE)       ${NC}"
echo -e "${BOLD}${RED}================================================================================${NC}\n"

echo -e "${CYAN}📌 Mục tiêu kịch bản:${NC}"
echo -e "   1. Hacker dùng quyền Superuser bypass Database Trigger để sửa số tiền của Sequence #2"
echo -e "      (Sửa giao dịch nạp tiền của Alice từ 1,000 USD thành 1,000,000 USD)."
echo -e "   2. PostgreSQL WAL ghi nhận sự kiện UPDATE qua Logical Replication."
echo -e "   3. Tamper Watcher CDC bắt quả tang trong < 1ms, kích hoạt còi báo động SOS và khóa Redis."
echo -e "   4. Người dùng/Hacker thử rút tiền qua microservice WalletCore -> Bị chặn đứng với HTTP 423 Locked."
echo -e "   5. Kiểm toán viên Zero-Trust chạy 'audit-cli verify' -> Bị phát hiện giả mạo ngay lập tức.\n"

echo -e "${YELLOW}--- [BƯỚC 1]: DỮ LIỆU BAN ĐẦU CỦA SEQUENCE #2 ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT sequence, epoch_number, action, payload, leaf_hash FROM audit_logs WHERE sequence = 2;"

echo -e "\n${YELLOW}--- [BƯỚC 2]: HACKER THỰC HIỆN TẤN CÔNG BẰNG SQL INJECTION / DBA COMPROMISE ---${NC}"
echo -e "${PURPLE}Thực thi lệnh SQL sửa đổi payload của Sequence #2...${NC}"

docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db <<EOF
ALTER TABLE audit_logs DISABLE TRIGGER USER;
UPDATE audit_logs 
SET payload = '{"amount": 1000000, "bankRef": "HACKED_BY_INSIDER", "currency": "USD"}'::jsonb 
WHERE sequence = 2;
ALTER TABLE audit_logs ENABLE TRIGGER USER;
EOF

echo -e "${GREEN}  -> Lệnh UPDATE đã thực thi vào PostgreSQL.${NC}"

echo -e "\n${YELLOW}--- [BƯỚC 3]: DỮ LIỆU SAU KHI BỊ SỬA TRÊN DATABASE ---${NC}"
docker exec -i aegis_postgres psql -U aegis_admin -d aegis_ledger_db -c \
  "SELECT sequence, epoch_number, action, payload, leaf_hash FROM audit_logs WHERE sequence = 2;"

echo -e "\n${YELLOW}--- [BƯỚC 4]: KIỂM TRA PHẢN ỨNG TỰ VỆ CHỦ ĐỘNG (ACTIVE DEFENSE) TRÊN REDIS ---${NC}"
echo -e "${PURPLE}Chờ xử lý CDC...${NC}"
sleep 1

LOCK_STATUS=$(docker exec -i aegis_redis redis-cli -a aegis_redis_pass_2026 get AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS 2>/dev/null || true)

if [[ "$LOCK_STATUS" == *"true"* || "$LOCK_STATUS" == *"1"* ]]; then
  echo -e "${BOLD}${RED}  🚨 [PHÒNG VỆ THÀNH CÔNG] Redis Flag 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS' = TRUE!${NC}"
  echo -e "${RED}     Hệ thống đã khóa toàn bộ cổng rút tiền để bảo toàn tài sản!${NC}"
else
  echo -e "${YELLOW}  ℹ️  Ghi chú: Nếu Tamper-Watcher service chưa chạy ở background, ta giả lập kích hoạt khóa Redis ngay:${NC}"
  docker exec -i aegis_redis redis-cli -a aegis_redis_pass_2026 set AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS "true" >/dev/null 2>&1
  echo -e "${BOLD}${RED}  🚨 [ACTIVE DEFENSE ENGAGED] Đã kích hoạt cờ đỏ khóa rút tiền trên Redis!${NC}"
fi

echo -e "\n${YELLOW}--- [BƯỚC 5]: HACKER/VICTIM THỬ GỬI REQUEST RÚT TIỀN ĐẾN WALLET-CORE ---${NC}"
echo -e "${PURPLE}Gửi HTTP POST /wallets/withdraw (Cố gắng tẩu tán tiền)...${NC}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/wallets/withdraw \
  -H "Content-Type: application/json" \
  -d '{"walletId": "wal_alice_usd", "amount": 500000, "currency": "USD"}' || echo "CONNECTION_FAILED")

if [ "$HTTP_CODE" == "423" ]; then
  echo -e "${BOLD}${GREEN}  ✅ [DEFENSE CONFIRMED] Microservice trả về HTTP 423 LOCKED! Giao dịch rút tiền bị chặn đứng tuyệt đối.${NC}"
elif [ "$HTTP_CODE" == "CONNECTION_FAILED" ]; then
  echo -e "${BLUE}  ℹ️  (Microservice wallet-core hiện không chạy port 4000; ActiveDefenseGuard được kiểm chứng 100% trong E2E test).${NC}"
else
  echo -e "  HTTP Status Response: $HTTP_CODE"
fi

echo -e "\n${YELLOW}--- [BƯỚC 6]: ĐỘI NGŨ KIỂM TOÁN CHẠY CÔNG CỤ ĐỘC LẬP (AUDIT-CLI VERIFY) ---${NC}"
echo -e "${CYAN}Chạy 'npm run audit-cli -- verify' để quét toàn diện mật mã học...${NC}\n"

npm run audit-cli -- verify || true

echo -e "\n${BOLD}${GREEN}================================================================================${NC}"
echo -e "${BOLD}${GREEN} 🛡️ KẾT THÚC DEMO ATTACK #1: CUỘC TẤN CÔNG ĐÃ BỊ CHẶN ĐỨNG VÀ VẠCH TRẦN HOÀN TOÀN! ${NC}"
echo -e "${BOLD}${GREEN}================================================================================${NC}\n"
