"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        ...(isSignup ? { name } : {}),
        email,
        password,
      });
      // A full navigation, not router.push: the shell reads the session cookie
      // on mount and a client-side transition can race the Set-Cookie.
      window.location.href = next;
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Something went wrong. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="aurora flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-500">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="font-semibold tracking-tight">Faceless Video Studio</span>
        </Link>

        <div className="panel p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-400">
            {isSignup
              ? "300 free credits, no card needed."
              : "Sign in to pick up where you left off."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {isSignup && (
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Glen"
                />
              </Field>
            )}

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </Field>

            <Field
              label="Password"
              hint={isSignup ? "At least 8 characters." : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isSignup ? 8 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder="••••••••"
              />
            </Field>

            {error && <Alert tone="bad">{error}</Alert>}

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[13px] text-ink-400">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="text-brand-300 hover:text-brand-400"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
