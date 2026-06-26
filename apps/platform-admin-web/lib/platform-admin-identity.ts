export const PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID = "platform-admin-web-bootstrap";

export type PlatformAdminAuthority = {
  actorId: string;
  scopes: string[];
};

export const DEFAULT_PLATFORM_ADMIN_AUTHORITY: PlatformAdminAuthority = {
  actorId: PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID,
  scopes: [],
};
