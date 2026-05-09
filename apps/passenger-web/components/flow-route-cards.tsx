import Link from "next/link";
import type { FlowRoute } from "@/lib/navigation";

export function FlowRouteCards({
  routes,
  emphasizeKind,
}: {
  routes: FlowRoute[];
  emphasizeKind?: FlowRoute["kind"];
}) {
  return (
    <section className="content-grid">
      {routes.map((route) => {
        const isEmphasized = emphasizeKind
          ? route.kind === emphasizeKind
          : false;
        return (
          <Link
            className={`flow-route-card flow-route-${route.kind}${isEmphasized ? " is-emphasized" : ""}`}
            href={route.href}
            key={route.href}
          >
            <span className={`state-pill state-pill-${route.kind}`}>
              {route.outcome}
            </span>
            <h3>{route.label}</h3>
            <p>{route.body}</p>
            <span className="text-link route-link">
              Open route → {route.href}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
