import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
