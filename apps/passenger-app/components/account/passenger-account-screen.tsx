import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PassengerApiError,
  type NativePassengerLogoutResult,
  type NativePassengerSession,
  type PassengerAccount,
  type PassengerClient,
  type PassengerLoginIdentity,
} from "@drts/passenger-client";
import {
  callbackFields,
  type PassengerOAuthBrowserPort,
} from "../auth/passenger-login-screen";

export interface PassengerAccountScreenProps {
  passenger: PassengerClient;
  session: NativePassengerSession;
  mode: "configured" | "demo";
  onSignedOut(result: {
    reason: "logout" | "deleted";
    message: string;
    remoteRevocation?: NativePassengerLogoutResult["remoteRevocation"];
  }): void | Promise<void>;
  onAccountChanged?(account: PassengerAccount): void;
  policy?: {
    termsVersion: string;
    privacyVersion: string;
    onOpen(kind: "terms" | "privacy"): void;
  };
  demoOtpHint?: string;
  beforeSessionEnd?(): Promise<string>;
  onSessionEndFailed?(): Promise<void>;
  oauth?: { browser: PassengerOAuthBrowserPort; callbackUri: string };
}
type Proof = { provider: "phone" | "email"; target: string; challenge: string };
function message(error: unknown) {
  if (error instanceof PassengerApiError) {
    if (error.code === "invalid_code") return "驗證碼不正確，請重新輸入。";
    if (error.code === "pending_payment_block")
      return "尚有未結清款項，請處理後再刪除帳號。";
    if (error.code === "not_configured")
      return "此驗證服務尚未設定，已略過外部驗證。";
    if (error.code === "too_many_requests") return "請求過於頻繁，請稍後重試。";
    if (error.status === 401) return "登入已失效，請重新登入。";
  }
  return error instanceof Error ? error.message : "目前無法完成操作，請重試。";
}

