import { CertificateSupportDetailScreen } from "../certificate-support-screen";

export default async function MultiTaxiCertificateDetailPage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;
  return <CertificateSupportDetailScreen certificateId={certificateId} />;
}
