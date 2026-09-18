import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tokens } from "@/components/ui/tokens";
import { ActionButton } from "@/components/ui/ActionButton";
import type {
  AcademyCourseDetail,
  QuizSubmissionAnswer,
  QuizSubmissionCommand,
} from "./types";

interface QuizRunnerProps {
  course: AcademyCourseDetail;
  onSubmit: (command: QuizSubmissionCommand) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function QuizRunner({
  course,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const questions = course.questions;
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;

  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
    setValidationError(null);
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    // Validate all questions are answered
    const unansweredQuestions = questions.filter(
      (q) => !answers[q.questionId],
    );

    if (unansweredQuestions.length > 0) {
      setValidationError(
        `尚有 ${unansweredQuestions.length} 題未作答，請完成所有題目後再提交。`,
      );
      return;
    }

    const submissionAnswers: QuizSubmissionAnswer[] = questions.map((q) => ({
      questionId: q.questionId,
      selectedOptionId: answers[q.questionId]!,
    }));

    await onSubmit({
      courseVersion: course.version,
      answers: submissionAnswers,
    });
  };

  if (!currentQuestion) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>本課程目前無測驗題目</Text>
        <ActionButton title="返回" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Quiz Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>✕ 放棄測驗</Text>
          </Pressable>
          <Text style={styles.progressText}>
            作答進度：{answeredCount} / {totalQuestions}
          </Text>
        </View>

        <Text style={styles.courseTitle}>{course.title} · 結訓測驗</Text>
        <Text style={styles.passingRequirement}>
          及格標準：{course.passingScore} 分 · 需答對相應題數以獲取完訓資格
        </Text>

        {/* Question jumper indicators */}
        <View style={styles.jumperRow}>
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const isAnswered = Boolean(answers[q.questionId]);
            return (
              <Pressable
                key={q.questionId}
                style={[
                  styles.jumperDot,
                  isCurrent && styles.jumperDotCurrent,
                  isAnswered && !isCurrent && styles.jumperDotAnswered,
                ]}
                onPress={() => setCurrentIndex(idx)}
              >
                <Text
                  style={[
                    styles.jumperDotText,
                    isCurrent && styles.jumperDotTextCurrent,
                    isAnswered && !isCurrent && styles.jumperDotTextAnswered,
                  ]}
                >
                  {idx + 1}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {validationError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{validationError}</Text>
        </View>
      )}

      {/* Question Card */}
      <View style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <View style={styles.questionBadge}>
            <Text style={styles.questionBadgeText}>
              第 {currentIndex + 1} 題
            </Text>
          </View>
          <Text style={styles.questionIdText}>ID: {currentQuestion.questionId}</Text>
        </View>

        <Text style={styles.questionPrompt}>{currentQuestion.prompt}</Text>

        {/* Options List */}
        <View style={styles.optionsList}>
          {currentQuestion.options.map((opt) => {
            const isSelected =
              answers[currentQuestion.questionId] === opt.optionId;
            return (
              <Pressable
                key={opt.optionId}
                style={[
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                ]}
                onPress={() =>
                  handleSelectOption(currentQuestion.questionId, opt.optionId)
                }
              >
                <View
                  style={[
                    styles.radioCircle,
                    isSelected && styles.radioCircleSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Navigation & Submit Buttons */}
      <View style={styles.buttonRow}>
        <ActionButton
          title="上一題"
          variant="secondary"
          disabled={currentIndex === 0 || isSubmitting}
          onPress={handlePrevious}
        />

        {currentIndex < totalQuestions - 1 ? (
          <ActionButton
            title="下一題"
            variant="primary"
            disabled={isSubmitting}
            onPress={handleNext}
          />
        ) : (
          <ActionButton
            title={isSubmitting ? "交卷評分中..." : "確認交卷"}
            variant="primary"
            disabled={isSubmitting}
            onPress={handleSubmit}
          />
        )}
      </View>

      {isSubmitting && (
        <View style={styles.submittingIndicator}>
          <ActivityIndicator color={Tokens.colors.brandHi} />
          <Text style={styles.submittingText}>
            正在將作答結果送交權威後端進行真實評分與記錄...
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  emptyContainer: {
    padding: Tokens.spacing.xxl,
    alignItems: "center",
    gap: Tokens.spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Tokens.colors.textMuted,
  },
  headerCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cancelButton: {
    paddingVertical: Tokens.spacing.xs,
  },
  cancelText: {
    fontSize: 12,
    color: Tokens.colors.danger,
    fontWeight: "600",
  },
  progressText: {
    fontSize: 12,
    fontFamily: Tokens.fonts.mono,
    color: Tokens.colors.textMuted,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  passingRequirement: {
    fontSize: 12,
    color: Tokens.colors.brandHi,
  },
  jumperRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
    marginTop: Tokens.spacing.xs,
  },
  jumperDot: {
    width: 28,
    height: 28,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.surfaceLo,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  jumperDotCurrent: {
    backgroundColor: Tokens.colors.brandBg,
    borderColor: Tokens.colors.brandHi,
  },
  jumperDotAnswered: {
    backgroundColor: Tokens.colors.surfaceHi,
    borderColor: Tokens.colors.success,
  },
  jumperDotText: {
    fontSize: 11,
    fontWeight: "600",
    color: Tokens.colors.textMuted,
  },
  jumperDotTextCurrent: {
    color: Tokens.colors.brandHi,
    fontWeight: "700",
  },
  jumperDotTextAnswered: {
    color: Tokens.colors.success,
  },
  errorCard: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: Tokens.colors.danger,
    borderWidth: 1,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.md,
  },
  errorText: {
    fontSize: 12,
    color: Tokens.colors.danger,
    fontWeight: "500",
  },
  questionCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  questionBadge: {
    backgroundColor: Tokens.colors.brandBg,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.brandHi,
  },
  questionBadgeText: {
    fontSize: 11,
    color: Tokens.colors.brandHi,
    fontWeight: "700",
  },
  questionIdText: {
    fontSize: 11,
    fontFamily: Tokens.fonts.mono,
    color: Tokens.colors.textDim,
  },
  questionPrompt: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  optionsList: {
    gap: Tokens.spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceLo,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  optionRowSelected: {
    backgroundColor: Tokens.colors.brandBg,
    borderColor: Tokens.colors.brandHi,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Tokens.colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: Tokens.colors.brandHi,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Tokens.colors.brandHi,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: Tokens.colors.text,
    lineHeight: 20,
  },
  optionTextSelected: {
    color: Tokens.colors.text,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Tokens.spacing.md,
    marginTop: Tokens.spacing.sm,
  },
  submittingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.sm,
    padding: Tokens.spacing.md,
  },
  submittingText: {
    fontSize: 12,
    color: Tokens.colors.textMuted,
  },
});
