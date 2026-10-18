/**
 * Danh sách các Topics tiêu chuẩn trong hệ thống AegisLedger
 */
export const TOPIC_AUDIT_EVENTS = 'aegis.audit.events';
export const TOPIC_TAMPER_ALERTS = 'aegis.tamper.alerts';
export const TOPIC_EPOCH_COMMITTED = 'aegis.epoch.committed';
export const TOPIC_AUDIT_EVENTS_DLQ = 'aegis.audit.events.dlq';

/**
 * Hàm sinh tên topic Dead Letter Queue mặc định
 */
export function getDlqTopicName(originalTopic: string): string {
  return `${originalTopic}.dlq`;
}
