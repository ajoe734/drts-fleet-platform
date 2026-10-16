import { t } from "../../../components/review-demo/translations";
export default function ReviewTerms() {
  return (
    <main style={{ padding: 18 }}>
      <h1>{t.termsTitle}</h1>
      <p>{t.termsVersion}</p>
      <p>{t.termsPersistence}</p>
      <p>{t.termsSimulation}</p>
      <a href="/review">{t.backToReview}</a>
    </main>
  );
}
