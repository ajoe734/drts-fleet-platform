import Link from "next/link";
import { formatDeskMode, getDeskById } from "@/lib/desk-catalog";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const deskId = getQueryValue(query.desk);
  const mode = getQueryValue(query.mode);
  const desk = getDeskById(deskId);

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">Denied</span>
        <h1>The selected desk lane does not have authority for this desk.</h1>
        <p>
          The portal keeps role mismatch explicit instead of silently widening
          access. This is the assisted-entry counterpart to a denied auth row in
          the full-system UI matrix.
        </p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">Reason</span>
        <h2>{desk ? desk.deskName : "Desk mismatch"}</h2>
        <p>
          {desk && mode
            ? `${formatDeskMode(mode as "concierge_operator" | "call_point_operator")} cannot operate ${desk.deskName}.`
            : "A mode / desk mismatch occurred before booking creation."}
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            Choose another desk
          </Link>
          <Link className="secondary-link" href="/login">
            Re-bootstrap operator lane
          </Link>
        </div>
      </section>
    </div>
  );
}
