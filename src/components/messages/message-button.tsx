import { MessageSquare } from "lucide-react";

import {
  openCompanyConversation,
  openDirectConversation,
} from "@/app/(dashboard)/messages/actions";
import { Button } from "@/components/ui/button";
import type { MessageContext } from "@/types/database.types";

type BaseProps = {
  /** What the conversation is about, so the thread opens with context. */
  contextType?: MessageContext;
  contextId?: string;
  subject?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
};

type MessageUserProps = BaseProps & { userId: string; companyId?: never };
type MessageCompanyProps = BaseProps & { companyId: string; userId?: never };

/**
 * "Message" button for a profile, project, product, or company. Submits to the
 * server action, which reuses the existing thread when there is one, so this
 * can be dropped anywhere without creating duplicate conversations.
 */
export function MessageButton({
  userId,
  companyId,
  contextType,
  contextId,
  subject,
  label = "Message",
  variant = "outline",
  size = "default",
  className,
}: MessageUserProps | MessageCompanyProps) {
  const action = companyId ? openCompanyConversation : openDirectConversation;

  return (
    <form action={action} className={className}>
      {companyId ? (
        <input type="hidden" name="companyId" value={companyId} />
      ) : (
        <input type="hidden" name="userId" value={userId} />
      )}
      {contextType && (
        <input type="hidden" name="contextType" value={contextType} />
      )}
      {contextId && <input type="hidden" name="contextId" value={contextId} />}
      {subject && <input type="hidden" name="subject" value={subject} />}

      <Button type="submit" variant={variant} size={size} className="w-full">
        <MessageSquare data-icon="inline-start" />
        {label}
      </Button>
    </form>
  );
}

