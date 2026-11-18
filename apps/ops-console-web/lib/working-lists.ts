/**
 * The Ops dashboard and dispatch board load their orders and dispatch jobs in
 * one request each. Without a window the API returns every order ever
 * created; on shared dev that had grown to about 10 MB per read. The window
 * keeps every order that is still open, whatever its age, and adds closed
 * (completed or cancelled) orders created in the last
 * OPS_WORKING_LIST_RECENT_DAYS days.
 */
export const OPS_WORKING_LIST_RECENT_DAYS = 30;

export const OPS_ORDERS_WORKING_LIST = `/api/orders?recentDays=${OPS_WORKING_LIST_RECENT_DAYS}`;

export const OPS_DISPATCH_TASKS_WORKING_LIST = `/api/dispatch/tasks?recentDays=${OPS_WORKING_LIST_RECENT_DAYS}`;
