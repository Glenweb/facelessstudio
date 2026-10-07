import { getCurrentUser } from "@/lib/auth/guard";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      creditsBalance: user.creditsBalance,
    },
  });
});
