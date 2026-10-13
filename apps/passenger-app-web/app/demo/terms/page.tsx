import { DEMO_T as T } from "../../../lib/demo/translations";
export default function DemoTermsPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>{T.termsTitle}</h1>
      <p>{T.legalBody}</p>
      <a href="/demo">{T.about}</a>
    </main>
  );
}
