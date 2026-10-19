import { BureauReviewPage } from "../../components/bureau-review/BureauReviewPage";

// Force per-request rendering: this page reads process.env.PAX_BUREAU_ENTRY_HOST
// (set only on the deployed Cloud Run revision, never at Docker build time — see
// deploy-dev.yml and the Dockerfile). Without this, Next's default static
// prerendering would capture the empty build-time value once and keep serving
// it forever, even after the host is configured at runtime
// (entry-R4-runtime-page-review/findings.json,
// https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic).
export const dynamic = "force-dynamic";

export default function Page() {
  return <BureauReviewPage />;
}
