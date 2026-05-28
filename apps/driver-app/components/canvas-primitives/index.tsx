import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  type CanvasTheme,
  type CanvasTone,
  buildCanvasTheme,
} from "./canvas-theme";

export type { CanvasTheme, CanvasTone } from "./canvas-theme";

export type DriverCanvasTheme = CanvasTheme;

const UI_FONT =
  Platform.OS === "web"
    ? '"Inter", "Noto Sans TC", system-ui, sans-serif'
    : "System";
const MONO_FONT =
  Platform.OS === "web"
    ? '"JetBrains Mono", ui-monospace, monospace'
    : Platform.select({
        ios: "Courier",
        default: "monospace",
      });

export const driverCanvasTheme: DriverCanvasTheme = {
  ...buildCanvasTheme({
    dark: true,
    density: "compact",
  }),
  accent: "#7BC0FF",
  accentHi: "#A9D6FF",
  accentBg: "#0F2236",
  accentBorder: "#1B3A5A",
  surfaceName: "Driver App",
  surfaceTagline: "多平台駕駛工作台",
  fontFamily: UI_FONT,
  monoFamily: MONO_FONT ?? "monospace",
};

function resolveTheme(theme?: DriverCanvasTheme): DriverCanvasTheme {
  return theme ?? driverCanvasTheme;
}

function toToneSet(theme: DriverCanvasTheme, tone: CanvasTone) {
  switch (tone) {
    case "success":
      return {
        fg: theme.success,
        bg: theme.successBg,
        bd: theme.successBorder,
      };
    case "warn":
      return {
        fg: theme.warn,
        bg: theme.warnBg,
        bd: theme.warnBorder,
      };
    case "danger":
      return {
        fg: theme.danger,
        bg: theme.dangerBg,
        bd: theme.dangerBorder,
      };
    case "info":
      return {
        fg: theme.info,
        bg: theme.infoBg,
        bd: theme.infoBorder,
      };
    case "accent":
      return {
        fg: theme.accent,
        bg: theme.accentBg,
        bd: theme.accentBorder,
      };
    case "neutral":
    default:
      return {
        fg: theme.textMuted,
        bg: theme.neutralBg,
        bd: theme.neutralBorder,
      };
  }
}

function renderInlineText(
  value: ReactNode,
  style?: StyleProp<TextStyle>,
): ReactNode {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return <Text style={style}>{String(value)}</Text>;
  }

  return value;
}

