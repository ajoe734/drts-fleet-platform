import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Tokens } from "@/components/ui/tokens";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  formatCategoryLabel,
  type AcademyCourseDetail,
  type AcademyModule,
} from "./types";

interface ModuleReaderProps {
  course: AcademyCourseDetail;
  onStartQuiz: () => void;
  onBack: () => void;
}

function getModuleTypeLabel(type: AcademyModule["type"]): string {
  switch (type) {
    case "video":
      return "教學影片";
    case "sop":
      return "SOP 指引";
    case "article":
      return "專業講義";
    default:
      return type;
  }
}

export function ModuleReader({
  course,
  onStartQuiz,
  onBack,
}: ModuleReaderProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<string>(
    course.modules[0]?.moduleId ?? "",
  );

  const selectedModule =
    course.modules.find((m) => m.moduleId === selectedModuleId) ??
    course.modules[0];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Course Overview Card */}
      <View style={styles.headerCard}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 返回清單</Text>
          </Pressable>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {formatCategoryLabel(course.category)}
              </Text>
            </View>
            {course.isRequired && (
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredText}>必修</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.courseTitle}>{course.title}</Text>
        <Text style={styles.courseCode}>代碼：{course.courseCode} · 版本：v{course.version}</Text>
        <Text style={styles.description}>{course.description}</Text>

        <View style={styles.requirementBanner}>
          <Text style={styles.requirementText}>
            完訓標準：測驗成績需達 {course.passingScore} 分（含）以上方可認證
          </Text>
        </View>
      </View>

      {/* Module Selector */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>教學單元教材 ({course.modules.length})</Text>
      </View>

      <View style={styles.moduleList}>
        {course.modules.map((mod, idx) => {
          const isSelected = mod.moduleId === selectedModule?.moduleId;
          return (
            <Pressable
              key={mod.moduleId}
              style={[
                styles.moduleItem,
                isSelected && styles.moduleItemSelected,
              ]}
              onPress={() => setSelectedModuleId(mod.moduleId)}
            >
              <View style={styles.moduleItemHeader}>
                <View style={styles.moduleNumberBadge}>
                  <Text style={styles.moduleNumberText}>單元 {idx + 1}</Text>
                </View>
                <View style={styles.moduleTypeBadge}>
                  <Text style={styles.moduleTypeText}>
                    {getModuleTypeLabel(mod.type)}
                  </Text>
                </View>
                <Text style={styles.durationText}>
                  {mod.durationMinutes} 分鐘
                </Text>
              </View>
              <Text style={styles.moduleTitle}>{mod.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Module Content Preview */}
      {selectedModule && (
        <View style={styles.contentViewerCard}>
          <View style={styles.contentViewerHeader}>
            <Text style={styles.contentViewerType}>
              [{getModuleTypeLabel(selectedModule.type)}]
            </Text>
            <Text style={styles.contentViewerTitle}>
              {selectedModule.title}
            </Text>
          </View>

          {selectedModule.type === "video" ? (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.videoIcon}>▶</Text>
              <Text style={styles.videoPromptText}>
                教學影片播放器（時長 {selectedModule.durationMinutes} 分鐘）
              </Text>
              <Text style={styles.videoUrlText}>
                影片資源位址：{selectedModule.contentUrl}
              </Text>
            </View>
          ) : (
            <View style={styles.documentViewer}>
              <Text style={styles.documentHeading}>教材內文與作業規範：</Text>
              <Text style={styles.documentBody}>
                {selectedModule.type === "sop"
                  ? "【標準作業指引 SOP】\n1. 接單前請確認車輛安全自檢與整潔完成。\n2. 與乘客核對目的地與路線偏好，維持專業禮貌。\n3. 遇突發事故時，依照安全應變標準程序開啟 SOS 通報，切勿慌張。\n4. 行程結束後確認乘客物品，落實服務紀錄回傳。"
                  : "【專業知識講義】\n本單元涵蓋平台服務法規、責任分工原則與合約條款注意事項。駕駛員需確實理解個人承攬／受僱權利與安全規範，遵循主管機關運輸法遵標準。"}
              </Text>
              <Text style={styles.documentSourceUrl}>
                文件載點：{selectedModule.contentUrl}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Start Quiz Action */}
      <View style={styles.actionContainer}>
        <ActionButton
          title={`開始測驗 (${course.questions.length} 題)`}
          variant="primary"
          onPress={onStartQuiz}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  headerCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    paddingVertical: Tokens.spacing.xs,
    paddingHorizontal: Tokens.spacing.sm,
  },
  backButtonText: {
    fontSize: 13,
    color: Tokens.colors.brandHi,
    fontWeight: "600",
  },
  badgeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
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
  courseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  courseCode: {
    fontSize: 12,
    color: Tokens.colors.textDim,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.xs,
  },
  requirementBanner: {
    marginTop: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.infoBg,
    borderColor: Tokens.colors.info,
    borderWidth: 1,
    borderRadius: Tokens.radius.sm,
    padding: Tokens.spacing.sm,
  },
  requirementText: {
    fontSize: 12,
    color: Tokens.colors.info,
    fontWeight: "500",
  },
  sectionHeader: {
    marginTop: Tokens.spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  moduleList: {
    gap: Tokens.spacing.sm,
  },
  moduleItem: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  moduleItemSelected: {
    borderColor: Tokens.colors.brandHi,
    backgroundColor: Tokens.colors.surfaceHi,
  },
  moduleItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  moduleNumberBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
  },
  moduleNumberText: {
    fontSize: 10,
    fontWeight: "600",
    color: Tokens.colors.textMuted,
  },
  moduleTypeBadge: {
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.xs,
    paddingVertical: 1,
    borderRadius: Tokens.radius.xs,
  },
  moduleTypeText: {
    fontSize: 10,
    color: Tokens.colors.brandHi,
  },
  durationText: {
    fontSize: 11,
    color: Tokens.colors.textDim,
    marginLeft: "auto",
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  contentViewerCard: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  contentViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
    paddingBottom: Tokens.spacing.sm,
  },
  contentViewerType: {
    fontSize: 13,
    fontWeight: "600",
    color: Tokens.colors.brandHi,
  },
  contentViewerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Tokens.colors.text,
  },
  videoPlaceholder: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  videoIcon: {
    fontSize: 32,
    color: Tokens.colors.brandHi,
  },
  videoPromptText: {
    fontSize: 13,
    color: Tokens.colors.text,
    fontWeight: "600",
  },
  videoUrlText: {
    fontSize: 11,
    color: Tokens.colors.textDim,
  },
  documentViewer: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  documentHeading: {
    fontSize: 13,
    fontWeight: "600",
    color: Tokens.colors.text,
  },
  documentBody: {
    fontSize: 13,
    lineHeight: 20,
    color: Tokens.colors.textMuted,
  },
  documentSourceUrl: {
    fontSize: 11,
    color: Tokens.colors.textDim,
    marginTop: Tokens.spacing.xs,
  },
  actionContainer: {
    marginTop: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.xxl,
  },
});
