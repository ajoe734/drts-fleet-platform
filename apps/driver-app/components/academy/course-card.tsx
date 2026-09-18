import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tokens } from "@/components/ui/tokens";
import {
  formatCategoryLabel,
  formatTrainingStatusLabel,
  type AcademyCourseSummary,
  type TrainingStatus,
} from "./types";

interface CourseCardProps {
  course: AcademyCourseSummary;
  onSelect: (course: AcademyCourseSummary) => void;
}

function getStatusBadgeStyle(status?: TrainingStatus) {
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

export function CourseCard({ course, onSelect }: CourseCardProps) {
  const statusStyle = getStatusBadgeStyle(course.userStatus);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onSelect(course)}
      accessibilityRole="button"
      accessibilityLabel={`${course.title} ${course.courseCode}`}
    >
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {formatCategoryLabel(course.category)}
            </Text>
          </View>
          {course.isRequired && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>必修課程</Text>
            </View>
          )}
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
            {formatTrainingStatusLabel(course.userStatus ?? "not_started")}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{course.title}</Text>
      <Text style={styles.code}>代碼：{course.courseCode}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {course.modulesCount} 單元教材
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>
          及格門檻：{course.passingScore} 分
        </Text>
        {course.validityDays !== null && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>
              有效期限：{course.validityDays} 天
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  cardPressed: {
    opacity: 0.85,
    backgroundColor: Tokens.colors.surfaceHi,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
    alignItems: "center",
  },
  categoryBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  categoryText: {
    fontSize: 11,
    color: Tokens.colors.textMuted,
    fontWeight: "500",
  },
  requiredBadge: {
    backgroundColor: Tokens.colors.brandBg,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.brandHi,
  },
  requiredText: {
    fontSize: 11,
    color: Tokens.colors.brandHi,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 3,
    borderRadius: Tokens.radius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  code: {
    fontSize: 12,
    color: Tokens.colors.textDim,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Tokens.spacing.xs,
  },
  metaText: {
    fontSize: 12,
    color: Tokens.colors.textMuted,
  },
  metaDot: {
    marginHorizontal: Tokens.spacing.xs,
    color: Tokens.colors.textDim,
  },
});
