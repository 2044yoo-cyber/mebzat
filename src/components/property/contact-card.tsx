"use client";

import { useState } from "react";
import { Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";

import { telHref, whatsappHref, type ContactMethod } from "@/lib/property/listing";
import { cn } from "@/lib/utils";

/**
 * How to reach the seller.
 *
 * Numbers are hidden behind a tap rather than printed in the markup. Property
 * listings are scraped for phone numbers constantly, and a number that is only
 * rendered after a click is a great deal less useful to a bot than one sitting
 * in the initial HTML.
 *
 * The preferred method is shown first and larger, because a seller who says
 * "WhatsApp" means it — calling them is how you get no answer.
 */
export function ContactCard({
  phone,
  phoneAlt,
  whatsapp,
  email,
  preferred = "call",
  propertyTitle,
  onMessage,
}: {
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  email: string | null;
  preferred?: ContactMethod;
  propertyTitle: string;
  onMessage?: () => void;
}) {
  const [shown, setShown] = useState(false);

  const waHref = whatsapp
    ? whatsappHref(whatsapp, `Hello, I saw "${propertyTitle}" on Medosha.`)
    : null;

  const nothing = !phone && !whatsapp && !email && !onMessage;
  if (nothing) return null;

  const order: ContactMethod[] = [
    preferred,
    ...(["call", "whatsapp", "message", "email"] as ContactMethod[]).filter(
      (method) => method !== preferred,
    ),
  ];

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div>
        <h2 className="font-medium">Contact</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Preferred: {preferred === "call" ? "phone call" : preferred}
        </p>
      </div>

      <div className="grid gap-2">
        {order.map((method, index) => {
          const primary = index === 0;

          if (method === "call" && phone) {
            return (
              <a
                key="call"
                href={shown ? telHref(phone) : undefined}
                onClick={(event) => {
                  if (!shown) {
                    event.preventDefault();
                    setShown(true);
                  }
                }}
                className={cn(button(primary))}
              >
                <Phone className="size-4" />
                {shown ? phone : "Show number"}
              </a>
            );
          }

          if (method === "whatsapp" && waHref) {
            return (
              <a
                key="whatsapp"
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(button(primary))}
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            );
          }

          if (method === "message" && onMessage) {
            return (
              <button
                key="message"
                type="button"
                onClick={onMessage}
                className={cn(button(primary))}
              >
                <MessageSquare className="size-4" />
                Message on Medosha
              </button>
            );
          }

          if (method === "email" && email) {
            return (
              <a
                key="email"
                href={`mailto:${email}?subject=${encodeURIComponent(propertyTitle)}`}
                className={cn(button(primary))}
              >
                <Mail className="size-4" />
                Email
              </a>
            );
          }

          return null;
        })}
      </div>

      {phoneAlt && shown && (
        <p className="text-xs text-muted-foreground">
          Second number:{" "}
          <a href={telHref(phoneAlt)} className="text-brand hover:underline">
            {phoneAlt}
          </a>
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Medosha never asks you to pay a deposit before viewing a property.
      </p>
    </section>
  );
}

function button(primary: boolean): string {
  return cn(
    "flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
    primary
      ? "bg-brand text-brand-foreground hover:opacity-90"
      : "border hover:border-brand",
  );
}
