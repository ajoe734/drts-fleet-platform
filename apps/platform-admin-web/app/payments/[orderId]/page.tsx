import { PaymentExceptionDetail } from "./payment-exception-detail";

export default async function PaymentExceptionPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PaymentExceptionDetail orderId={orderId} />;
}
