import React, { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { RatePassengerRideCommand } from "@drts/contracts";
import type { NativePassengerRidePresentation } from "@drts/passenger-client";
import { getPassengerTrackingMapPositions } from "@drts/passenger-client";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";

/** Actual API, navigation, platform telephone and authorized binary ports. */
export interface NativeP5ScreenActions {
  retryAuthority(): Promise<void>;
  retryReceipt(): Promise<void>;
  requestCancel(): Promise<void>;
  submitRating(command: RatePassengerRideCommand): Promise<void>;
  downloadReceipt(input: {
    format: "html" | "pdf";
    url: string;
  }): Promise<void>;
  contactSupport(): void | Promise<void>;
  openSupport(category: "service" | "lost_item"): void | Promise<void>;
  openHistory(): void | Promise<void>;
}

export interface NativeP5ScreenProps {
  presentation: NativePassengerRidePresentation;
  actions: NativeP5ScreenActions;
  /** The App owns the native map surface; an absent map has an honest fallback. */
  renderMap?: (
    presentation: NativePassengerRidePresentation,
  ) => React.ReactNode;
}

function ActionButton({
  id,
  label,
  onPress,
  disabled = false,
}: {
  id: string;
  label: string;
  onPress(): void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.disabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function useActionFeedback() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => void | Promise<void>): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "操作未完成，請重試。",
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error };
}

function ErrorFeedback({ message }: { message: string | null }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.error}
    >
      {message}
    </Text>
  ) : null;
}

function RatingCard({
  presentation,
  actions,
}: Pick<NativeP5ScreenProps, "presentation" | "actions">) {
  const fixture = presentation.fixture;
  const [score, setScore] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [contactRequested, setContactRequested] = useState(true);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const feedback = useActionFeedback();

  if (
    fixture.screenId === "P5-09" ||
    fixture.ratingSummary?.state === "rated"
  ) {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>評價已送出</Text>
        <Text style={styles.text}>{fixture.ratingSummary?.scoreText}</Text>
      </View>
    );
  }
  if (!fixture.canRate || !fixture.ratingSummary) return null;
  if (submittedScore !== null) {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>評價已送出</Text>
        <Text style={styles.text}>{submittedScore} 星</Text>
      </View>
    );
  }
  async function submit() {
    const command: RatePassengerRideCommand = {
      rideId: fixture.token,
      rating: score,
      ...(tags.length ? { tags: [...tags] } : {}),
      ...(comment ? { comments: comment } : {}),
      contactRequested: score <= 2 ? contactRequested : false,
    };
    if (await feedback.run(() => actions.submitRating(command))) {
      setSubmittedScore(score);
    }
  }
  return (
    <View testID="native-rating-card" style={styles.card}>
      <Text style={styles.heading}>請為本趟服務評分</Text>
      <View style={styles.row}>
        {([1, 2, 3, 4, 5] as const).map((value) => (
          <Pressable
            key={value}
            testID={"native-score-" + value}
            accessibilityRole="radio"
            accessibilityLabel={value + " 星"}
            accessibilityState={{
              selected: score === value,
              disabled: feedback.busy,
            }}
            disabled={feedback.busy}
            onPress={() => setScore(value)}
            style={styles.choice}
          >
            <Text style={styles.text}>{value} 星</Text>
          </Pressable>
        ))}
      </View>
      {(fixture.ratingSummary.chips || []).map((tag) => (
        <Pressable
          key={tag}
          testID={"native-rating-tag-" + tag}
          accessibilityRole="checkbox"
          accessibilityLabel={tag}
          accessibilityState={{
            checked: tags.includes(tag),
            disabled: feedback.busy,
          }}
          disabled={feedback.busy}
          onPress={() =>
            setTags((current) =>
              current.includes(tag)
                ? current.filter((item) => item !== tag)
                : [...current, tag],
            )
          }
          style={styles.choice}
        >
          <Text style={styles.text}>{tag}</Text>
        </Pressable>
      ))}
      <TextInput
        testID="native-rating-comment"
        accessibilityLabel="評價內容"
        value={comment}
        onChangeText={setComment}
        editable={!feedback.busy}
        multiline
        maxLength={200}
        style={styles.input}
      />
      {score <= 2 ? (
        <Pressable
          testID="native-rating-contact"
          accessibilityRole="checkbox"
          accessibilityLabel="希望客服聯絡我"
          accessibilityState={{
            checked: contactRequested,
            disabled: feedback.busy,
          }}
          disabled={feedback.busy}
          onPress={() => setContactRequested((current) => !current)}
          style={styles.choice}
        >
          <Text style={styles.text}>希望客服聯絡我</Text>
        </Pressable>
      ) : null}
      <ErrorFeedback message={feedback.error} />
      <ActionButton
        id="native-submit-rating"
        label="送出評價"
        onPress={submit}
        disabled={feedback.busy}
      />
    </View>
  );
}

