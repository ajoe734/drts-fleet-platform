import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { getDeskById } from "@/lib/desk-catalog";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DegradedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const desk = getDeskById(getQueryValue((await searchParams).desk));

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">Degraded</span>
        <h1>Desk remains visible, but booking creation is blocked.</h1>
        <p>
          A degraded portal state should not pretend the desk is healthy. This
          route keeps read-only visibility and escalation instructions explicit
          until the site lane recovers.
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">Desk health</span>
          <h2>{desk ? desk.deskName : "Degraded desk"}</h2>
          <p>
            {desk
              ? `${desk.siteName} is deliberately marked degraded in the repo-local catalog.`
              : "The selected desk is degraded or unavailable for create actions."}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/lookup">
              Continue in read-only lookup
            </Link>
            <Link className="secondary-link" href="/callbacks">
              Continue with callback follow-up
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">Escalation</span>
          <h2>Ops control plane stays upstream.</h2>
          <p>
            When the desk is degraded, the assisted-entry shell stops at lookup
            and callback handling. Broader remediation stays in the ops
            callcenter / dispatch workspace.
          </p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              Open ops callcenter
            </a>
            <Link className="secondary-link" href="/start">
              Choose another desk
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
