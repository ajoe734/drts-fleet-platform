import sys

en_insert = """
  // Partner Notification
  "partnerNotification.title": "Notification Binding",
  "partnerNotification.subtitle": "Manage webhook bindings for passenger notifications",
  "partnerNotification.test": "Test Binding",
  "partnerNotification.enable": "Enable",
  "partnerNotification.disable": "Disable",
  "partnerNotification.noBinding": "No binding configured",
  "partnerNotification.noBindingBody": "This entry has no passenger notification binding.",
  "partnerNotification.recent": "Recent Deliveries",
  "partnerNotification.recentSubtitle": "Shows recent delivery attempts (unknown device status)",
  "partnerNotification.privacyNotice": "Privacy notice",
  "partnerNotification.privacyBody": "Device delivery status is unknown. Do not claim the resident has received or read the notification.",
  "partnerNotification.retry": "Retry",
  "partnerNotification.delivered": "Partner Accepted (Device Unknown)",
  "partnerNotification.state": "State",
  "partnerNotification.webhookId": "Webhook ID",
  "partnerNotification.outboxId": "Outbox ID",
  "partnerNotification.status": "Status",
  "partnerNotification.stage": "Delivery Stage",
  "partnerNotification.reason": "Failure Reason",
"""

zh_insert = """
  // Partner Notification
  "partnerNotification.title": "通知綁定",
  "partnerNotification.subtitle": "管理乘客通知的 Webhook 綁定",
  "partnerNotification.test": "測試綁定",
  "partnerNotification.enable": "啟用",
  "partnerNotification.disable": "停用",
  "partnerNotification.noBinding": "未配置綁定",
  "partnerNotification.noBindingBody": "此 entry 尚未配置乘客通知綁定。",
  "partnerNotification.recent": "近期投遞",
  "partnerNotification.recentSubtitle": "顯示近期的投遞嘗試（裝置狀態未知）",
  "partnerNotification.privacyNotice": "隱私聲明",
  "partnerNotification.privacyBody": "裝置投遞狀態未知。請勿聲稱居民已收到或閱讀通知。",
  "partnerNotification.retry": "重試",
  "partnerNotification.delivered": "夥伴已接受（裝置未知）",
  "partnerNotification.state": "狀態",
  "partnerNotification.webhookId": "Webhook ID",
  "partnerNotification.outboxId": "Outbox ID",
  "partnerNotification.status": "狀態",
  "partnerNotification.stage": "投遞階段",
  "partnerNotification.reason": "失敗原因",
"""

with open("apps/platform-admin-web/lib/translations.ts", "r") as f:
    content = f.read()

en_pos = content.find('  "common.enabled": "Enabled",')
if en_pos != -1:
    content = content[:en_pos] + en_insert + content[en_pos:]

zh_pos = content.find('  "common.enabled": "已啟用",')
if zh_pos != -1:
    content = content[:zh_pos] + zh_insert + content[zh_pos:]

with open("apps/platform-admin-web/lib/translations.ts", "w") as f:
    f.write(content)