function ReceiptCard({
  presentation,
  actions,
}: Pick<NativeP5ScreenProps, "presentation" | "actions">) {
  const certificate = presentation.fixture.certificate;
  const feedback = useActionFeedback();
  if (!certificate) return null;
  if (certificate.state !== "available") {
    return (
      <View testID="native-receipt-card" style={styles.card}>
        <Text style={styles.heading}>乘車證明</Text>
        <Text style={styles.text}>
          {certificate.state === "pending"
            ? "乘車證明準備中，請稍後重試。"
            : "乘車證明資料尚未齊全，請重試或聯絡客服。"}
        </Text>
        <ErrorFeedback message={feedback.error} />
        <ActionButton
          id="native-retry-receipt"
          label="重試乘車證明"
          onPress={() =>
            feedback.run(() => actions.retryReceipt()).then(() => undefined)
          }
          disabled={feedback.busy}
        />
      </View>
    );
  }
  const formats = presentation.receiptFormats;
  return (
    <View testID="native-receipt-card" style={styles.card}>
      <Text style={styles.heading}>乘車證明</Text>
      {(certificate.rows || []).map((row, index) => (
        <View key={row.label + index} style={styles.factRow}>
          <Text style={styles.muted}>{row.label}</Text>
          <Text style={styles.text}>{row.value}</Text>
        </View>
      ))}
      <ErrorFeedback message={feedback.error} />
      {formats.includes("html") && certificate.htmlUrl ? (
        <ActionButton
          id="native-download-html"
          label="下載 HTML 乘車證明"
          disabled={feedback.busy}
          onPress={() =>
            feedback
              .run(() =>
                actions.downloadReceipt({
                  format: "html",
                  url: certificate.htmlUrl!,
                }),
              )
              .then(() => undefined)
          }
        />
      ) : null}
      {formats.includes("pdf") && certificate.pdfUrl ? (
        <ActionButton
          id="native-download-pdf"
          label="下載 PDF 乘車證明"
          disabled={feedback.busy}
          onPress={() =>
            feedback
              .run(() =>
                actions.downloadReceipt({
                  format: "pdf",
                  url: certificate.pdfUrl!,
                }),
              )
              .then(() => undefined)
          }
        />
      ) : (
        <Text style={styles.muted}>目前未提供 PDF 下載。</Text>
      )}
    </View>
  );
}

