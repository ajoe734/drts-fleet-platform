"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@drts/ui-web";
import {
  LayoutDashboard,
  Truck,
  Users,
  FileText,
  Flag,
  Clock,
  Radio,
  MessageSquareWarning,
  Phone,
  BarChart3,
  DollarSign,
  AlertTriangle,
  Wrench,
} from "lucide-react";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={16} />,
  },
  { href: "/dispatch", label: "Dispatch", icon: <Truck size={16} /> },
  {
    href: "/complaints",
    label: "Complaints",
    icon: <MessageSquareWarning size={16} />,
  },
  { href: "/callcenter", label: "Call Center", icon: <Phone size={16} /> },
  { href: "/reports", label: "Reports", icon: <BarChart3 size={16} /> },
  { href: "/revenue", label: "Revenue", icon: <DollarSign size={16} /> },
  { href: "/attendance", label: "Attendance", icon: <Clock size={16} /> },
  { href: "/incidents", label: "Incidents", icon: <AlertTriangle size={16} /> },
  { href: "/maintenance", label: "Maintenance", icon: <Wrench size={16} /> },
  { href: "/vehicles", label: "Vehicles", icon: <Truck size={16} /> },
  { href: "/drivers", label: "Drivers", icon: <Users size={16} /> },
  { href: "/contracts", label: "Contracts", icon: <FileText size={16} /> },
  { href: "/feature-flags", label: "Feature Flags", icon: <Flag size={16} /> },
];

export function Sidebar() {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";

  return (
    <AppSidebar
      brand="DRTS Fleet"
      brandSub="Ops Console"
      brandIcon={<Radio size={16} color="white" />}
      navItems={NAV}
      currentPath={pathname}
      footer="Staging Environment"
    />
  );
}
