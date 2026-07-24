import { Suspense } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader className="gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
          </CardHeader>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
