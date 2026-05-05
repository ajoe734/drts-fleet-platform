import { Alert } from "react-native";

interface ConfirmDangerActionOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

export function confirmDangerAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "取消",
  onConfirm,
}: ConfirmDangerActionOptions) {
  Alert.alert(title, message, [
    {
      text: cancelLabel,
      style: "cancel",
    },
    {
      text: confirmLabel,
      style: "destructive",
      onPress: onConfirm,
    },
  ]);
}
