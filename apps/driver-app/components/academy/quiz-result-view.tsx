import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Tokens } from "@/components/ui/tokens";
import { ActionButton } from "@/components/ui/ActionButton";
import type { DriverQuizAttemptDetail, QuizResultRecord } from "./types";

interface QuizResultViewProps {
  result: QuizResultRecord | DriverQuizAttemptDetail;
  passingScore: number;
  onRetake: () => void;
  onBackToCourses: () => void;
}

export function QuizResultView({
  result,
  passingScore,
  onRetake,
  onBackToCourses,
}: QuizResultViewProps) {
  const isPassed = result.passed;
  const answersSummary =
    "answersSummary" in result ? result.answersSummary : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Result Status Banner Card */}
      <View
        style={[
          styles.resultCard,
          {
            borderColor: isPassed
              ? Tokens.colors.success
              : Tokens.colors.danger,
            backgroundColor: isPassed
              ? Tokens.colors.successBg
              : Tokens.colors.dangerBg,
          },
        ]}
      >
        <Text
          style={[
            styles.resultTitle,
            {
              color: isPassed
                ? Tokens.colors.success
                : Tokens.colors.danger,
            },
          ]}
        >
          {isPassed ? "測驗合格！完訓認證完成" : "未達標準，測驗未通過"}
        </Text>

        <View style={styles.scoreRow}>
          <Text
            style={[
              styles.scoreNumber,
              {
                color: isPassed
                  ? Tokens.colors.success
                  : Tokens.colors.danger,
              },
            ]}
          >
            {result.score}
          </Text>
          <Text style={styles.scoreTotal}>/ 100 分</Text>
        </View>

        <Text style={styles.scoreSubtext}>
          及格門檻：{passingScore} 分 · 判定狀態：
          {isPassed ? " 合格 (Passed)" : " 未通過 (Failed)"}
        </Text>

        <Text style={styles.resultMessage}>
          {isPassed
            ? "您的測驗成績已正式寫入權威資料庫，車行完訓看板已即時同步此項合格證據，保障您派車服務資格。"
            : "本次測驗成績未達及格標準，未具備完訓資格。請再次研讀課程教材或 SOP 指引後重新作答。"}
        </Text>
      </View>

      {/* Audit Evidence Card */}
      <View style={styles.evidenceCard}>
        <Text style={styles.evidenceCardTitle}>作答憑據與稽核資訊</Text>

        <View style={styles.evidenceRow}>
          <Text style={styles.evidenceLabel}>歷程編號 (Attempt ID)：</Text>
          <Text style={styles.evidenceValueMono}>{result.attemptId}</Text>
        </View>

        <View style={styles.evidenceRow}>
          <Text style={styles.evidenceLabel}>課程代碼：</Text>
          <Text style={styles.evidenceValue}>
            {result.courseId} (v{result.courseVersion})
          </Text>
        </View>

        <View style={styles.evidenceRow}>
          <Text style={styles.evidenceLabel}>測驗時間：</Text>
          <Text style={styles.evidenceValue}>{result.attemptedAt}</Text>
        </View>

        {result.feedback && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackTitle}>評分評語：</Text>
            <Text style={styles.feedbackText}>{result.feedback}</Text>
          </View>
        )}
      </View>

      {/* Answers Breakdown if present */}
      {answersSummary && answersSummary.length > 0 && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>題目檢討明細</Text>
          <View style={styles.breakdownList}>
            {answersSummary.map((ans, idx) => (
              <View key={ans.questionId} style={styles.breakdownItem}>
                <View style={styles.breakdownItemHeader}>
                  <Text style={styles.breakdownQuestionText}>
                    第 {idx + 1} 題 ({ans.questionId})
                  </Text>
                  <View
                    style={[
                      styles.correctBadge,
                      {
                        backgroundColor: ans.isCorrect
                          ? Tokens.colors.successBg
                          : Tokens.colors.dangerBg,
                        borderColor: ans.isCorrect
                          ? Tokens.colors.success
                          : Tokens.colors.danger,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.correctBadgeText,
                        {
                          color: ans.isCorrect
                            ? Tokens.colors.success
                            : Tokens.colors.danger,
                        },
                      ]}
                    >
                      {ans.isCorrect ? "正解" : "錯誤"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.breakdownOptionText}>
                  選答選項：{ans.selectedOptionId}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        {!isPassed ? (
          <>
            <ActionButton
              title="重新測驗"
              variant="primary"
              onPress={onRetake}
            />
            <ActionButton
              title="返回課程列表"
              variant="secondary"
              onPress={onBackToCourses}
            />
          </>
        ) : (
          <ActionButton
            title="完成並返回課程列表"
            variant="primary"
            onPress={onBackToCourses}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  resultCard: {
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    padding: Tokens.spacing.xl,
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Tokens.spacing.xs,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: "800",
    fontFamily: Tokens.fonts.mono,
  },
  scoreTotal: {
    fontSize: 16,
    color: Tokens.colors.textMuted,
    fontFamily: Tokens.fonts.mono,
  },
  scoreSubtext: {
    fontSize: 13,
    color: Tokens.colors.textMuted,
  },
  resultMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: Tokens.colors.text,
    textAlign: "center",
    marginTop: Tokens.spacing.sm,
  },
  evidenceCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  evidenceCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Tokens.colors.text,
    marginBottom: Tokens.spacing.xs,
  },
  evidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  evidenceLabel: {
    fontSize: 12,
    color: Tokens.colors.textMuted,
  },
  evidenceValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  evidenceValueMono: {
    fontSize: 11,
    fontFamily: Tokens.fonts.mono,
    color: Tokens.colors.brandHi,
    fontWeight: "600",
  },
  feedbackBox: {
    marginTop: Tokens.spacing.xs,
    padding: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.sm,
  },
  feedbackTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Tokens.colors.textMuted,
  },
  feedbackText: {
    fontSize: 12,
    color: Tokens.colors.text,
    marginTop: 2,
  },
  breakdownCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  breakdownList: {
    gap: Tokens.spacing.xs,
  },
  breakdownItem: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.sm,
    gap: 4,
  },
  breakdownItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownQuestionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  correctBadge: {
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
  },
  correctBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  breakdownOptionText: {
    fontSize: 11,
    color: Tokens.colors.textMuted,
    fontFamily: Tokens.fonts.mono,
  },
  actionsRow: {
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.xxl,
  },
});