function NativeP5ScreenBody({
  presentation,
  actions,
  renderMap,
}: NativeP5ScreenProps) {
  const fixture = presentation.fixture;
  const positions = getPassengerTrackingMapPositions(fixture);
  const feedback = useActionFeedback();
  const support = (
    <View style={styles.card}>
      <ActionButton
        id="native-contact-support"
        label="聯絡客服"
        disabled={feedback.busy}
        onPress={() =>
          feedback.run(() => actions.contactSupport()).then(() => undefined)
        }
      />
      <ActionButton
        id="native-open-complaint"
        label="客訴"
        disabled={feedback.busy}
        onPress={() =>
          feedback
            .run(() => actions.openSupport("service"))
            .then(() => undefined)
        }
      />
      <ActionButton
        id="native-open-lost-item"
        label="遺失物申報"
        disabled={feedback.busy}
        onPress={() =>
          feedback
            .run(() => actions.openSupport("lost_item"))
            .then(() => undefined)
        }
      />
      <ActionButton
        id="native-open-history"
        label="行程紀錄"
        disabled={feedback.busy}
        onPress={() =>
          feedback.run(() => actions.openHistory()).then(() => undefined)
        }
      />
    </View>
  );

  // Early terminal branch is deliberate: retained assignment facts do not render
  // an active map, ETA/fare, cancellation/fee promise or an authority retry.
  if (
    presentation.contentKind === "cancelled_terminal" ||
    fixture.status === "行程已取消"
  ) {
    return (
      <ScrollView testID="native-p5-screen" style={styles.page}>
        <View testID="native-cancelled-card" style={styles.card}>
          <Text style={styles.heading}>行程已取消</Text>
          <Text style={styles.text}>{fixture.orderNo}</Text>
          <Text style={styles.text}>{fixture.cancelledAtText}</Text>
          <Text style={styles.text}>{fixture.pickupLabel}</Text>
          <Text style={styles.text}>{fixture.dropoffLabel}</Text>
        </View>
        {support}
        <ErrorFeedback message={feedback.error} />
      </ScrollView>
    );
  }

  const completed =
    fixture.screenId === "P5-08" || fixture.screenId === "P5-09";
  const receiptOnly = fixture.screenId === "P5-10";
  const disclosureUnavailable = fixture.screenId === "P5-11";
  const fareOnly = fixture.screenId === "A03";
  const showTrip =
    !completed && !receiptOnly && !fareOnly && !disclosureUnavailable;
  return (
    <ScrollView testID="native-p5-screen" style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.heading}>{fixture.status}</Text>
        <Text style={styles.text}>{fixture.orderNo}</Text>
        <Text style={styles.text}>{fixture.requestedPickupText}</Text>
        <Text style={styles.text}>{fixture.pickupLabel}</Text>
        <Text style={styles.text}>{fixture.dropoffLabel}</Text>
      </View>
      {disclosureUnavailable ? (
        <View style={styles.card}>
          <Text style={styles.text}>
            系統正在重新確認車輛與駕駛資料，尚未完成指派。
          </Text>
        </View>
      ) : null}
      {fixture.screenId === "P5-04" && (
        <Text style={styles.text}>
          正在重新安排車輛，請以最新指派資料為準。
        </Text>
      )}
      {fixture.screenId === "P5-05" && (
        <Text style={styles.text}>車輛與司機已更新，請確認最新車牌。</Text>
      )}
      {!!fixture.contactSafetyNote && (
        <Text style={styles.text}>{fixture.contactSafetyNote}</Text>
      )}
      {showTrip ? (
        <View testID="native-active-trip" style={styles.card}>
          {fixture.status !== "行程已完成" ? (
            <View testID="native-trip-map">
              {renderMap ? (
                renderMap(presentation)
              ) : positions ? (
                <View
                  accessibilityLabel="司機位置示意"
                  testID="native-live-position-diagram"
                  style={{
                    height: 150,
                    position: "relative",
                    backgroundColor: p5.bg,
                  }}
                >
                  <View
                    testID="native-live-driver-position"
                    style={{
                      position: "absolute",
                      left: `${positions.driver.x}%`,
                      top: `${positions.driver.y}%`,
                    }}
                  >
                    <Text>車</Text>
                  </View>
                  <View
                    style={{
                      position: "absolute",
                      left: `${positions.target.x}%`,
                      top: `${positions.target.y}%`,
                    }}
                  >
                    <Text>{positions.targetLabel}</Text>
                  </View>
                  <Text style={{ position: "absolute", bottom: 0 }}>
                    位置示意
                  </Text>
                </View>
              ) : (
                <Text style={styles.muted}>地圖暫時無法使用。</Text>
              )}
            </View>
          ) : null}
          <Text style={styles.text}>{fixture.statusSubline}</Text>
          {fixture.etaMain ? (
            <Text testID="native-active-eta" style={styles.text}>
              {fixture.etaMain}
            </Text>
          ) : null}
          {presentation.location.state === "fresh" ? (
            <Text style={styles.muted}>
              位置更新於 {presentation.location.elapsedSeconds} 秒前
            </Text>
          ) : presentation.location.state === "stale" ? (
            <Text style={styles.muted}>司機位置更新稍有延遲</Text>
          ) : null}
          {fixture.driver.name ? (
            <Text style={styles.text}>{fixture.driver.name}</Text>
          ) : null}
          {fixture.driver.vehicle ? (
            <Text style={styles.text}>{fixture.driver.vehicle}</Text>
          ) : null}
          {fixture.driver.plateNo ? (
            <Text style={styles.text}>{fixture.driver.plateNo}</Text>
          ) : null}
          {!!fixture.driver.color && (
            <Text style={styles.text}>{fixture.driver.color}</Text>
          )}
          {fixture.assignment?.vehicle && (
            <Text style={styles.text}>
              {fixture.assignment.vehicle.modelYear} 年出廠 ·{" "}
              {fixture.assignment.vehicle.doorCount} 門
            </Text>
          )}
          {!!fixture.driver.registrationMaskedDisplay && (
            <Text style={styles.text}>
              執登證號：{fixture.driver.registrationMaskedDisplay}
            </Text>
          )}
          {!!fixture.driver.registrationEffectiveUntil && (
            <Text style={styles.text}>
              有效期限：{fixture.driver.registrationEffectiveUntil}
            </Text>
          )}
          {fixture.assignment?.rating && (
            <Text testID="native-driver-rating" style={styles.text}>
              {fixture.assignment.rating.displayState === "new_driver"
                ? "新司機，尚無評價"
                : `${fixture.assignment.rating.averageRating == null ? "評價資料未提供" : fixture.assignment.rating.averageRating.toFixed(1)} · ${fixture.assignment.rating.ratingCount} 則評價`}
            </Text>
          )}
          {fixture.seatbeltNotice ? (
            <Text style={styles.text}>乘車請繫妥安全帶。</Text>
          ) : null}
        </View>
      ) : null}
      {!receiptOnly && !disclosureUnavailable ? (
        <View testID="native-fare-card" style={styles.card}>
          <Text style={styles.text}>
            {fixture.routeFareText || "車資資料尚未提供"}
          </Text>
          {fixture.routeFareHint ? (
            <Text style={styles.muted}>{fixture.routeFareHint}</Text>
          ) : null}
        </View>
      ) : null}
      {fixture.screenId === "A04" ? (
        <View testID="native-a04-card" style={styles.card}>
          <Text style={styles.text}>請稍後重試或聯絡客服。</Text>
          <ActionButton
            id="native-retry-authority"
            label="重新確認行程"
            disabled={feedback.busy}
            onPress={() =>
              feedback.run(() => actions.retryAuthority()).then(() => undefined)
            }
          />
        </View>
      ) : null}
      {fixture.payment ? (
        <View testID="native-payment-card" style={styles.card}>
          <Text style={styles.heading}>{fixture.payment.label}</Text>
          <Text style={styles.text}>{fixture.payment.detail}</Text>
          <Text style={styles.text}>{fixture.payment.amountText}</Text>
        </View>
      ) : null}
      {completed ? (
        <RatingCard
          key={fixture.token}
          presentation={presentation}
          actions={actions}
        />
      ) : null}
      <ReceiptCard presentation={presentation} actions={actions} />
      {fixture.canCancel ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{fixture.cancelNote}</Text>
          <ActionButton
            id="native-cancel-ride"
            label="取消行程"
            disabled={feedback.busy}
            onPress={() =>
              feedback.run(actions.requestCancel).then(() => undefined)
            }
          />
        </View>
      ) : null}
      {!fareOnly ? support : null}
      <ErrorFeedback message={feedback.error} />
    </ScrollView>
  );
}

/** Controlled production view; real authority/stream/download work stays in ports. */
export function NativeP5Screen(props: NativeP5ScreenProps) {
  return (
    <NativeP5ScreenBody key={props.presentation.fixture.token} {...props} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p5.bg },
  card: {
    margin: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: p5.surface,
    borderWidth: 1,
    borderColor: p5.line,
  },
  heading: { fontSize: 18, fontWeight: "700", color: p5.ink, marginBottom: 8 },
  text: { fontSize: 14, color: p5.ink, marginVertical: 3 },
  muted: { fontSize: 13, color: p5.mut, marginVertical: 3 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  factRow: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: p5.lineSoft,
  },
  choice: {
    padding: 10,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: p5.line,
  },
  input: {
    minHeight: 72,
    padding: 10,
    color: p5.ink,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 8,
  },
  button: {
    padding: 12,
    marginVertical: 5,
    borderRadius: 10,
    backgroundColor: p5.brandBg,
  },
  buttonText: { fontSize: 14, fontWeight: "600", color: p5.brand },
  disabled: { opacity: 0.5 },
  error: { color: p5.danger, marginVertical: 6 },
});
