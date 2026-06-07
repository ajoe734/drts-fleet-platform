import { Metadata } from "next";

export const metadata: Metadata = {
  title: "外部平台介接登錄",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
