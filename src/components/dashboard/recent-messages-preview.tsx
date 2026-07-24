import { MessageSquare } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RecentMessagesPreview() {
  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>Messages</CardTitle>
        <CardDescription>Direct messaging is coming soon.</CardDescription>
      </CardHeader>
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
        <MessageSquare className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      </div>
    </Card>
  );
}
