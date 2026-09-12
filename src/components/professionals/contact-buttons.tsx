import Link from "next/link";
import { MessageCircle, Phone, User } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { whatsappNumber } from "@/lib/contact/phone";
import { cn } from "@/lib/utils";

/**
 * Call, WhatsApp, Request Quote.
 *
 * The number is only here when the professional turned `show_phone` on. When
 * they have not, the buttons are not drawn greyed out and they are not drawn
 * pretending to work: what is offered instead is the profile and a quote
 * request, which are the two routes that exist for somebody who has kept their
 * number private. A `tel:` link to nothing is worse than no button, because
 * whoever taps it concludes the app is broken rather than that the number was
 * never published.
 *
 * `buttonVariants` on a Link rather than a Button wrapping one: this Button is
 * a Base UI primitive with no `asChild`, and the rest of the app styles its
 * link-buttons this way.
 */

export function ContactButtons({
  username,
  name,
  phone,
  className,
}: {
  username: string | null;
  name: string;
  phone?: string | null;
  className?: string;
}) {
  const wa = phone ? whatsappNumber(phone) : null;
  const outline = buttonVariants({ variant: "outline", size: "sm" });
  const solid = buttonVariants({ size: "sm" });

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {phone ? (
        <>
          <a href={`tel:${phone}`} className={cn(outline, "min-h-11")}>
            <Phone className="size-4" /> Call
          </a>
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(outline, "min-h-11")}
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          ) : (
            <Link href={`/u/${username}`} className={cn(outline, "min-h-11")}>
              <User className="size-4" /> Profile
            </Link>
          )}
        </>
      ) : (
        <Link href={`/u/${username}`} className={cn(outline, "min-h-11")}>
          <User className="size-4" /> View profile
        </Link>
      )}

      <Link
        href={`/hire/new?to=${username ?? ""}`}
        title={`Request a quote from ${name}`}
        className={cn(solid, "min-h-11", phone && "col-span-2")}
      >
        Request Quote
      </Link>
    </div>
  );
}