export interface ShellProps {
  theme?: DriverCanvasTheme;
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

function ShellStatusBar({ theme }: { theme: DriverCanvasTheme }) {
  return (
    <View style={[styles.statusBar, { backgroundColor: theme.bg }]}>
      <Text
        style={[
          styles.statusBarTime,
          { color: theme.text, fontFamily: theme.monoFamily },
        ]}
      >
        9:30
      </Text>
      <View style={styles.statusBarIcons}>
        <Ionicons name="wifi-outline" size={13} color={theme.text} />
        <Text
          style={[
            styles.statusBarBatteryText,
            { color: theme.text, fontFamily: theme.monoFamily },
          ]}
        >
          87%
        </Text>
        <Ionicons name="battery-half-outline" size={15} color={theme.text} />
      </View>
    </View>
  );
}

export function Shell({
  theme: providedTheme,
  children,
  footer,
  contentContainerStyle,
}: ShellProps) {
  const theme = resolveTheme(providedTheme);
  const frame = (
    <View
      style={[
        styles.shellFrame,
        Platform.OS === "web" ? styles.shellFrameWeb : styles.shellFrameNative,
        {
          backgroundColor: theme.bg,
          borderColor: Platform.OS === "web" ? "#0A0E14" : "transparent",
        },
      ]}
    >
      {Platform.OS === "web" ? <View style={styles.phonePunchHole} /> : null}
      <ShellStatusBar theme={theme} />
      <ScrollView
        style={styles.shellScroll}
        contentContainerStyle={[
          styles.shellScrollContent,
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.shellFooter}>{footer}</View> : null}
    </View>
  );

  if (Platform.OS !== "web") {
    return frame;
  }

  return (
    <View style={styles.shellBackdrop}>
      <View style={styles.shellWebCenter}>{frame}</View>
    </View>
  );
}

export interface PageHeaderProps {
  theme?: DriverCanvasTheme;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode[];
  activeTab?: ReactNode;
  sticky?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PageHeader({
  theme: providedTheme,
  title,
  subtitle,
  actions,
  tabs,
  activeTab,
  style,
}: PageHeaderProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <View style={[styles.pageHeader, style]}>
      <View style={styles.pageHeaderTop}>
        <View style={styles.pageHeaderCopy}>
          {renderInlineText(title, [
            styles.pageHeaderTitle,
            { color: theme.text },
          ])}
          {subtitle
            ? renderInlineText(subtitle, [
                styles.pageHeaderSubtitle,
                { color: theme.textMuted },
              ])
            : null}
        </View>
        {actions ? (
          <View style={styles.pageHeaderActions}>{actions}</View>
        ) : null}
      </View>
      {tabs?.length ? (
        <View style={styles.pageHeaderTabs}>
          {tabs.map((tab, index) => {
            const selected = tab === activeTab;
            return (
              <View
                key={`tab-${index}`}
                style={[
                  styles.pageHeaderTab,
                  {
                    borderBottomColor: selected ? theme.accent : "transparent",
                  },
                ]}
              >
                {renderInlineText(tab, [
                  styles.pageHeaderTabText,
                  { color: selected ? theme.text : theme.textMuted },
                ])}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export interface BtnProps {
  theme?: DriverCanvasTheme;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Btn({
  theme: providedTheme,
  variant = "secondary",
  size = "sm",
  icon,
  children,
  danger = false,
  disabled = false,
  onPress,
  style,
}: BtnProps) {
  const theme = resolveTheme(providedTheme);
  const sizing =
    size === "xs"
      ? { paddingY: 4, paddingX: 8, fontSize: 11.5, minHeight: 24 }
      : size === "md"
        ? { paddingY: 8, paddingX: 14, fontSize: 13, minHeight: 34 }
        : { paddingY: 5, paddingX: 10, fontSize: 12, minHeight: 28 };
  const palette = danger
    ? { bg: theme.danger, fg: "#FFFFFF", bd: theme.danger }
    : variant === "primary"
      ? { bg: theme.accent, fg: "#FFFFFF", bd: theme.accent }
      : variant === "ghost"
        ? { bg: "transparent", fg: theme.textMuted, bd: "transparent" }
        : { bg: theme.surface, fg: theme.text, bd: theme.border };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.bd,
          paddingHorizontal: sizing.paddingX,
          paddingVertical: sizing.paddingY,
          minHeight: sizing.minHeight,
          opacity: disabled ? 0.6 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
      {renderInlineText(children, [
        styles.buttonLabel,
        {
          color: palette.fg,
          fontSize: sizing.fontSize,
          fontFamily: theme.fontFamily,
        },
      ])}
    </Pressable>
  );
}

export interface PillProps {
  theme?: DriverCanvasTheme;
  tone?: CanvasTone;
  children: ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Pill({
  theme: providedTheme,
  tone = "neutral",
  children,
  dot = false,
  style,
}: PillProps) {
  const theme = resolveTheme(providedTheme);
  const toneSet = toToneSet(theme, tone);

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: toneSet.bg,
          borderColor: toneSet.bd,
        },
        style,
      ]}
    >
      {dot ? (
        <View style={[styles.pillDot, { backgroundColor: toneSet.fg }]} />
      ) : null}
      {renderInlineText(children, [
        styles.pillLabel,
        { color: toneSet.fg, fontFamily: theme.fontFamily },
      ])}
    </View>
  );
}

export interface CardProps {
  theme?: DriverCanvasTheme;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  theme: providedTheme,
  title,
  subtitle,
  actions,
  children,
  padding,
  style,
}: CardProps) {
  const theme = resolveTheme(providedTheme);
  const bodyPadding = padding ?? theme.cardPad;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {title || actions ? (
        <View
          style={[
            styles.cardHeader,
            {
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeaderCopy}>
            {title
              ? renderInlineText(title, [
                  styles.cardTitle,
                  { color: theme.text, fontFamily: theme.fontFamily },
                ])
              : null}
            {subtitle
              ? renderInlineText(subtitle, [
                  styles.cardSubtitle,
                  { color: theme.textMuted, fontFamily: theme.fontFamily },
                ])
              : null}
          </View>
          {actions ? <View style={styles.cardActions}>{actions}</View> : null}
        </View>
      ) : null}
      <View style={{ padding: bodyPadding }}>{children}</View>
    </View>
  );
}

export interface TableColumn<Row extends Record<string, unknown>> {
  h: ReactNode;
  k?: keyof Row & string;
  w?: string | number;
  mono?: boolean;
  align?: "left" | "center" | "right";
  r?: (row: Row, index: number) => ReactNode;
}

export interface TableProps<Row extends Record<string, unknown>> {
  theme?: DriverCanvasTheme;
  columns: TableColumn<Row>[];
  rows: readonly Row[];
  dense?: boolean;
}

function cellAlignment(align?: "left" | "center" | "right") {
  switch (align) {
    case "center":
      return "center" as const;
    case "right":
      return "flex-end" as const;
    default:
      return "flex-start" as const;
  }
}

function resolveColumnWidth(value?: string | number): ViewStyle["width"] {
  return value as ViewStyle["width"];
}

export function Table<Row extends Record<string, unknown>>({
  theme: providedTheme,
  columns,
  rows,
  dense = true,
}: TableProps<Row>) {
  const theme = resolveTheme(providedTheme);
  const verticalPadding = dense ? theme.cellY : theme.cellY + 3;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.tableWrap}>
        <View
          style={[
            styles.tableRow,
            styles.tableHeadRow,
            {
              backgroundColor: theme.surfaceLo,
              borderBottomColor: theme.border,
            },
          ]}
        >
          {columns.map((column, index) => (
            <View
              key={`head-${index}`}
              style={[
                styles.tableCell,
                {
                  width: resolveColumnWidth(column.w),
                  minWidth: typeof column.w === "number" ? column.w : 96,
                  paddingHorizontal: theme.cellX,
                  paddingVertical: verticalPadding,
                  alignItems: cellAlignment(column.align),
                },
                column.w == null ? styles.tableFlexCell : null,
              ]}
            >
              {renderInlineText(column.h, [
                styles.tableHeadText,
                {
                  color: theme.textMuted,
                  fontFamily: theme.fontFamily,
                },
              ])}
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={[
              styles.tableRow,
              {
                borderBottomColor: theme.border,
                backgroundColor:
                  "_selected" in row && row._selected
                    ? theme.rowSelect
                    : "transparent",
              },
            ]}
          >
            {columns.map((column, columnIndex) => {
              const content = column.r
                ? column.r(row, rowIndex)
                : column.k
                  ? (row[column.k] as ReactNode)
                  : null;

              return (
                <View
                  key={`cell-${rowIndex}-${columnIndex}`}
                  style={[
                    styles.tableCell,
                    {
                      width: resolveColumnWidth(column.w),
                      minWidth: typeof column.w === "number" ? column.w : 96,
                      paddingHorizontal: theme.cellX,
                      paddingVertical: verticalPadding,
                      alignItems: cellAlignment(column.align),
                    },
                    column.w == null ? styles.tableFlexCell : null,
                  ]}
                >
                  {renderInlineText(content, [
                    styles.tableCellText,
                    {
                      color: theme.text,
                      fontFamily: column.mono
                        ? theme.monoFamily
                        : theme.fontFamily,
                      fontSize: column.mono ? 11.5 : 12.5,
                      textAlign: column.align ?? "left",
                    },
                  ])}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export interface BannerProps {
  theme?: DriverCanvasTheme;
  tone?: Exclude<CanvasTone, "neutral">;
  icon?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}

export function Banner({
  theme: providedTheme,
  tone = "info",
  icon,
  title,
  body,
  actions,
}: BannerProps) {
  const theme = resolveTheme(providedTheme);
  const toneSet = toToneSet(theme, tone);

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: toneSet.bg,
          borderColor: toneSet.bd,
        },
      ]}
    >
      {icon ? <View style={styles.bannerIcon}>{icon}</View> : null}
      <View style={styles.bannerCopy}>
        {title
          ? renderInlineText(title, [
              styles.bannerTitle,
              { color: toneSet.fg, fontFamily: theme.fontFamily },
            ])
          : null}
        {body
          ? renderInlineText(body, [
              styles.bannerBody,
              { color: theme.text, fontFamily: theme.fontFamily },
            ])
          : null}
      </View>
      {actions ? <View style={styles.bannerActions}>{actions}</View> : null}
    </View>
  );
}

export interface KPIProps {
  theme?: DriverCanvasTheme;
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: "up" | "down" | "neutral";
  sub?: ReactNode;
  hint?: ReactNode;
}

export function KPI({
  theme: providedTheme,
  label,
  value,
  delta,
  deltaTone = "neutral",
  sub,
  hint,
}: KPIProps) {
  const theme = resolveTheme(providedTheme);
  const deltaColor =
    deltaTone === "up"
      ? theme.success
      : deltaTone === "down"
        ? theme.danger
        : theme.textMuted;

  return (
    <View
      style={[
        styles.kpiCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      {renderInlineText(label, [
        styles.kpiLabel,
        { color: theme.textMuted, fontFamily: theme.fontFamily },
      ])}
      <View style={styles.kpiValueRow}>
        {renderInlineText(value, [
          styles.kpiValue,
          { color: theme.text, fontFamily: theme.monoFamily },
        ])}
        {delta
          ? renderInlineText(delta, [
              styles.kpiDelta,
              { color: deltaColor, fontFamily: theme.fontFamily },
            ])
          : null}
      </View>
      {sub
        ? renderInlineText(sub, [
            styles.kpiSub,
            { color: theme.textMuted, fontFamily: theme.fontFamily },
          ])
        : null}
      {hint
        ? renderInlineText(hint, [
            styles.kpiHint,
            { color: theme.textDim, fontFamily: theme.monoFamily },
          ])
        : null}
    </View>
  );
}

export interface DLItem {
  k?: ReactNode;
  v?: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  mono?: boolean;
}

export interface DLProps {
  theme?: DriverCanvasTheme;
  items: DLItem[];
  cols?: number;
  monoVal?: boolean;
}

export function DL({
  theme: providedTheme,
  items,
  cols = 2,
  monoVal = false,
}: DLProps) {
  const theme = resolveTheme(providedTheme);
  const multiColumn = cols > 1;

  return (
    <View style={styles.dlGrid}>
      {items.map((item, index) => {
        const label = item.k ?? item.label;
        const value = item.v ?? item.value;

        return (
          <View
            key={`dl-${index}`}
            style={[
              styles.dlItem,
              multiColumn ? styles.dlItemHalf : styles.dlItemFull,
            ]}
          >
            {renderInlineText(label, [
              styles.dlLabel,
              { color: theme.textMuted, fontFamily: theme.fontFamily },
            ])}
            {renderInlineText(value, [
              styles.dlValue,
              {
                color: theme.text,
                fontFamily:
                  monoVal || item.mono ? theme.monoFamily : theme.fontFamily,
              },
            ])}
          </View>
        );
      })}
    </View>
  );
}

export interface FieldProps {
  theme?: DriverCanvasTheme;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
}

export function Field({
  theme: providedTheme,
  label,
  hint,
  children,
  required = false,
}: FieldProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        {renderInlineText(label, [
          styles.fieldLabel,
          { color: theme.text, fontFamily: theme.fontFamily },
        ])}
        {required ? (
          <Text
            style={[
              styles.fieldRequired,
              { color: theme.danger, fontFamily: theme.fontFamily },
            ]}
          >
            *
          </Text>
        ) : null}
      </View>
      {children}
      {hint
        ? renderInlineText(hint, [
            styles.fieldHint,
            { color: theme.textMuted, fontFamily: theme.fontFamily },
          ])
        : null}
    </View>
  );
}

export interface InputProps {
  theme?: DriverCanvasTheme;
  value?: string;
  ph?: string;
  mono?: boolean;
  suffix?: ReactNode;
  prefix?: ReactNode;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}

export function Input({
  theme: providedTheme,
  value,
  ph,
  mono = false,
  suffix,
  prefix,
  editable = true,
  onChangeText,
  autoCapitalize = "sentences",
  autoCorrect = true,
}: InputProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <View
      style={[
        styles.inputWrap,
        {
          backgroundColor: theme.bgRaised,
          borderColor: theme.border,
        },
      ]}
    >
      {prefix ? (
        <View style={styles.inputAffix}>
          {renderInlineText(prefix, [
            styles.inputAffixText,
            { color: theme.textDim, fontFamily: theme.fontFamily },
          ])}
        </View>
      ) : null}
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={ph}
        placeholderTextColor={theme.textDim}
        selectionColor={theme.accent}
        style={[
          styles.input,
          {
            color: theme.text,
            fontFamily: mono ? theme.monoFamily : theme.fontFamily,
          },
        ]}
        value={value}
      />
      {suffix ? (
        <View style={styles.inputAffix}>
          {renderInlineText(suffix, [
            styles.inputAffixText,
            { color: theme.textDim, fontFamily: theme.fontFamily },
          ])}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shellBackdrop: {
    flex: 1,
    backgroundColor: "#F0EEE9",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  shellWebCenter: {
    width: 412,
    maxWidth: "100%",
    height: 892,
  },
  shellFrame: {
    flex: 1,
    overflow: "hidden",
  },
  shellScroll: {
    flex: 1,
  },
  shellFrameWeb: {
    borderWidth: 9,
    borderRadius: 36,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 8,
  },
  shellFrameNative: {
    borderRadius: 0,
  },
  phonePunchHole: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0A0E14",
    zIndex: 2,
  },
  shellScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 14,
  },
  shellFooter: {
    flexShrink: 0,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "web" ? 18 : 10,
    paddingBottom: 8,
  },
  statusBarTime: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  statusBarIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBarBatteryText: {
    fontSize: 11,
    fontWeight: "500",
  },
  pageHeader: {
    gap: 12,
  },
  pageHeaderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  pageHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  pageHeaderTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  pageHeaderSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  pageHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageHeaderTabs: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  pageHeaderTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
  },
  pageHeaderTabText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 7,
  },
  buttonIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    fontWeight: "600",
    lineHeight: 16,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 5,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    lineHeight: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
  },
  cardSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableWrap: {
    minWidth: "100%",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tableHeadRow: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableCell: {
    justifyContent: "center",
  },
  tableFlexCell: {
    flex: 1,
  },
  tableHeadText: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableCellText: {
    lineHeight: 18,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  bannerIcon: {
    marginTop: 1,
  },
  bannerCopy: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 17,
  },
  bannerBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  bannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    gap: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  kpiDelta: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  kpiSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  kpiHint: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  dlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
    rowGap: 10,
  },
  dlItem: {
    paddingHorizontal: 8,
    gap: 3,
  },
  dlItemHalf: {
    width: "50%",
  },
  dlItemFull: {
    width: "100%",
  },
  dlLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 14,
  },
  dlValue: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  field: {
    gap: 5,
    marginBottom: 14,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  fieldRequired: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  fieldHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 42,
  },
  input: {
    flex: 1,
    fontSize: 12.5,
    padding: 0,
  },
  inputAffix: {
    justifyContent: "center",
  },
  inputAffixText: {
    fontSize: 11.5,
  },
});
