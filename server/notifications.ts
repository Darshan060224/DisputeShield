export type NotificationItem = { type: "deadline" | "evidence" | "webhook" | "escalation"; title: string; body: string; tone: "critical" | "warning" | "success"; createdAt: string };

const eventNotifications: NotificationItem[] = [
  { type: "deadline", title: "Deadline approaching", body: "DSP-1046 requires review in 9h 18m.", tone: "critical", createdAt: new Date().toISOString() },
  { type: "evidence", title: "Evidence incomplete", body: "Delivery proof is missing for DSP-1046.", tone: "warning", createdAt: new Date().toISOString() },
];

export function recordNotification(item: Omit<NotificationItem, "createdAt">) {
  eventNotifications.unshift({ ...item, createdAt: new Date().toISOString() });
  eventNotifications.splice(20);
}

export function listNotifications() { return eventNotifications; }
