import { DEMO_T as T } from "../../../lib/demo/translations";
export default function DemoPrivacyPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>{T.privacyTitle}</h1>
      <p>{T.privacyBody}</p>
      <a href="/demo">{T.about}</a>
    </main>
  );
}
