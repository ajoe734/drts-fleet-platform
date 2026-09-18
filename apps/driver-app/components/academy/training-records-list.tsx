import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tokens } from "@/components/ui/tokens";
import {
  formatTrainingStatusLabel,
  type DriverTrainingRecord,
  type TrainingStatus,
} from "./types";

interface TrainingRecordsListProps {
  records: DriverTrainingRecord[];
  onSelectCourse?: (courseId: string) => void;
}

function getStatusStyle(status: TrainingStatus) {
  switch (status) {
    case "passed":
      return {
        bg: Tokens.colors.successBg,
        fg: Tokens.colors.success,
        border: Tokens.colors.success,
      };
    case "failed":
      return {
        bg: Tokens.colors.dangerBg,
        fg: Tokens.colors.danger,
        border: Tokens.colors.danger,
      };
    case "expired":
      return {
        bg: Tokens.colors.warnBg,
        fg: Tokens.colors.warn,
        border: Tokens.colors.warn,
      };
    case "in_progress":
      return {
        bg: Tokens.colors.infoBg,
        fg: Tokens.colors.info,
        border: Tokens.colors.info,
      };
    case "not_started":
    default:
      return {
        bg: Tokens.colors.surfaceLo,
        fg: Tokens.colors.textMuted,
        border: Tokens.colors.border,
      };
  }
}

export function TrainingRecordsList({
  records,
  onSelectCourse,
}: TrainingRecordsListProps) {
  if (records.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>尚無完訓紀錄</Text>
        <Text style={styles.emptySubtitle}>
          請前往「課程專區」研讀教材並完成線上測驗，通過後將自動列入權威完訓證明。
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {records.map((rec) => {
        const statusStyle = getStatusStyle(rec.status);
        return (
          <Pressable
            key={rec.recordId || `${rec.driverId}_${rec.courseId}`}
            style={({ pressed }) => [
              styles.card,
              pressed && Boolean(onSelectCourse) && styles.cardPressed,
            ]}
            onPress={() => onSelectCourse?.(rec.courseId)}
            disabled={!onSelectCourse}
          >
            <View style={styles.topRow}>
              <View style={styles.codeWrap}>
                <Text style={styles.courseCode}>{rec.courseCode}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusStyle.bg,
                    borderColor: statusStyle.border,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: statusStyle.fg }]}>
                  {formatTrainingStatusLabel(rec.status)}
                </Text>
              </View>
            </View>

            <Text style={styles.title}>{rec.courseTitle}</Text>

            <View style={styles.scoreRow}>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreLabel}>最高得分：</Text>
                <Text
                  style={[
                    styles.scoreValue,
                    {
                      color:
                        rec.highestScore !== null && rec.highestScore >= 80
                          ? Tokens.colors.success
                          : Tokens.colors.text,
                    },
                  ]}
                >
                  {rec.highestScore !== null ? `${rec.highestScore} 分` : "—"}
                </Text>
              </View>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreLabel}>測驗次數：</Text>
                <Text style={styles.scoreValue}>{rec.attemptsCount} 次</Text>
              </View>
            </View>

            {rec.isOverdue && (
              <View style={styles.overdueBanner}>
                <Text style={styles.overdueText}>
                  ⚠️ 完訓已逾期，需重新測驗以維持派車服務資格
                </Text>
              </View>
            )}

            <View style={styles.footerRow}>
              <Text style={styles.dateText}>
                完訓：
                {rec.completedAt
                  ? new Date(rec.completedAt).toLocaleDateString("zh-TW")
                  : "未完訓"}
              </Text>
              {rec.expiresAt && (
                <Text style={styles.dateText}>
                  到期：{new Date(rec.expiresAt).toLocaleDateString("zh-TW")}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Tokens.spacing.md,
  },
  emptyContainer: {
    padding: Tokens.spacing.xxl,
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Tokens.colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.xs,
  },
  cardPressed: {
    backgroundColor: Tokens.colors.surfaceHi,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  codeWrap: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
  },
  courseCode: {
    fontSize: 11,
    fontFamily: Tokens.fonts.mono,
    color: Tokens.colors.textDim,
  },
  statusBadge: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Tokens.colors.text,
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: "row",
    gap: Tokens.spacing.lg,
    marginTop: Tokens.spacing.xs,
  },
  scoreItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 12,
    color: Tokens.colors.textMuted,
  },
  scoreValue: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Tokens.fonts.mono,
    color: Tokens.colors.text,
  },
  overdueBanner: {
    backgroundColor: Tokens.colors.warnBg,
    borderColor: Tokens.colors.warn,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    padding: Tokens.spacing.xs,
    marginTop: Tokens.spacing.xs,
  },
  overdueText: {
    fontSize: 11,
    color: Tokens.colors.warn,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
    paddingTop: Tokens.spacing.xs,
  },
  dateText: {
    fontSize: 11,
    color: Tokens.colors.textDim,
    fontFamily: Tokens.fonts.mono,
  },
});
