import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DRTS 主管機關唯讀查詢",
  description: "主管機關唯讀查詢介面（BUREAU-R13）",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Noto Sans TC', 'PingFang TC', sans-serif",
          color: "#0f172a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
