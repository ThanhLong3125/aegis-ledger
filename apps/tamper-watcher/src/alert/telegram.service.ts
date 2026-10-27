import { Injectable, Logger } from '@nestjs/common';
import { TamperAlertDto } from '@aegis/contracts';
import { WatcherConfigService } from '../config/watcher-config.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly config: WatcherConfigService) {}

  /**
   * Phát tin nhắn cảnh báo đỏ tới Telegram Bot
   * Tự động chuyển đổi sang Console Fallback Mode nếu chưa cấu hình Token/ChatId
   */
  async sendTamperAlert(
    alert: TamperAlertDto
  ): Promise<{ sent: boolean; simulated: boolean; error?: string }> {
    const token = this.config.telegramBotToken;
    const chatId = this.config.telegramChatId;

    const messageHtml = this.formatAlertMessage(alert);

    // 1. Chế độ Fallback mô phỏng nếu chưa cung cấp thông tin Telegram
    if (!token || !chatId) {
      this.logger.warn(
        '⚠️ Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Kích hoạt [Console Fallback Mode]:'
      );
      this.logger.error(`\n${this.formatConsoleAlert(alert)}\n`);
      return { sent: false, simulated: true };
    }

    // 2. Chế độ gửi thật qua Telegram Bot API
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageHtml,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Telegram API Error: ${response.status} - ${errorText}`);
        return { sent: false, simulated: false, error: errorText };
      }

      this.logger.log(`✅ Đã gửi tin nhắn cảnh báo đỏ tới Telegram Chat [${chatId}] thành công!`);
      return { sent: true, simulated: false };
    } catch (err: any) {
      this.logger.error(`Lỗi kết nối tới Telegram API: ${err.message}`);
      return { sent: false, simulated: false, error: err.message };
    }
  }

  private formatAlertMessage(alert: TamperAlertDto): string {
    return [
      `🚨🚨🚨 <b>AEGIS LEDGER - SECURITY BREACH ALERT</b> 🚨🚨🚨`,
      ``,
      `<b>Mức độ:</b> 🔴 <code>${alert.severity}</code>`,
      `<b>Loại tấn công:</b> ⚠️ <code>${alert.breachType}</code>`,
      `<b>Bảng mục tiêu:</b> 🗄️ <code>${alert.targetTable}</code>`,
      `<b>Record ID bị tác động:</b> 🆔 <code>${alert.affectedId}</code>`,
      `<b>Thời gian phát hiện:</b> ⏱️ <code>${alert.detectedAt}</code>`,
      ``,
      `<b>Nội dung cảnh báo:</b>`,
      `<blockquote>${alert.message}</blockquote>`,
      ``,
      `🛑 <b>HÀNH ĐỘNG TỰ VỆ CHỦ ĐỘNG:</b>`,
      `<i>Cờ đỏ <code>AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS</code> đã được kích hoạt! Toàn bộ cổng rút và chuyển tiền đã bị đóng băng khẩn cấp (HTTP 423 Locked).</i>`,
    ].join('\n');
  }

  private formatConsoleAlert(alert: TamperAlertDto): string {
    return [
      `================================================================================`,
      `🚨 [TELEGRAM SOS DISPATCHER - SIMULATION MODE]`,
      `Severity      : ${alert.severity}`,
      `Breach Type   : ${alert.breachType}`,
      `Target Table  : ${alert.targetTable}`,
      `Affected ID   : ${alert.affectedId}`,
      `Detected At   : ${alert.detectedAt}`,
      `Message       : ${alert.message}`,
      `Active Action : 🔒 LOCKDOWN ENGAGED (WITHDRAWALS & TRANSFERS FROZEN - HTTP 423)`,
      `================================================================================`,
    ].join('\n');
  }
}
