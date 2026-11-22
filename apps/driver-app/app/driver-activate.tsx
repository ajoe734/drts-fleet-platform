import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { ActionButton, AppScreen, ErrorBanner, tokens } from "@/components/ui";
import {
  activateDriverDevice,
  formatDriverRegistrationError,
} from "@/lib/api-client";
import {
  subscribeToDriverActivation,
  takeDriverActivationToken,
} from "@/lib/driver-activation-link";

export default function DriverActivationScreen() {
  const router = useRouter();
  const focused = useRef(false);
  const redeeming = useRef(false);
  const [problem, setProblem] = useState<{
    message: string;
    alreadySignedIn?: true;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;

      const redeem = async () => {
        const token = takeDriverActivationToken();
        if (redeeming.current) return;
        if (!token) {
          setProblem({
            message:
              "啟用連結無效。請從原簡訊或 Email 再開啟一次，或手動輸入註冊碼。",
          });
          return;
        }

        redeeming.current = true;
        setProblem(null);
        try {
          const result = await activateDriverDevice(token);
          if (!focused.current) return;
          if (result === "already_signed_in") {
            setProblem({
              message: "此裝置已有司機登入。如需綁定其他帳號，請先在設定登出。",
              alreadySignedIn: true,
            });
            return;
          }
          router.replace("/");
        } catch (error) {
          if (focused.current) {
            setProblem({ message: formatDriverRegistrationError(error) });
          }
        } finally {
          redeeming.current = false;
        }
      };

      const unsubscribe = subscribeToDriverActivation(() => void redeem());
      void redeem();

      return () => {
        focused.current = false;
        unsubscribe();
      };
    }, [router]),
  );

  return (
    <AppScreen contentContainerStyle={styles.content}>
      {problem ? (
        <>
          <ErrorBanner message={problem.message} />
          <ActionButton
            title={problem.alreadySignedIn ? "返回工作台" : "手動輸入註冊碼"}
            onPress={() =>
              router.replace(problem.alreadySignedIn ? "/" : "/onboarding")
            }
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={tokens.colors.primary} size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            正在驗證並啟用此裝置…
          </Text>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: tokens.spacing[12],
  },
  status: {
    ...tokens.type.body,
    color: tokens.colors.text,
    textAlign: "center",
  },
});
