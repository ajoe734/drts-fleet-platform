import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PassengerApiError,
  type AuthProvider,
  type PassengerAccount,
  type PassengerClient,
  type PassengerNativeAuthClient,
  type NativePassengerSession,
} from "@drts/passenger-client";

/** The future App adapter opens the API authUrl in the system browser. */
export interface PassengerOAuthBrowserPort {
  openAuthSession(
    authUrl: string,
    redirectUri: string,
  ): Promise<{ type: "success"; url: string } | { type: "cancel" | "dismiss" }>;
}
export interface PassengerLoginScreenProps {
  auth: PassengerNativeAuthClient;
  session: NativePassengerSession;
  passenger: PassengerClient;
  browser: PassengerOAuthBrowserPort;
  callbackUri: string;
  mode: "configured" | "demo";
  /** Synthetic fixture hint, visible only in explicit demo mode. */
  demoOtpHint?: string;
  onAuthenticated(account: PassengerAccount): void | Promise<void>;
}
type Busy =
  | "providers"
  | "request"
  | "verify"
  | "oauth"
  | "browser"
  | "account"
  | null;
type OtpProvider = "phone" | "email";
const providerLabels = { google: "Google", facebook: "Facebook", line: "LINE" };
const progress: Record<Exclude<Busy, null>, string> = {
  providers: "正在讀取登入方式…",
  request: "正在取得驗證碼…",
  verify: "正在確認驗證並儲存登入狀態…",
  oauth: "正在準備第三方登入…",
  browser: "請在系統瀏覽器完成登入…",
  account: "正在讀取帳號…",
};
function failureMessage(error: unknown): string {
  if (error instanceof PassengerApiError) {
    if (error.code === "invalid_code") return "驗證碼不正確，請重新輸入。";
    if (error.code === "challenge_locked") return "驗證碼已失效，請重新取得。";
    if (error.code === "too_many_requests") return "請稍後再試。";
    if (["not_configured", "unsupported_provider"].includes(error.code))
      return "此登入方式尚未設定。";
    if (error.code === "invalid_grant") return "第三方登入未完成，請重新嘗試。";
  }
  return "登入流程暫時無法完成，請重試。";
}
/** Only callback query fields; transactionId remains the API start response. */
function callbackFields(url: string): { code: string; state: string } | null {
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const fields: Record<string, string> = {};
  try {
    for (const segment of query.split("&")) {
      const at = segment.indexOf("=");
      if (at < 0) continue;
      fields[decodeURIComponent(segment.slice(0, at).replace(/\+/g, " "))] =
        decodeURIComponent(segment.slice(at + 1).replace(/\+/g, " "));
    }
  } catch {
    return null;
  }
  return fields.code && fields.state && !fields.error
    ? { code: fields.code, state: fields.state }
    : null;
}
function Action({
  id,
  label,
  disabled,
  onPress,
}: {
  id: string;
  label: string;
  disabled: boolean;
  onPress(): void | Promise<void>;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}

/** Login only: persisted authority stays in the shared session/API, not UI state. */
export function PassengerLoginScreen(props: PassengerLoginScreenProps) {
  const {
    auth,
    session,
    passenger,
    browser,
    callbackUri,
    mode,
    onAuthenticated,
  } = props;
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [provider, setProvider] = useState<OtpProvider>("email");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{
    id: string;
    target: string;
    provider: OtpProvider;
  } | null>(null);
  const [busy, setBusy] = useState<Busy>("providers");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const demo = mode === "demo";
  const label = (text: string) => (demo ? `模擬${text}` : text);

  const loadProviders = useCallback(async () => {
    setBusy("providers");
    setError(null);
    try {
      const result = await auth.getProviders();
      setProviders(result.providers);
      setProvider(result.providers.includes("email") ? "email" : "phone");
    } catch {
      setError("無法讀取登入方式，請重試。");
    } finally {
      setBusy(null);
    }
  }, [auth]);
  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  async function readAccount() {
    setBusy("account");
    const account = await passenger.getAccount();
    await onAuthenticated(account);
    setNeedsAccount(false);
    setInfo(demo ? "示意登入完成。" : "登入成功。");
  }
  async function requestOtp() {
    if (busy || !target.trim()) return;
    setBusy("request");
    setError(null);
    setInfo(null);
    try {
      const submitted = { target: target.trim(), provider };
      const result = await session.requestOtp({
        ...submitted,
        purpose: "login",
      });
      if (!result.success) {
        setError("驗證碼尚未寄出，請重試。");
        return;
      }
      setChallenge({ id: result.challenge, ...submitted });
      setCode("");
      setInfo(
        demo ? "示意驗證碼已準備好。" : "驗證碼已送出，請輸入六位數驗證碼。",
      );
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function verifyOtp() {
    if (busy || !challenge || code.trim().length !== 6) return;
    setBusy("verify");
    setError(null);
    setInfo(null);
    try {
      const result = await session.verifyOtp({
        target: challenge.target,
        provider: challenge.provider,
        challenge: challenge.id,
        code: code.trim(),
      });
      if (result.result !== "logged_in") {
        setError("尚未完成登入，請重新嘗試。");
        return;
      }
      // Shared session already awaited token persistence; /me now gets that Bearer.
      setNeedsAccount(true);
      await readAccount();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function oauth(provider: "google" | "facebook" | "line") {
    if (busy) return;
    setBusy("oauth");
    setError(null);
    setInfo(null);
    try {
      const start = await session.oauthStart({
        provider,
        redirectUri: callbackUri,
        purpose: "login",
      });
      setBusy("browser");
      const returned = await browser.openAuthSession(
        start.authUrl,
        callbackUri,
      );
      if (returned.type !== "success") {
        setInfo("已取消第三方登入。");
        return;
      }
      const fields = callbackFields(returned.url);
      if (!fields) {
        setError("第三方登入未完成，請重新嘗試。");
        return;
      }
      const result = await session.oauthCallback({
        provider,
        ...fields,
        transactionId: start.transactionId,
      });
      if (result.result !== "logged_in") {
        setError("尚未完成登入，請重新嘗試。");
        return;
      }
      setNeedsAccount(true);
      await readAccount();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function retryAccount() {
    if (busy) return;
    setError(null);
    setInfo(null);
    try {
      await readAccount();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  function chooseProvider(next: OtpProvider) {
    setProvider(next);
    setChallenge(null);
    setCode("");
    setError(null);
    setInfo(null);
  }

  const hasOtp = providers.includes("phone") || providers.includes("email");
  return (
    <ScrollView
      testID="passenger-login-screen"
      contentContainerStyle={styles.screen}
    >
      <Text accessibilityRole="header" style={styles.title}>
        乘客登入
      </Text>
      {demo && (
        <Text testID="auth-demo-banner" style={styles.notice}>
          示意模式：外部登入、簡訊與寄信使用模擬資料；不是正式帳號或真實訊息。
        </Text>
      )}
      {busy && (
        <View testID="auth-loading" accessibilityRole="progressbar">
          <ActivityIndicator />
          <Text testID="auth-progress">{progress[busy]}</Text>
        </View>
      )}
      {error && (
        <Text testID="auth-error" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {info && <Text testID="auth-info">{info}</Text>}
      <Action
        id="auth-reload-providers"
        label="重新載入登入方式"
        disabled={busy !== null}
        onPress={loadProviders}
      />
      {busy === null && providers.length === 0 && (
        <Text testID="auth-unavailable">目前沒有已設定的登入方式。</Text>
      )}
      {hasOtp && (
        <View testID="auth-otp-form">
          {providers.includes("phone") && (
            <Action
              id="auth-channel-phone"
              label={label("手機登入")}
              disabled={busy !== null}
              onPress={() => chooseProvider("phone")}
            />
          )}
          {providers.includes("email") && (
            <Action
              id="auth-channel-email"
              label={label("Email 登入")}
              disabled={busy !== null}
              onPress={() => chooseProvider("email")}
            />
          )}
          <TextInput
            testID="auth-target"
            accessibilityLabel={provider === "phone" ? "手機號碼" : "Email"}
            value={target}
            onChangeText={setTarget}
            editable={busy === null && !challenge}
            autoCapitalize="none"
            keyboardType={provider === "phone" ? "phone-pad" : "email-address"}
          />
          <Action
            id="auth-request-otp"
            label={label(challenge ? "重寄驗證碼" : "取得驗證碼")}
            disabled={busy !== null || !target.trim()}
            onPress={requestOtp}
          />
          {challenge && (
            <View testID="auth-challenge">
              <Text>驗證 {challenge.target}</Text>
              {demo && props.demoOtpHint && (
                <Text testID="auth-demo-otp-hint">
                  示意驗證碼：{props.demoOtpHint}
                </Text>
              )}
              <TextInput
                testID="auth-code"
                accessibilityLabel="六位數驗證碼"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                maxLength={6}
                editable={busy === null}
              />
              <Action
                id="auth-verify-otp"
                label={label("驗證並登入")}
                disabled={busy !== null || code.trim().length !== 6}
                onPress={verifyOtp}
              />
            </View>
          )}
        </View>
      )}
      {(["google", "facebook", "line"] as const)
        .filter((item) => providers.includes(item))
        .map((item) => (
          <Action
            key={item}
            id={`auth-oauth-${item}`}
            label={label(`${providerLabels[item]} 登入`)}
            disabled={busy !== null}
            onPress={() => oauth(item)}
          />
        ))}
      {needsAccount && (
        <Action
          id="auth-retry-account"
          label="重新讀取帳號"
          disabled={busy !== null}
          onPress={retryAccount}
        />
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  notice: { padding: 12, backgroundColor: "#fff4cc" },
  button: { padding: 12, borderWidth: 1, borderRadius: 8 },
  disabled: { opacity: 0.5 },
});
