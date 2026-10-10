"use client";

import { useEffect, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import type { PassengerAccount } from "@drts/passenger-client";
import { P5Card, P5Btn, P5 } from "../../components/p5-ui";

const client = new PassengerClient({
  baseUrl: "",
  fetchFn: (...args) => fetch(...args),
});

export default function AccountPage() {
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const fetchData = async () => {
    try {
      const acc = await client.getAccount();
      setAccount(acc);
      setDisplayName(acc.displayName || "");
      setContactPhone(acc.contactPhone || "");

      const idsRes = await client.getIdentities();
      setIdentities(idsRes.identities || []);
    } catch (err) {
      console.error(err);
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      await client.logout();
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await client.updateAccount({ displayName, contactPhone });
      setIsEditing(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlink = async (identityId: string) => {
    if (identities.length <= 1) {
      alert("必須至少保留一種登入方式");
      return;
    }
    try {
      await client.unlinkIdentity({ identityId });
      fetchData();
    } catch (err) {
      console.error(err);
      alert("解除綁定失敗");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await client.deleteAccount({ drtsPassengerId: account!.drtsPassengerId });
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      alert("刪除帳號失敗");
    }
  };

  const handleOAuthBind = async (provider: "google" | "facebook" | "line") => {
    try {
      const res = await client.oauthStart({
        provider,
        redirectUri: window.location.origin + `/auth/callback/${provider}`,
        purpose: "link",
      });
      window.location.href = res.authUrl;
    } catch (err) {
      console.error(err);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${P5.line}`,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box" as const,
    marginBottom: 8,
  };

  if (loading) return <div style={{ padding: 14 }}>載入中...</div>;
  if (!account) return null;

  return (
    <div
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <P5Card title="個人資料">
        {isEditing ? (
          <div>
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="姓名"
            />
            <input
              style={inputStyle}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="聯絡手機"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <P5Btn kind="primary" onClick={handleUpdateProfile}>
                  儲存
                </P5Btn>
              </div>
              <div style={{ flex: 1 }}>
                <P5Btn onClick={() => setIsEditing(false)}>取消</P5Btn>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: P5.mut }}>姓名</div>
              <div>{account.displayName || "未設定"}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: P5.mut }}>聯絡手機</div>
              <div>
                {account.contactPhone || "未設定"}
                {account.contactPhone && (
                  <span
                    style={{
                      fontSize: 11,
                      marginLeft: 8,
                      color: account.contactPhoneVerified
                        ? P5.brand
                        : P5.danger,
                    }}
                  >
                    {account.contactPhoneVerified ? "(已驗證)" : "(未驗證)"}
                  </span>
                )}
              </div>
            </div>
            <P5Btn onClick={() => setIsEditing(true)}>編輯資料</P5Btn>
          </div>
        )}
      </P5Card>

      <P5Card title="登入方式管理">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {identities.map((id) => (
            <div
              key={id.identityId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: `1px solid ${P5.lineSoft}`,
                paddingBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{id.provider}</div>
                <div style={{ fontSize: 12, color: P5.mut }}>{id.subject}</div>
              </div>
              <button
                onClick={() => handleUnlink(id.identityId)}
                style={{
                  background: "none",
                  border: "none",
                  color: identities.length > 1 ? P5.danger : P5.dim,
                  cursor: identities.length > 1 ? "pointer" : "not-allowed",
                }}
                disabled={identities.length <= 1}
              >
                解除綁定
              </button>
            </div>
          ))}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
              新增綁定
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <P5Btn onClick={() => handleOAuthBind("google")}>Google</P5Btn>
              <P5Btn onClick={() => handleOAuthBind("facebook")}>
                Facebook
              </P5Btn>
              <P5Btn onClick={() => handleOAuthBind("line")}>LINE</P5Btn>
            </div>
          </div>
        </div>
      </P5Card>

      <P5Card title="帳號操作">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <P5Btn onClick={handleLogout}>登出</P5Btn>

          {showDeleteConfirm ? (
            <div
              style={{
                background: P5.warnBg,
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${P5.warnBd}`,
              }}
            >
              <div style={{ color: P5.warn, fontWeight: 600, marginBottom: 8 }}>
                確定要刪除帳號嗎？
              </div>
              <div style={{ fontSize: 13, color: P5.ink, marginBottom: 14 }}>
                刪除後將無法恢復。您的個人資料將被匿名化處理，但為符合法規要求，歷史行程與財務紀錄將會保留。
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <P5Btn kind="primary" danger onClick={handleDeleteAccount}>
                    確認刪除
                  </P5Btn>
                </div>
                <div style={{ flex: 1 }}>
                  <P5Btn onClick={() => setShowDeleteConfirm(false)}>
                    取消
                  </P5Btn>
                </div>
              </div>
            </div>
          ) : (
            <P5Btn danger onClick={() => setShowDeleteConfirm(true)}>
              刪除帳號
            </P5Btn>
          )}
        </div>
      </P5Card>
    </div>
  );
}
