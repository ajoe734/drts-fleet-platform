import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Adapter Registry",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
