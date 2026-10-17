-- ==============================================================================
-- AegisLedger - PostgreSQL WORM Security Rules & CDC Configuration
-- ==============================================================================

-- 1. Cấu hình REPLICA IDENTITY FULL để CDC (tamper-watcher) nhận đủ giá trị cũ và mới của hàng khi can thiệp
ALTER TABLE IF EXISTS "audit_logs" REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS "epoch_blocks" REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS "external_anchors" REPLICA IDENTITY FULL;

-- 2. WORM Rule cho bảng "audit_logs" (Nghiêm cấm tuyệt đối UPDATE và DELETE)
CREATE OR REPLACE FUNCTION fn_enforce_audit_logs_worm()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Table "audit_logs" is strictly Append-Only. Operation "%" is forbidden by AegisLedger security kernel.', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_worm_guard ON "audit_logs";
CREATE TRIGGER trg_audit_logs_worm_guard
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_audit_logs_worm();

-- 3. WORM Rule cho bảng "epoch_blocks" (Cấm DELETE, cấm sửa đổi các trường mật mã học)
CREATE OR REPLACE FUNCTION fn_enforce_epoch_blocks_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Deleting records from "epoch_blocks" is strictly forbidden.'
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Cho phép cập nhật trạng thái neo (anchored, anchor_tx_hash)
        -- Nhưng nghiêm cấm sửa bất kỳ thuộc tính mật mã nào
        IF OLD.epoch_number <> NEW.epoch_number OR
           OLD.merkle_root <> NEW.merkle_root OR
           OLD.previous_epoch_root <> NEW.previous_epoch_root OR
           OLD.signature <> NEW.signature OR
           OLD.signer_public_key <> NEW.signer_public_key OR
           OLD.start_sequence <> NEW.start_sequence OR
           OLD.end_sequence <> NEW.end_sequence OR
           OLD.total_logs <> NEW.total_logs THEN
            RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Modifying cryptographic properties of an epoch block is strictly forbidden.'
            USING ERRCODE = '55000';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_epoch_blocks_immutability ON "epoch_blocks";
CREATE TRIGGER trg_epoch_blocks_immutability
BEFORE UPDATE OR DELETE ON "epoch_blocks"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_epoch_blocks_immutability();

-- 4. WORM Rule cho bảng "external_anchors" (Nghiêm cấm tuyệt đối UPDATE và DELETE biên lai neo)
CREATE OR REPLACE FUNCTION fn_enforce_external_anchors_worm()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Table "external_anchors" is strictly Append-Only. Operation "%" is forbidden by AegisLedger security kernel.', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_anchors_worm_guard ON "external_anchors";
CREATE TRIGGER trg_external_anchors_worm_guard
BEFORE UPDATE OR DELETE ON "external_anchors"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_external_anchors_worm();