/** Actual account/session clients; App composition supplies SecureStore and navigation. */
export function PassengerAccountScreen({
  passenger,
  session,
  mode,
  onSignedOut,
  onAccountChanged,
  policy,
  demoOtpHint,
  beforeSessionEnd,
  onSessionEndFailed,
  oauth,
}: PassengerAccountScreenProps) {
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [providerError, setProviderError] = useState("");
  const [identities, setIdentities] = useState<PassengerLoginIdentity[]>([]);
  const [identityError, setIdentityError] = useState("");
  const [proof, setProof] = useState<Proof | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [terminal, setTerminal] = useState<"deleted" | "logout" | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const sessionEndNotice = useRef("");

  function accept(next: PassengerAccount) {
    if (!active.current) return;
    setAccount(next);
    setName(next.displayName ?? "");
    setPhone(next.contactPhone ?? "");
    setConsent(next.contactConsent === true);
    onAccountChanged?.(next);
  }
  async function run(operation: () => Promise<void>) {
    if (running.current || !active.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (failure) {
      if (active.current) setError(message(failure));
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function loadProviders() {
    try {
      const result = await passenger.getProviders();
      if (active.current) {
        setProviders(result.providers);
        setProviderError("");
      }
    } catch {
      if (active.current) {
        setProviders([]);
        setProviderError("無法讀取驗證方式，請重試。");
      }
    }
  }
  async function reload() {
    await run(async () => {
      accept(await passenger.getAccount());
      await loadProviders();
      await loadIdentities();
    });
  }
  async function loadIdentities(): Promise<boolean> {
    try {
      const result = await passenger.getIdentities();
      if (active.current) {
        setIdentities(result.identities);
        setIdentityError("");
      }
      return true;
    } catch {
      if (active.current) setIdentityError("登入身分尚未讀取，請重試。");
      return false;
    }
  }
  async function linkOAuth(provider: "google" | "facebook" | "line") {
    if (!oauth) return;
    await run(async () => {
      const start = await session.oauthStart({
        provider,
        purpose: "link",
        redirectUri: oauth.callbackUri,
      });
      const returned = await oauth.browser.openAuthSession(
        start.authUrl,
        oauth.callbackUri,
      );
      if (!active.current) return;
      if (returned.type !== "success") {
        setNotice("已取消第三方綁定。");
        return;
      }
      const fields = callbackFields(returned.url);
      if (!fields) throw new Error("第三方綁定未完成，請重試。");
      const result = await session.oauthCallback(
        { provider, ...fields, transactionId: start.transactionId },
        "link",
      );
      if (result.result !== "linked")
        throw new Error("尚未確認身分綁定結果，請重新讀取帳號。");
      const read = await loadIdentities();
      setNotice(
        read ? "登入方式已綁定。" : "綁定已完成；登入身分尚未讀取，請重試。",
      );
    });
  }
  async function unlink(identityId: string) {
    await run(async () => {
      const result = await passenger.unlinkIdentity({ identityId });
      if (!result.success) throw new Error("服務尚未確認解除綁定，請重試。");
      const read = await loadIdentities();
      setNotice(
        read
          ? "登入方式已解除綁定。"
          : "解除綁定已完成；登入身分尚未讀取，請重試。",
      );
    });
  }
  useEffect(() => {
    active.current = true;
    void reload();
    return () => {
      active.current = false;
    };
  }, [passenger]);

  async function save() {
    await run(async () => {
      const result = await passenger.updateAccount({
        ...(name.trim() ? { displayName: name.trim() } : {}),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
        contactConsent: consent,
      });
      accept(result.account);
      setNotice("個人資料已儲存。");
    });
  }
  async function acknowledgePolicy() {
    if (!policy || !policyAgreed) return;
    await run(async () => {
      const result = await passenger.updateAccount({
        termsVersion: policy.termsVersion,
        privacyVersion: policy.privacyVersion,
      });
      accept(result.account);
      setNotice("條款與隱私權同意已記錄。");
      setPolicyAgreed(false);
    });
  }
  async function requestProof(provider: Proof["provider"]) {
    const target = (provider === "phone" ? phone : email).trim();
    if (!target) {
      setError(provider === "phone" ? "請輸入聯絡手機。" : "請輸入 Email。");
      return;
    }
    await run(async () => {
      const result = await session.requestOtp({
        provider,
        target,
        purpose: provider === "phone" ? "verify_contact_phone" : "link",
      });
      if (!result.success) throw new Error("尚未取得驗證碼，請重試。");
      setProof({ provider, target, challenge: result.challenge });
      setCode("");
      setNotice(
        mode === "demo"
          ? "已取得示意驗證碼；未寄送真實簡訊或 Email。"
          : "已請求驗證碼，請查看訊息。",
      );
    });
  }
  async function verifyProof() {
    if (!proof) return;
    await run(async () => {
      const result = await session.verifyOtp(
        {
          provider: proof.provider,
          target: proof.target,
          challenge: proof.challenge,
          code: code.trim(),
        },
        "authenticated",
      );
      const expected =
        proof.provider === "phone" ? "verified_contact_phone" : "linked";
      if (result.result !== expected)
        throw new Error("驗證結果尚未確認，請重新讀取帳號。");
      setProof(null);
      setCode("");
      try {
        accept(await passenger.getAccount());
        setNotice("驗證完成，帳號資料已更新。");
      } catch {
        setNotice("驗證已完成；暫時無法讀取更新資料，請重新讀取。");
      }
    });
  }
  async function finishDeletion() {
    await session.clear();
    if (!active.current) return;
    setCleanupPending(false);
    const text = "帳號已刪除，本機登入資料已清除。" + sessionEndNotice.current;
    setNotice(text);
    await onSignedOut({ reason: "deleted", message: text });
  }
  async function removeAccount() {
    await run(async () => {
      sessionEndNotice.current = (await beforeSessionEnd?.()) ?? "";
      let result;
      try {
        result = await passenger.deleteAccount();
      } catch (error) {
        await onSessionEndFailed?.();
        throw error;
      }
      if (!result.success) throw new Error("服務尚未確認帳號刪除，請重試。");
      setTerminal("deleted");
      setAccount(null);
      setConfirmDelete(false);
      setProof(null);
      setCleanupPending(true);
      try {
        await finishDeletion();
      } catch {
        setNotice("帳號已刪除；本機登入資料尚未清除，請重試清除。");
      }
    });
  }
  async function logout() {
    await run(async () => {
      const pushMessage = await beforeSessionEnd?.();
      const result = await session.logout();
      if (!result.localCleared)
        throw new Error("本機登入資料尚未清除，請重試登出。");
      const text =
        (result.remoteRevocation === "unconfirmed"
          ? "已清除本機登入；服務端撤銷尚未確認。"
          : "已登出，本機登入資料已清除。") + (pushMessage ?? "");
      setTerminal("logout");
      setAccount(null);
      setProof(null);
      setNotice(text);
      await onSignedOut({
        reason: "logout",
        message: text,
        remoteRevocation: result.remoteRevocation,
      });
    });
  }
  const action = (
    id: string,
    label: string,
    onPress: () => void | Promise<void>,
    disabled = busy,
  ) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={styles.button}
    >
      <Text>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        我的帳戶
      </Text>
      {mode === "demo" && (
        <Text testID="account-demo-banner">
          模擬示意：帳號、訊息與外部驗證使用測試資料，並非正式帳號或真實訊息。
        </Text>
      )}
      {busy && (
        <ActivityIndicator
          testID="account-loading"
          accessibilityLabel="處理中"
        />
      )}
      {!!error && (
        <Text testID="account-error" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {!!notice && <Text testID="account-notice">{notice}</Text>}
      {terminal === "deleted" &&
        cleanupPending &&
        action("account-retry-cleanup", "重試清除本機登入", () =>
          run(finishDeletion),
        )}
      {!terminal && (
        <>
          {action("account-reload", "重新讀取資料", reload)}
          {account && (
            <View>
              <Text testID="account-status">
                帳號狀態：
                {
                  { active: "使用中", suspended: "已停用", deleted: "已刪除" }[
                    account.status
                  ]
                }
              </Text>
              <Text>顯示名稱</Text>
              <TextInput
                testID="account-name"
                accessibilityLabel="顯示名稱"
                value={name}
                editable={!busy}
                onChangeText={setName}
              />
              <Text>聯絡手機</Text>
              <TextInput
                testID="account-phone"
                accessibilityLabel="聯絡手機"
                keyboardType="phone-pad"
                value={phone}
                editable={!busy}
                onChangeText={(value) => {
                  setPhone(value);
                  setProof(null);
                }}
              />
              <Text testID="account-phone-status">
                {account.contactPhoneVerified
                  ? "目前保存的聯絡手機已驗證"
                  : "目前保存的聯絡手機未驗證"}
              </Text>
              <Text testID="account-email-status">
                {account.verifiedEmail
                  ? `已驗證 Email：${account.verifiedEmail}`
                  : "尚未綁定已驗證 Email"}
              </Text>
              <Text>同意客服聯繫</Text>
              <Switch
                testID="account-contact-consent"
                accessibilityLabel="同意客服聯繫"
                value={consent}
                disabled={busy}
                onValueChange={setConsent}
              />
              {action("account-save", "儲存個人資料", save)}
              {policy && (
                <View>
                  {action("account-open-terms", "閱讀服務條款", () =>
                    policy.onOpen("terms"),
                  )}
                  {action("account-open-privacy", "閱讀隱私權政策", () =>
                    policy.onOpen("privacy"),
                  )}
                  <Text>我已閱讀並同意</Text>
                  <Switch
                    testID="account-policy-consent"
                    accessibilityLabel="我已閱讀並同意條款與隱私權"
                    value={policyAgreed}
                    disabled={busy}
                    onValueChange={setPolicyAgreed}
                  />
                  {action(
                    "account-save-policy",
                    "記錄條款與隱私權同意",
                    acknowledgePolicy,
                    busy || !policyAgreed,
                  )}
                </View>
              )}
              {!!providerError && (
                <Text testID="account-provider-error">{providerError}</Text>
              )}
              {!!providerError &&
                action("account-retry-providers", "重新讀取驗證方式", () =>
                  run(loadProviders),
                )}
              {providers.includes("phone")
                ? action(
                    "account-request-phone",
                    mode === "demo" ? "模擬驗證聯絡手機" : "驗證聯絡手機",
                    () => requestProof("phone"),
                  )
                : !providerError && (
                    <Text testID="account-sms-skipped">
                      簡訊驗證服務尚未設定，已略過此外部步驟；可儲存未驗證聯絡手機。
                    </Text>
                  )}
              {providers.includes("email") && (
                <View>
                  <TextInput
                    testID="account-email"
                    accessibilityLabel="要綁定的 Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    editable={!busy}
                    onChangeText={(value) => {
                      setEmail(value);
                      setProof(null);
                    }}
                  />
                  {action(
                    "account-request-email",
                    mode === "demo" ? "模擬綁定 Email" : "綁定 Email",
                    () => requestProof("email"),
                  )}
                </View>
              )}
              {proof && (
                <View testID="account-proof">
                  <Text>驗證目標：{proof.target}</Text>
                  {mode === "demo" && demoOtpHint && (
                    <Text testID="account-demo-code">
                      示意驗證碼：{demoOtpHint}
                    </Text>
                  )}
                  <TextInput
                    testID="account-code"
                    accessibilityLabel="驗證碼"
                    keyboardType="number-pad"
                    value={code}
                    editable={!busy}
                    onChangeText={setCode}
                  />
                  {action(
                    "account-verify",
                    "送出驗證碼",
                    verifyProof,
                    busy || !code.trim(),
                  )}
                </View>
              )}
              <View testID="account-identities">
                <Text>登入身分</Text>
                {!!identityError && (
                  <Text accessibilityRole="alert">{identityError}</Text>
                )}
                {action("account-reload-identities", "重新讀取登入身分", () =>
                  run(async () => {
                    await loadIdentities();
                  }),
                )}
                {identities.map((identity) => (
                  <View key={identity.identityId}>
                    <Text>{identity.provider}</Text>
                    {action(
                      `account-unlink-${identity.identityId}`,
                      `解除 ${identity.provider} 綁定`,
                      () => unlink(identity.identityId),
                      busy || identities.length <= 1 || !!identityError,
                    )}
                  </View>
                ))}
                {(["google", "facebook", "line"] as const)
                  .filter((provider) => providers.includes(provider))
                  .map((provider) =>
                    oauth ? (
                      <View key={provider}>
                        {action(
                          `account-link-${provider}`,
                          `${mode === "demo" ? "模擬" : ""}綁定 ${provider}`,
                          () => linkOAuth(provider),
                        )}
                      </View>
                    ) : (
                      <Text key={provider}>
                        系統瀏覽器尚未提供，已略過 {provider} 綁定。
                      </Text>
                    ),
                  )}
              </View>
              {action("account-logout", "登出", logout)}
              {action("account-open-delete", "刪除帳號", () =>
                setConfirmDelete(true),
              )}
              {confirmDelete && (
                <View testID="account-delete-confirmation">
                  <Text>
                    刪除帳號會移除個人資料；依法需保留的行程與交易紀錄將保留。
                  </Text>
                  {action("account-cancel-delete", "保留帳號", () =>
                    setConfirmDelete(false),
                  )}
                  {action(
                    "account-confirm-delete",
                    "確認刪除帳號",
                    removeAccount,
                  )}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  button: { paddingVertical: 12, minHeight: 44 },
});
