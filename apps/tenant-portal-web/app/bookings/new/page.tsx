import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  type BusinessDispatchSubtype,
  type CreateTenantBookingCommand,
  type IdentityContext,
  type ProductRuleCatalog,
  type TenantAddressRecord,
  type TenantPassengerRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

const MANUAL_ENTRY = "__manual__";
const SUBTYPE_LABELS: Record<
  BusinessDispatchSubtype,
  {
    label: string;
    reservationPolicy: string;
    guidance: string;
  }
> = {
  enterprise_dispatch: {
    label: "企業派車",
    reservationPolicy: "可在預約時窗開始前 30 分鐘修改或取消。",
    guidance: "適合員工或部門用車，可搭配租戶端政策追蹤。",
  },
  credit_card_airport_transfer: {
    label: "信用卡機場接送",
    reservationPolicy: "可在預約時窗開始前 60 分鐘修改或取消。",
    guidance: "適用於機場路線、航班資訊或補助／贊助脈絡需要一併記錄的情境。",
  },
};

function toIsoString(localDateTime: string): string {
  if (!localDateTime) return "";
  return new Date(localDateTime).toISOString();
}

function trimFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDirectorySelection(value: FormDataEntryValue | null) {
  const normalized = trimFormValue(value);
  if (!normalized || normalized === MANUAL_ENTRY) {
    return undefined;
  }
  return normalized;
}

function parseOptionalInteger(value: FormDataEntryValue | null) {
  const normalized = trimFormValue(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function redirectWithError(message: string) {
  redirect(`/bookings/new?error=${encodeURIComponent(message)}`);
}

function getSubtypeLabel(subtype: BusinessDispatchSubtype) {
  return SUBTYPE_LABELS[subtype]?.label ?? subtype;
}

function describePassenger(passenger: TenantPassengerRecord) {
  const details = [
    passenger.employeeNo,
    passenger.departmentName,
    passenger.mobile,
  ].filter(Boolean);

  if (!passenger.mobile) {
    details.push("缺少電話");
  }

  if ((passenger.qualityIssues?.length ?? 0) > 0) {
    details.push(
      `待修正：${passenger.qualityIssues
        ?.map((issue) => formatPortalCodeLabel(issue, issue))
        .join("、")}`,
    );
  }

  return `${passenger.fullName}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

function describeAddress(
  address: TenantAddressRecord,
  passengerNameById: Map<string, string>,
) {
  const details: string[] = [];

  if (address.tags.length > 0) {
    details.push(address.tags.join(", "));
  }

  if (address.ownerPassengerId) {
    details.push(
      `所屬乘客 ${passengerNameById.get(address.ownerPassengerId) ?? address.ownerPassengerId}`,
    );
  }

  if ((address.qualityIssues?.length ?? 0) > 0) {
    details.push(
      `待修正：${address.qualityIssues
        ?.map((issue) => formatPortalCodeLabel(issue, issue))
        .join("、")}`,
    );
  }

  return `${address.addressName}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: "20px",
};

const alertStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "14px 16px",
  border: "1px solid rgba(180, 83, 9, 0.22)",
  background: "rgba(255, 248, 235, 0.9)",
  color: "#9a3412",
  lineHeight: 1.5,
};

const warningListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
};

const overviewGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginBottom: "18px",
};

const overviewCardStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "16px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  display: "grid",
  gap: "8px",
};

const overviewLabelStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#475569",
};

const roleListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  background: "rgba(15, 118, 110, 0.12)",
  color: "#0f766e",
  fontSize: "0.82rem",
  fontWeight: 600,
};

const subtleBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#334155",
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: "18px",
};

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
};

const sectionDescriptionStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
};

const inputGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const formFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const fullWidthFieldStyle: React.CSSProperties = {
  ...formFieldStyle,
  gridColumn: "1 / -1",
};

const fieldLabelStyle: React.CSSProperties = {
  fontWeight: 600,
};

const fieldHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "0.9rem",
  lineHeight: 1.45,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#0f172a",
  font: "inherit",
};

const checkboxStackStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  color: "#0f172a",
  lineHeight: 1.5,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "center",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #0f766e",
  borderRadius: "999px",
  background: "#0f766e",
  color: "#fff",
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const mutedNoteStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
};

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const params = await searchParams;
  const formError = params.error
    ? formatPortalUiError(params.error, "建立訂單失敗")
    : null;

  const [identityResult, passengersResult, addressesResult, catalogResult] =
    await Promise.allSettled([
      client.getIdentityContext(),
      client.listPassengers(),
      client.listAddresses(),
      client.getProductRuleCatalog(),
    ]);

  const identity =
    identityResult.status === "fulfilled"
      ? (identityResult.value as IdentityContext)
      : null;
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  const addresses =
    addressesResult.status === "fulfilled" ? addressesResult.value : [];
  const productRuleCatalog =
    catalogResult.status === "fulfilled"
      ? (catalogResult.value as ProductRuleCatalog)
      : null;

  const warnings = [
    identityResult.status === "rejected"
      ? "目前無法取得身分脈絡。此頁仰賴後端簽發的租戶授權工作階段，因此暫時無法確認建立權限。"
      : null,
    passengersResult.status === "rejected"
      ? "目前無法取得乘客名冊，仍可改用手動輸入乘客資料。"
      : null,
    addressesResult.status === "rejected"
      ? "目前無法取得地址簿，仍可手動輸入上車與下車地址。"
      : null,
    catalogResult.status === "rejected"
      ? "目前無法取得產品規則目錄，將改用內建的服務類型標籤與預設定價權威。"
      : null,
  ].filter(Boolean) as string[];

  const activePassengers = passengers.filter(
    (passenger) => passenger.activeFlag,
  );
  const activeAddresses = addresses.filter((address) => address.activeFlag);
  const passengerNameById = new Map(
    activePassengers.map((passenger) => [
      passenger.passengerId,
      passenger.fullName,
    ]),
  );
  const subtypeOptions = productRuleCatalog?.businessDispatchSubtypes?.length
    ? productRuleCatalog.businessDispatchSubtypes
    : [...BUSINESS_DISPATCH_SUBTYPES];
  const pricingAuthority = productRuleCatalog?.pricingAuthority ?? {
    canonicalQuotedFareSource: "platform_pricing_rule",
    canonicalPricingRuleVersion: "enterprise_dispatch.default.v1",
    tenantCanSetQuotedFare: false,
  };
  const isPartnerMode =
    identity?.realm === "partner" || identity?.actorType === "partner_api_key";

  async function createBooking(formData: FormData) {
    "use server";

    const actionRoleSnapshot = await getTenantRoleSnapshot();
    requireCapability(
      actionRoleSnapshot.capabilities.canWriteTenant,
      "建立訂單需要租戶寫入權限。",
    );
    const client = await getTenantClient();
    const businessDispatchSubtype = trimFormValue(
      formData.get("businessDispatchSubtype"),
    ) as BusinessDispatchSubtype;
    const pickupAddressId = normalizeDirectorySelection(
      formData.get("pickupAddressId"),
    );
    const dropoffAddressId = normalizeDirectorySelection(
      formData.get("dropoffAddressId"),
    );
    const passengerId = normalizeDirectorySelection(
      formData.get("passengerId"),
    );
    const pickupAddress = trimFormValue(formData.get("pickupAddress"));
    const dropoffAddress = trimFormValue(formData.get("dropoffAddress"));
    const windowStartLocal = trimFormValue(
      formData.get("reservationWindowStart"),
    );
    const windowEndLocal = trimFormValue(formData.get("reservationWindowEnd"));
    const passengerName = trimFormValue(formData.get("passengerName"));
    const passengerPhone = trimFormValue(formData.get("passengerPhone"));
    const directionValue = trimFormValue(formData.get("direction"));
    const direction =
      directionValue === "pickup" || directionValue === "dropoff"
        ? directionValue
        : undefined;
    const costCenter = trimFormValue(formData.get("costCenter"));
    const vehiclePreference = trimFormValue(formData.get("vehiclePreference"));
    const flightNo = trimFormValue(formData.get("flightNo"));
    const terminal = trimFormValue(formData.get("terminal"));
    const onsiteContactName = trimFormValue(formData.get("onsiteContactName"));
    const onsiteContactPhone = trimFormValue(
      formData.get("onsiteContactPhone"),
    );
    const notes = trimFormValue(formData.get("notes"));
    const luggageCount = parseOptionalInteger(formData.get("luggageCount"));
    const minPhotoCount = parseOptionalInteger(formData.get("minPhotoCount"));
    const signoffRequired = formData.get("signoffRequired") !== null;
    const expenseProofRequired = formData.get("expenseProofRequired") !== null;

    const validationErrors: string[] = [];

    if (!BUSINESS_DISPATCH_SUBTYPES.includes(businessDispatchSubtype)) {
      validationErrors.push("請選擇支援的訂單類型。");
    }

    if (!windowStartLocal || !windowEndLocal) {
      validationErrors.push("預約時窗的開始與結束時間皆為必填。");
    } else if (
      Number.isNaN(new Date(windowStartLocal).getTime()) ||
      Number.isNaN(new Date(windowEndLocal).getTime()) ||
      new Date(windowStartLocal).getTime() >= new Date(windowEndLocal).getTime()
    ) {
      validationErrors.push("預約時窗的結束時間必須晚於開始時間。");
    }

    if (!pickupAddressId && !pickupAddress) {
      validationErrors.push("請從地址簿選擇上車地址，或手動輸入上車地址。");
    }

    if (!dropoffAddressId && !dropoffAddress) {
      validationErrors.push("請從地址簿選擇下車地址，或手動輸入下車地址。");
    }

    if (!passengerId && (!passengerName || !passengerPhone)) {
      validationErrors.push("請從乘客名冊選擇乘客，或手動提供乘客姓名與電話。");
    }

    if (
      businessDispatchSubtype === "credit_card_airport_transfer" &&
      direction === "pickup" &&
      !flightNo
    ) {
      validationErrors.push("機場接機訂單必須填寫航班號碼。");
    }

    if (
      (onsiteContactName && !onsiteContactPhone) ||
      (!onsiteContactName && onsiteContactPhone)
    ) {
      validationErrors.push("現場聯絡人姓名與電話需同時填寫，或同時留白。");
    }

    if (
      Number.isNaN(luggageCount) ||
      (luggageCount != null && luggageCount < 0)
    ) {
      validationErrors.push("行李件數必須是大於或等於 0 的整數。");
    }

    if (
      Number.isNaN(minPhotoCount) ||
      (minPhotoCount != null && (minPhotoCount < 1 || minPhotoCount > 5))
    ) {
      validationErrors.push("完成照片張數必須介於 1 到 5 張之間。");
    }

    if (validationErrors.length > 0) {
      redirectWithError(validationErrors.join(" "));
    }

    const command: CreateTenantBookingCommand = {
      businessDispatchSubtype,
      pickup: { address: pickupAddress || "" },
      dropoff: { address: dropoffAddress || "" },
      reservationWindowStart: toIsoString(windowStartLocal),
      reservationWindowEnd: toIsoString(windowEndLocal),
      passenger: {
        name: passengerName || "",
        phone: passengerPhone || "",
      },
      signoffRequired,
      expenseProofRequired,
      ...(passengerId ? { passengerId } : {}),
      ...(pickupAddressId ? { pickupAddressId } : {}),
      ...(dropoffAddressId ? { dropoffAddressId } : {}),
      ...(direction ? { direction } : {}),
      ...(costCenter ? { costCenter } : {}),
      ...(vehiclePreference ? { vehiclePreference } : {}),
      ...(flightNo ? { flightNo } : {}),
      ...(terminal ? { terminal } : {}),
      ...(luggageCount !== undefined ? { luggageCount } : {}),
      ...(notes ? { notes } : {}),
      ...(minPhotoCount !== undefined ? { minPhotoCount } : {}),
      ...(onsiteContactName && onsiteContactPhone
        ? {
            onsiteContact: {
              name: onsiteContactName,
              phone: onsiteContactPhone,
            },
          }
        : {}),
    };

    try {
      await client.createTenantBooking(command);
      revalidatePath("/booking-list");
      redirect("/booking-list");
    } catch (error) {
      const message = formatPortalUiError(
        toPortalErrorMessage(error, "未知訂單錯誤"),
        "無法建立訂單",
      );
      redirectWithError(message);
    }
  }

  return (
    <main className="app-grid" style={pageStyle}>
      <AppShellCard
        title="建立新訂單"
        description="直接送出正式的建立訂單指令建立租戶訂單，並在可用時帶入乘客與地址主檔資料。"
      >
        {formError ? (
          <div style={alertStyle}>
            <strong>送出失敗：</strong> {formError}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div style={alertStyle}>
            <strong>目前以降級模式顯示：</strong>
            <ul style={warningListStyle}>
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!roleSnapshot.capabilities.canWriteTenant ? (
          <div style={alertStyle}>
            <strong>唯讀身分：</strong> 目前後端簽發的角色可檢視訂單欄位，但不能
            送出新的租戶訂單。
          </div>
        ) : null}

        <div style={overviewGridStyle}>
          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>權限脈絡</span>
            <strong>
              {identity
                ? `${formatPortalCodeLabel(identity.actorType, identity.actorType)} · ${formatPortalCodeLabel(identity.realm, identity.realm)} 範圍`
                : "租戶啟動工作階段"}
            </strong>
            <div style={roleListStyle}>
              {(identity?.roles.length ?? 0) > 0 ? (
                identity?.roles.map((role) => (
                  <span key={role} style={badgeStyle}>
                    {formatPortalCodeLabel(role, role)}
                  </span>
                ))
              ) : (
                <span style={subtleBadgeStyle}>目前無法取得角色</span>
              )}
            </div>
            <p style={mutedNoteStyle}>
              {isPartnerMode
                ? "合作夥伴模式目前只開放建立流程；租戶管理員層級的治理操作不會在這裡顯示。"
                : "此頁只開放租戶可安全提交的建立欄位。狀態變更、派遣覆寫與車資覆寫仍保留在伺服器端治理。"}
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>計價權威</span>
            <strong>
              {formatPortalCodeLabel(
                pricingAuthority.canonicalQuotedFareSource,
                pricingAuthority.canonicalQuotedFareSource,
              )}
            </strong>
            <p style={mutedNoteStyle}>
              報價會依據目前生效的規則版本計算。租戶端可以建立訂單，但不能在此表單直接指定或覆寫車資。
            </p>
          </div>

          <div style={overviewCardStyle}>
            <span style={overviewLabelStyle}>政策說明</span>
            <strong>成本中心與佐證需求</strong>
            <p style={mutedNoteStyle}>
              成本中心目前仍以自由文字保存。簽核與報支憑證旗標會影響後續需要的
              佐證，但租戶端目前還沒有可見的核准佇列或草稿暫存指令。
            </p>
          </div>
        </div>

        <form action={createBooking} style={formStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>服務與時程</h2>
              <p style={sectionDescriptionStyle}>
                選擇訂單類型、接送方向與預約時窗，讓後端能套用正確的政策規則。
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label
                  htmlFor="businessDispatchSubtype"
                  style={fieldLabelStyle}
                >
                  訂單類型
                </label>
                <select
                  id="businessDispatchSubtype"
                  name="businessDispatchSubtype"
                  defaultValue="enterprise_dispatch"
                  style={fieldInputStyle}
                  required
                >
                  {subtypeOptions.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  {SUBTYPE_LABELS.enterprise_dispatch.guidance}{" "}
                  {SUBTYPE_LABELS.credit_card_airport_transfer.guidance}
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="direction" style={fieldLabelStyle}>
                  接送方向
                </label>
                <select
                  id="direction"
                  name="direction"
                  defaultValue="pickup"
                  style={fieldInputStyle}
                >
                  <option value="pickup">接機／接送起點</option>
                  <option value="dropoff">送機／送達目的地</option>
                </select>
                <p style={fieldHintStyle}>
                  機場接機類型的訂單必須填寫航班號碼。
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="reservationWindowStart" style={fieldLabelStyle}>
                  時窗開始
                </label>
                <input
                  id="reservationWindowStart"
                  name="reservationWindowStart"
                  type="datetime-local"
                  style={fieldInputStyle}
                  required
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="reservationWindowEnd" style={fieldLabelStyle}>
                  時窗結束
                </label>
                <input
                  id="reservationWindowEnd"
                  name="reservationWindowEnd"
                  type="datetime-local"
                  style={fieldInputStyle}
                  required
                />
              </div>
            </div>

            <div style={roleListStyle}>
              {subtypeOptions.map((subtype) => (
                <span key={subtype} style={subtleBadgeStyle}>
                  {getSubtypeLabel(subtype)}:{" "}
                  {SUBTYPE_LABELS[subtype]?.reservationPolicy ??
                    "送出後才會顯示政策時窗。"}
                </span>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>乘客選擇</h2>
              <p style={sectionDescriptionStyle}>
                優先重用乘客主檔。若資料不完整，也可改以手動欄位補齊本次訂單的
                乘客聯絡資訊。
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={fullWidthFieldStyle}>
                <label htmlFor="passengerId" style={fieldLabelStyle}>
                  乘客名冊
                </label>
                <select
                  id="passengerId"
                  name="passengerId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    手動輸入／不使用已儲存乘客
                  </option>
                  {activePassengers.map((passenger) => (
                    <option
                      key={passenger.passengerId}
                      value={passenger.passengerId}
                    >
                      {describePassenger(passenger)}
                    </option>
                  ))}
                </select>
                <p style={fieldHintStyle}>
                  目前共有 {activePassengers.length}{" "}
                  筆啟用中的乘客資料。若要補齊 缺少的手機號碼，可前往{" "}
                  <Link href="/passengers">
                    <strong>/passengers</strong>
                  </Link>{" "}
                  先修正名冊內容，再依賴主檔直接送單。
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerName" style={fieldLabelStyle}>
                  手動乘客姓名
                </label>
                <input
                  id="passengerName"
                  name="passengerName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="請輸入乘客姓名"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="passengerPhone" style={fieldLabelStyle}>
                  手動或備援電話
                </label>
                <input
                  id="passengerPhone"
                  name="passengerPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder="+886 9xx xxx xxx"
                />
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>路線與地址簿</h2>
              <p style={sectionDescriptionStyle}>
                每一站都可以引用租戶地址簿，或直接輸入新的地址。若未選擇已儲存
                地址，系統會自動改用手動輸入的文字內容。
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="pickupAddressId" style={fieldLabelStyle}>
                  上車地址簿項目
                </label>
                <select
                  id="pickupAddressId"
                  name="pickupAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    手動輸入上車地址／不使用已儲存地址
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="dropoffAddressId" style={fieldLabelStyle}>
                  下車地址簿項目
                </label>
                <select
                  id="dropoffAddressId"
                  name="dropoffAddressId"
                  defaultValue={MANUAL_ENTRY}
                  style={fieldInputStyle}
                >
                  <option value={MANUAL_ENTRY}>
                    手動輸入下車地址／不使用已儲存地址
                  </option>
                  {activeAddresses.map((address) => (
                    <option key={address.addressId} value={address.addressId}>
                      {describeAddress(address, passengerNameById)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="pickupAddress" style={fieldLabelStyle}>
                  手動上車地址
                </label>
                <textarea
                  id="pickupAddress"
                  name="pickupAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder="未使用地址簿時，請輸入上車地址。"
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="dropoffAddress" style={fieldLabelStyle}>
                  手動下車地址
                </label>
                <textarea
                  id="dropoffAddress"
                  name="dropoffAddress"
                  rows={3}
                  style={fieldInputStyle}
                  placeholder="未使用地址簿時，請輸入下車地址。"
                />
              </div>
            </div>

            <p style={fieldHintStyle}>
              目前共有 {activeAddresses.length} 筆啟用中的地址資料。可前往{" "}
              <Link href="/addresses">
                <strong>/addresses</strong>
              </Link>{" "}
              維護地址擁有者、標籤與地理資訊品質。
            </p>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>政策與服務屬性</h2>
              <p style={sectionDescriptionStyle}>
                這些欄位用來補充履約情境，但不會暴露屬於定價、核准或派遣端的管理
                權限。
              </p>
            </div>

            <div style={inputGridStyle}>
              <div style={formFieldStyle}>
                <label htmlFor="costCenter" style={fieldLabelStyle}>
                  成本中心
                </label>
                <input
                  id="costCenter"
                  name="costCenter"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="例如：行政差旅／總務中心"
                />
                <p style={fieldHintStyle}>
                  目前仍以自由文字保存，尚未接上伺服器端成本中心目錄或額度查詢。
                </p>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="vehiclePreference" style={fieldLabelStyle}>
                  車型偏好
                </label>
                <input
                  id="vehiclePreference"
                  name="vehiclePreference"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="例如：轎車、廂型車、無障礙車"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="flightNo" style={fieldLabelStyle}>
                  航班號碼
                </label>
                <input
                  id="flightNo"
                  name="flightNo"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="CI101 / BR18"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="terminal" style={fieldLabelStyle}>
                  航廈／集合點
                </label>
                <input
                  id="terminal"
                  name="terminal"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="例如：T1／T2／入境大廳 B"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="luggageCount" style={fieldLabelStyle}>
                  行李件數
                </label>
                <input
                  id="luggageCount"
                  name="luggageCount"
                  type="number"
                  min={0}
                  step={1}
                  style={fieldInputStyle}
                  placeholder="0"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="minPhotoCount" style={fieldLabelStyle}>
                  最少完成照片
                </label>
                <select
                  id="minPhotoCount"
                  name="minPhotoCount"
                  defaultValue="1"
                  style={fieldInputStyle}
                >
                  <option value="1">1 張</option>
                  <option value="2">2 張</option>
                  <option value="3">3 張</option>
                  <option value="4">4 張</option>
                  <option value="5">5 張</option>
                </select>
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactName" style={fieldLabelStyle}>
                  現場聯絡人姓名
                </label>
                <input
                  id="onsiteContactName"
                  name="onsiteContactName"
                  type="text"
                  style={fieldInputStyle}
                  placeholder="例如：大廳接待／活動窗口"
                />
              </div>

              <div style={formFieldStyle}>
                <label htmlFor="onsiteContactPhone" style={fieldLabelStyle}>
                  現場聯絡人電話
                </label>
                <input
                  id="onsiteContactPhone"
                  name="onsiteContactPhone"
                  type="tel"
                  style={fieldInputStyle}
                  placeholder="+886 9xx xxx xxx"
                />
              </div>

              <div style={fullWidthFieldStyle}>
                <label htmlFor="notes" style={fieldLabelStyle}>
                  備註
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  style={fieldInputStyle}
                  placeholder="可填寫抵達指示、門禁限制、乘客偏好或其他租戶端可提交的備註。"
                />
              </div>
            </div>

            <div style={checkboxStackStyle}>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="signoffRequired" />
                <span>
                  需要現場簽收。這會提高後續完成證明要求，但不會另外開啟租戶端
                  核准佇列。
                </span>
              </label>
              <label style={checkboxRowStyle}>
                <input type="checkbox" name="expenseProofRequired" />
                <span>需要報支憑證，供後續代墊或財務追蹤使用。</span>
              </label>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>送出流程</h2>
              <p style={sectionDescriptionStyle}>
                送出後會直接建立正式訂單。目前契約沒有安全的草稿指令，因此刻意不提供暫存草稿功能。
              </p>
            </div>

            <div style={footerStyle}>
              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={!roleSnapshot.capabilities.canWriteTenant}
              >
                送出訂單
              </button>
              <Link className="route-link" href="/booking-list">
                <strong>返回訂單列表</strong>
                回到租戶訂單清單。
              </Link>
            </div>

            <p style={mutedNoteStyle}>
              草稿暫存、核准路由選擇與成本中心目錄查詢仍屬後端待補項目。這份
              表單只負責呈現目前已有正式契約支援的建立流程。
            </p>
          </section>
        </form>
      </AppShellCard>
    </main>
  );
}
