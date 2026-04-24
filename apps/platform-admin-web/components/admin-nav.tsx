"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@drts/ui-web";
import {
  Shield,
  Users,
  Truck,
  Radio,
  DollarSign,
  CreditCard,
  Activity,
  Bell,
  ClipboardList,
  Flag,
  LayoutDashboard,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: <LayoutDashboard size={16} /> },
  { href: "/tenants", label: "Tenants", icon: <Shield size={16} /> },
  { href: "/users", label: "Users", icon: <Users size={16} /> },
  { href: "/fleet", label: "Fleet & Devices", icon: <Truck size={16} /> },
  { href: "/switchboard", label: "Switchboard", icon: <Radio size={16} /> },
  {
    href: "/pricing",
    label: "Pricing & Split",
    icon: <DollarSign size={16} />,
  },
  { href: "/payments", label: "Payments", icon: <CreditCard size={16} /> },
  { href: "/health", label: "Health & Quotas", icon: <Activity size={16} /> },
  { href: "/notices", label: "Notices", icon: <Bell size={16} /> },
  { href: "/audit", label: "Audit Trail", icon: <ClipboardList size={16} /> },
  { href: "/feature-flags", label: "Feature Flags", icon: <Flag size={16} /> },
];

export function AdminNav() {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";

  return (
    <AppSidebar
      brand="DRTS Fleet"
      brandSub="Platform Admin"
      brandIcon={<Shield size={16} color="white" />}
      navItems={NAV_ITEMS}
      currentPath={pathname}
      footer="Staging Environment"
    />
  );
}
