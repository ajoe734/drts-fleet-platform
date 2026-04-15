/**
 * Platform Admin Web - Navigation Sidebar
 * Provides consistent navigation across all admin pages.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/tenants", label: "Tenants" },
  { href: "/users", label: "Users" },
  { href: "/fleet", label: "Fleet" },
  { href: "/switchboard", label: "Switchboard" },
  { href: "/pricing", label: "Pricing" },
  { href: "/payments", label: "Payments" },
  { href: "/health", label: "Health" },
  { href: "/notices", label: "Notices" },
  { href: "/audit", label: "Audit" },
  { href: "/feature-flags", label: "Feature Flags" },
];

export function AdminNav() {
  const pathname = usePathname();
  const currentPath = pathname || "";

  return (
    <nav className="admin-nav">
      <div className="admin-nav-header">
        <span className="admin-nav-title">Platform Admin</span>
      </div>
      <ul className="admin-nav-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="admin-nav-item">
            <Link
              href={item.href}
              className={`admin-nav-link ${
                currentPath === item.href ? "active" : ""
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
