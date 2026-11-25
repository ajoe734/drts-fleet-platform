import type { ReactNode } from "react";

/**
 * PWD-LOGIN-009: copy comes from each host app's existing zh-TW/en resource
 * (`lib/translations.ts`). These components hold no locale state of their own.
 */
export interface PortalAuthMessages {
  emailLabel: string;
  passwordLabel: string;
  signIn: string;
  signInWithGoogle: string;
  forgotPassword: string;
  verificationToggleShow: string;
  verificationToggleHide: string;
  useAuthenticatorCode: string;
  useRecoveryCode: string;
  totpCodeLabel: string;
  totpCodeHint: string;
  recoveryCodeLabel: string;
  recoveryCodeHint: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  passwordHint: string;
  savePassword: string;
  forgotTitle: string;
  forgotDescription: string;
  requestReset: string;
  forgotAccepted: string;
  resetTitle: string;
  resetDescription: string;
  passwordMismatch: string;
  passwordSaved: string;
  busy: string;
  genericError: string;
  backToLogin: string;
  totpEnrollTitle: string;
  totpEnrollDescription: string;
  startTotpEnrollment: string;
  manualSecretLabel: string;
  manualSecretHint: string;
  otpauthUriLabel: string;
  otpauthUriHint: string;
  confirmTotpCodeLabel: string;
  confirmTotp: string;
  totpConfirmed: string;
  recoveryCodesTitle: string;
  recoveryCodesNotice: string;
  copy: string;
  copied: string;
  copyFailed: string;
  download: string;
  dismissRecoveryCodes: string;
  regenerateRecoveryCodes?: string;
  sessionsTitle: string;
  sessionsEmpty: string;
  currentSessionBadge: string;
  sessionRealmLabel: string;
  sessionAuthTimeLabel: string;
  sessionMethodsLabel: string;
  revokeSession: string;
  revokeAllSessions: string;
  sessionRevoked: string;
}

export interface PortalAuthEndpoints {
  /** `POST`, e.g. `/api/auth/tenant/password-login`. */
  passwordLogin: string;
  /** `POST`, e.g. `/api/auth/tenant/invitation/accept-with-password`. */
  invitationAcceptWithPassword: string;
  /** `POST`, e.g. `/api/auth/tenant/password-reset/request`. */
  passwordResetRequest: string;
  /** `POST`, e.g. `/api/auth/tenant/password-reset/confirm`. */
  passwordResetConfirm: string;
  /** `POST`, e.g. `/api/auth/tenant/mfa/totp/enroll`. */
  totpEnroll: string;
  /** `POST`, e.g. `/api/auth/tenant/mfa/totp/confirm`. */
  totpConfirm: string;
  /** `POST`, e.g. `/api/auth/agency/mfa/totp/recovery-codes/regenerate`. */
  totpRegenerateRecoveryCodes?: string;
  /** `GET`, e.g. `/api/auth/sessions`. */
  sessions: string;
  /** Base such as `/api/auth/sessions`; the panel appends `/{encoded sid}/revoke`. */
  sessionRevokeBase: string;
  /** `POST`, e.g. `/api/auth/logout-all`. */
  logoutAll: string;
}

export interface PortalAuthBaseProps {
  messages: PortalAuthMessages;
  /** Host app's own CSRF cookie value, sent as `x-csrf-token`. Omit for pre-session calls. */
  csrfToken?: string | undefined;
}

export interface PortalPasswordLoginFormProps extends PortalAuthBaseProps {
  endpoint: string;
  forgotPasswordHref: string;
  /** Where to send the browser after a successful login. */
  successHref: string;
  /** Existing host Google/OIDC button, rendered by the host above this form. */
  children?: ReactNode;
}

export interface PortalInvitationPasswordFormProps extends PortalAuthBaseProps {
  endpoint: string;
  token: string;
  /**
   * The invitation accept endpoint does not issue a session (SA/SD §5): after
   * it succeeds the browser must still sign in. The host supplies its own
   * password-login endpoint so this form can do that second call itself.
   */
  loginEndpoint: string;
  successHref: string;
}

export interface PortalResetPasswordFormProps extends PortalAuthBaseProps {
  endpoint: string;
  token: string;
  successHref: string;
}

export interface PortalForgotPasswordFormProps extends PortalAuthBaseProps {
  endpoint: string;
}

export interface PortalTotpSetupPanelProps extends PortalAuthBaseProps {
  enrollEndpoint: string;
  confirmEndpoint: string;
  onEnrolled?: () => void;
}

export interface PortalAccountSecurityPanelProps extends PortalAuthBaseProps {
  sessionsEndpoint: string;
  sessionRevokeBase: string;
  logoutAllEndpoint: string;
  totpSetupHref: string;
  totpRegenerateRecoveryCodesEndpoint?: string;
}
