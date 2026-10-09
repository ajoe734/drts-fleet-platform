import { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "智行叫車",
  description: "Passenger App",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <div
          id="passenger-app-root"
          style={{ width: "100%", maxWidth: "390px", margin: "0 auto" }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
