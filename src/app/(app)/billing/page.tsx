import { Suspense } from "react";
import { BillingView } from "@/components/billing-view";
export const metadata = { title: "Credits" };
export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingView />
    </Suspense>
  );
}
