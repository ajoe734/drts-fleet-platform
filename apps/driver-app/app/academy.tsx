import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ActionButton } from "@/components/ui/ActionButton";
import { AppScreen } from "@/components/ui/AppScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tokens } from "@/components/ui/tokens";
import {
  formatDriverError,
  getDriverClient,
} from "@/lib/api-client";
import {
  CourseCard,
  ModuleReader,
  QuizResultView,
  QuizRunner,
  TrainingRecordsList,
  type AcademyCourseDetail,
  type AcademyCourseSummary,
  type DriverQuizAttemptDetail,
  type DriverTrainingRecord,
  type QuizResultRecord,
  type QuizSubmissionCommand,
} from "@/components/academy";

type TabKey = "courses" | "records";
type ViewMode = "list" | "detail" | "quiz" | "result";

export default function DriverAcademyScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("courses");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [courses, setCourses] = useState<AcademyCourseSummary[]>([]);
  const [records, setRecords] = useState<DriverTrainingRecord[]>([]);
  const [selectedCourse, setSelectedCourse] =
    useState<AcademyCourseDetail | null>(null);
  const [quizResult, setQuizResult] = useState<
    QuizResultRecord | DriverQuizAttemptDetail | null
  >(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = getDriverClient();
      const [courseRes, recordRes] = await Promise.all([
        client.listAcademyCourses(),
        client.listDriverTrainingRecords(),
      ]);
      setCourses(courseRes.items ?? []);
      setRecords(recordRes.items ?? []);
    } catch (err) {
      setError(
        formatDriverError(err, "載入學院資料失敗，請確認網路連線與司機權限。"),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSelectCourse = async (courseSummary: AcademyCourseSummary) => {
    setIsDetailLoading(true);
    setError(null);
    try {
      const client = getDriverClient();
      const detail = await client.getAcademyCourse(courseSummary.courseId);
      setSelectedCourse(detail);
      setViewMode("detail");
    } catch (err) {
      setError(
        formatDriverError(err, "無法取得課程詳細教材，請稍候重試。"),
      );
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleSelectRecordCourse = async (courseId: string) => {
    setIsDetailLoading(true);
    setError(null);
    try {
      const client = getDriverClient();
      const detail = await client.getAcademyCourse(courseId);
      setSelectedCourse(detail);
      setViewMode("detail");
    } catch (err) {
      setError(
        formatDriverError(err, "無法取得課程詳細教材，請稍候重試。"),
      );
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleStartQuiz = () => {
    setViewMode("quiz");
  };

  const handleCancelQuiz = () => {
    setViewMode("detail");
  };

  const handleSubmitQuiz = async (command: QuizSubmissionCommand) => {
    if (!selectedCourse) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const client = getDriverClient();
      const result = await client.submitQuiz(
        selectedCourse.courseId,
        command,
      );
      setQuizResult(result);
      setViewMode("result");
      // Refresh list in background so new score and status are immediately updated
      void loadData();
    } catch (err) {
      setError(
        formatDriverError(err, "提交測驗失敗，請檢查答案後再試一次。"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetakeQuiz = () => {
    setQuizResult(null);
    setViewMode("quiz");
  };

  const handleBackToCourses = () => {
    setSelectedCourse(null);
    setQuizResult(null);
    setViewMode("list");
  };

  const renderBackButton = (onPress: () => void, label = "返回") => (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Tokens.radius.sm,
        backgroundColor: Tokens.colors.surfaceLo,
        borderWidth: 1,
        borderColor: Tokens.colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: Tokens.colors.textMuted,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  // If in quiz mode
  if (viewMode === "quiz" && selectedCourse) {
    return (
      <AppScreen testID="academy-quiz-screen">
        <PageHeader
          title="線上測驗"
          subtitle={selectedCourse.title}
          rightElement={renderBackButton(handleCancelQuiz, "放棄測驗")}
        />
        <QuizRunner
          course={selectedCourse}
          onSubmit={handleSubmitQuiz}
          onCancel={handleCancelQuiz}
          isSubmitting={isSubmitting}
        />
      </AppScreen>
    );
  }

  // If in quiz result mode
  if (viewMode === "result" && selectedCourse && quizResult) {
    return (
      <AppScreen testID="academy-result-screen">
        <PageHeader
          title="測驗成績"
          subtitle={selectedCourse.title}
          rightElement={renderBackButton(handleBackToCourses, "回課程")}
        />
        <QuizResultView
          result={quizResult}
          passingScore={selectedCourse.passingScore}
          onRetake={handleRetakeQuiz}
          onBackToCourses={handleBackToCourses}
        />
      </AppScreen>
    );
  }

  // If in course detail mode
  if (viewMode === "detail" && selectedCourse) {
    return (
      <AppScreen testID="academy-detail-screen">
        <PageHeader
          title="課程專區"
          subtitle={selectedCourse.title}
          rightElement={renderBackButton(handleBackToCourses, "回清單")}
        />
        <ModuleReader
          course={selectedCourse}
          onStartQuiz={handleStartQuiz}
          onBack={handleBackToCourses}
        />
      </AppScreen>
    );
  }

  // Default: List view (courses or records)
  return (
    <AppScreen testID="academy-screen">
      <PageHeader
        title="司機學院"
        subtitle="專業培訓 · SOP 標準作業 · 測驗認證"
        rightElement={renderBackButton(() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/");
          }
        }, "工作台")}
      />

      <View style={styles.container}>
        {/* Navigation Tabs */}
        <View style={styles.tabContainer}>
          <SegmentedControl
            options={[
              { value: "courses", label: `課程專區 (${courses.length})` },
              { value: "records", label: `完訓紀錄 (${records.length})` },
            ]}
            selectedValue={activeTab}
            onValueChange={(val: string) => setActiveTab(val as TabKey)}
          />
        </View>

        {error && (
          <View style={styles.errorWrapper}>
            <ErrorBanner message={error} />
            <ActionButton
              title="重新載入"
              variant="secondary"
              onPress={loadData}
            />
          </View>
        )}

        {(isLoading || isDetailLoading) && (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={Tokens.colors.brandHi} />
            <Text style={styles.loadingText}>
              {isDetailLoading ? "正在載入課程教材..." : "正在同步學院資料..."}
            </Text>
          </View>
        )}

        {!isLoading && !isDetailLoading && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activeTab === "courses" ? (
              courses.length === 0 ? (
                <EmptyState
                  title="目前尚無可用課程"
                  description="新課程上架後將在此發布，請留意車行最新通知。"
                />
              ) : (
                <View style={styles.courseList}>
                  {courses.map((course) => (
                    <CourseCard
                      key={course.courseId}
                      course={course}
                      onSelect={handleSelectCourse}
                    />
                  ))}
                </View>
              )
            ) : (
              <TrainingRecordsList
                records={records}
                onSelectCourse={handleSelectRecordCourse}
              />
            )}
          </ScrollView>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
  },
  errorWrapper: {
    paddingHorizontal: Tokens.spacing.lg,
    marginBottom: Tokens.spacing.sm,
    gap: Tokens.spacing.xs,
  },
  loadingWrapper: {
    padding: Tokens.spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: Tokens.colors.textMuted,
  },
  scrollContent: {
    padding: Tokens.spacing.lg,
    paddingBottom: Tokens.spacing.xxl * 2,
  },
  courseList: {
    gap: Tokens.spacing.md,
  },
});
