import type {
  MailOutbox,
  OutboxState,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

export class MemoryMailOutbox implements MailOutbox {
  public state: OutboxState = { version: 1, deliveries: {} };

  async transaction<T>(operation: (state: OutboxState) => T): Promise<T> {
    const clone = structuredClone(this.state);
    const result = operation(clone);
    this.state = clone;
    return structuredClone(result);
  }
}
