import { Bell } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function RecentNotifications() {
  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
        <Bell className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
      </div>
    </Card>
  );
}
