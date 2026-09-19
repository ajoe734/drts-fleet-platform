# 乘客通知送達夥伴 App：UI Design Delta

This document describes the UI changes to the partner entry management page to support passenger notifications.

## Partner Entry Management - Notification Tab
- **Tab Name**: Notifications
- **Location**: Added as a new tab next to 'Audit' in the `Platform Admin.html` partner details page.
- **Components**:
  1. **Notification Binding Card**:
     - Shows the current binding status and webhook ID.
     - Action buttons to test, enable, and disable the binding.
  2. **Recent Deliveries Card**:
     - Displays a privacy notice stating that device delivery status is unknown.
     - A table showing `outboxId`, `status`, `deliveryStage`, `failureReason`, and an action button to `Retry`.
     - The `Retry` button is only enabled for failed notifications that are allowed to be retried manually.
