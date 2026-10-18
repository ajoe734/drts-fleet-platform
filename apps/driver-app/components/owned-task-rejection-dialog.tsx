import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Btn,
  Card,
  Field,
  Input,
  driverCanvasTheme,
} from "./canvas-primitives";

export function OwnedTaskRejectionDialog({
  taskId,
  visible,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  taskId: string | null;
  visible: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reasonNote?: string) => void;
}) {
  const [reasonNote, setReasonNote] = useState("");
  useEffect(() => setReasonNote(""), [taskId, visible]);
  if (!visible) return null;
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.dialog} accessibilityViewIsModal>
          <Card theme={driverCanvasTheme}>
            <Text style={styles.title} accessibilityRole="header">
              婉拒此任務
            </Text>
            <Text style={styles.description}>
              婉拒後，這筆訂單會交回調度重新派遣。
            </Text>
            <Field label="原因補充（選填）">
              <Input
                theme={driverCanvasTheme}
                ph="可補充婉拒原因"
                value={reasonNote}
                onChangeText={setReasonNote}
                editable={!busy}
              />
            </Field>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {busy ? <Text style={styles.description}>婉拒送出中…</Text> : null}
            <View style={styles.actions}>
              <Btn
                theme={driverCanvasTheme}
                variant="secondary"
                onPress={onCancel}
                disabled={busy}
              >
                保留任務
              </Btn>
              <Btn
                theme={driverCanvasTheme}
                onPress={() => onConfirm(reasonNote.trim() || undefined)}
                disabled={busy}
              >
                確認婉拒
              </Btn>
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  dialog: { width: "100%", maxWidth: 480 },
  title: { color: driverCanvasTheme.text, fontSize: 20, fontWeight: "700" },
  description: { color: driverCanvasTheme.textMuted, marginVertical: 12 },
  error: { color: driverCanvasTheme.danger, marginVertical: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
});
