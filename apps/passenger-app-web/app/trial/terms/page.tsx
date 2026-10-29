import { trialT } from "../../../components/trial/translations";

export default function TrialTerms() {
  return (
    <main
      style={{ padding: 18, maxWidth: 640, margin: "0 auto", lineHeight: 1.7 }}
    >
      <h1 style={{ fontSize: 20 }}>{trialT.termsTitle}</h1>
      {trialT.termsBody.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <a href="/trial">{trialT.backToTrial}</a>
    </main>
  );
}
