import type {
  DriverProfileRecord,
  DriverSettings,
  UpdateDriverProfileCommand,
  UpdateDriverSettingsCommand,
} from "@drts/contracts";

export interface SettingsFormValues {
  language: string;
  notificationsEnabled: boolean;
  autoAcceptEnabled: boolean;
  maxAcceptRadius: string;
}

export interface ProfileFormValues {
  profileName: string;
  profilePhone: string;
  profileEmail: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
}

export type SettingsFieldErrors = Partial<
  Record<keyof SettingsFormValues, string>
>;
export type ProfileFieldErrors = Partial<
  Record<keyof ProfileFormValues, string>
>;

const MAX_RADIUS_KM = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_SETTINGS_VALUES: SettingsFormValues = {
  language: "zh-TW",
  notificationsEnabled: true,
  autoAcceptEnabled: false,
  maxAcceptRadius: "",
};

export const DEFAULT_PROFILE_VALUES: ProfileFormValues = {
  profileName: "",
  profilePhone: "",
  profileEmail: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
};

export function settingsValuesFromRecord(
  record: DriverSettings,
): SettingsFormValues {
  return {
    language: record.language ?? "zh-TW",
    notificationsEnabled: record.notificationsEnabled ?? true,
    autoAcceptEnabled: record.autoAcceptEnabled ?? false,
    maxAcceptRadius:
      record.maxAcceptRadius != null ? String(record.maxAcceptRadius) : "",
  };
}

export function profileValuesFromRecord(
  record: DriverProfileRecord,
): ProfileFormValues {
  return {
    profileName: record.name ?? "",
    profilePhone: record.phone ?? "",
    profileEmail: record.email ?? "",
    emergencyName: record.emergencyContact?.name ?? "",
    emergencyPhone: record.emergencyContact?.phone ?? "",
    emergencyRelationship: record.emergencyContact?.relationship ?? "",
  };
}

export function settingsValuesEqual(
  a: SettingsFormValues,
  b: SettingsFormValues,
): boolean {
  return (
    a.language.trim() === b.language.trim() &&
    a.notificationsEnabled === b.notificationsEnabled &&
    a.autoAcceptEnabled === b.autoAcceptEnabled &&
    a.maxAcceptRadius.trim() === b.maxAcceptRadius.trim()
  );
}

export function profileValuesEqual(
  a: ProfileFormValues,
  b: ProfileFormValues,
): boolean {
  return (
    a.profileName.trim() === b.profileName.trim() &&
    a.profilePhone.trim() === b.profilePhone.trim() &&
    a.profileEmail.trim() === b.profileEmail.trim() &&
    a.emergencyName.trim() === b.emergencyName.trim() &&
    a.emergencyPhone.trim() === b.emergencyPhone.trim() &&
    a.emergencyRelationship.trim() === b.emergencyRelationship.trim()
  );
}

export function validateSettingsValues(
  values: SettingsFormValues,
): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  if (!values.language.trim()) {
    errors.language = "請選擇介面語言。";
  }

  const radius = values.maxAcceptRadius.trim();
  if (radius.length > 0) {
    if (!/^\d+$/.test(radius)) {
      errors.maxAcceptRadius = "接單範圍只能輸入整數公里數。";
    } else {
      const parsed = Number(radius);
      if (parsed <= 0) {
        errors.maxAcceptRadius = "接單範圍需大於 0 公里。";
      } else if (parsed > MAX_RADIUS_KM) {
        errors.maxAcceptRadius = `接單範圍不可超過 ${MAX_RADIUS_KM} 公里。`;
      }
    }
  }

  return errors;
}

export function hasEmergencyInput(values: ProfileFormValues): boolean {
  return (
    values.emergencyName.trim().length > 0 ||
    values.emergencyPhone.trim().length > 0 ||
    values.emergencyRelationship.trim().length > 0
  );
}

export function validateProfileValues(
  values: ProfileFormValues,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  if (!values.profileName.trim()) {
    errors.profileName = "司機個人資料需要填寫姓名。";
  }

  const email = values.profileEmail.trim();
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    errors.profileEmail = "電子郵件格式無效。";
  }

  if (hasEmergencyInput(values)) {
    if (!values.emergencyName.trim()) {
      errors.emergencyName = "新增緊急聯絡人時，請填寫聯絡人姓名。";
    }
    if (!values.emergencyPhone.trim()) {
      errors.emergencyPhone = "新增緊急聯絡人時，請填寫聯絡人電話。";
    }
  }

  return errors;
}

export function hasErrors(
  errors: SettingsFieldErrors | ProfileFieldErrors,
): boolean {
  return Object.values(errors).some((value) => Boolean(value));
}

export function buildSettingsCommand(
  values: SettingsFormValues,
): UpdateDriverSettingsCommand {
  const radius = values.maxAcceptRadius.trim();
  return {
    language: values.language.trim(),
    notificationsEnabled: values.notificationsEnabled,
    autoAcceptEnabled: values.autoAcceptEnabled,
    maxAcceptRadius: radius ? Number(radius) : null,
  };
}

export function buildProfileCommand(
  values: ProfileFormValues,
): UpdateDriverProfileCommand {
  const trimmedName = values.profileName.trim();
  const trimmedPhone = values.profilePhone.trim();
  const trimmedEmail = values.profileEmail.trim();
  const trimmedEmergencyName = values.emergencyName.trim();
  const trimmedEmergencyPhone = values.emergencyPhone.trim();
  const trimmedEmergencyRelationship = values.emergencyRelationship.trim();

  return {
    name: trimmedName,
    phone: trimmedPhone || null,
    email: trimmedEmail || null,
    emergencyContact: hasEmergencyInput(values)
      ? {
          name: trimmedEmergencyName,
          phone: trimmedEmergencyPhone,
          relationship: trimmedEmergencyRelationship || null,
        }
      : null,
  };
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveStateInput {
  saving: boolean;
  dirty: boolean;
  hasValidation: boolean;
  lastResult: "success" | "error" | null;
}

export function deriveSaveState(input: SaveStateInput): SaveState {
  if (input.saving) {
    return "saving";
  }
  if (input.lastResult === "error") {
    return "error";
  }
  if (input.hasValidation && input.dirty) {
    return "dirty";
  }
  if (input.dirty) {
    return "dirty";
  }
  if (input.lastResult === "success") {
    return "saved";
  }
  return "idle";
}
