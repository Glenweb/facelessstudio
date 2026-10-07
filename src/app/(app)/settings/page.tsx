import { Suspense } from "react";
import { SettingsView } from "@/components/settings-view";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}
