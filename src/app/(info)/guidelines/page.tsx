import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    "What you can and cannot post on Medosha, and what happens when something breaks the rules.",
};

/**
 * Written to be read by somebody who has just had a post blocked and is
 * annoyed. Short sentences, no legal register, and the consequences stated
 * plainly — a policy nobody finishes reading protects nobody.
 */

const NOT_ALLOWED = [
  {
    title: "Sexual and explicit content",
    body: "Nudity, pornography, sexual acts, and adverts for sexual services. Medosha is a place of work.",
  },
  {
    title: "Anything sexual involving a child",
    body: "Removed immediately, never published, the account is restricted, and it is reported to the authorities. There is no appeal and no second chance for this one.",
  },
  {
    title: "Harassment and bullying",
    body: "Going after a person rather than disagreeing with their work. Repeated unwanted contact counts.",
  },
  {
    title: "Hate speech",
    body: "Attacking people for their ethnicity, religion, nationality, gender, disability, or who they are.",
  },
  {
    title: "Violence and threats",
    body: "Threatening harm, or celebrating it.",
  },
  {
    title: "Scams and fraud",
    body: "Fake listings, advance-fee requests, impersonating a business, or fake prices to draw enquiries.",
  },
  {
    title: "Spam",
    body: "The same post over and over, unrelated links, or engagement bait.",
  },
  {
    title: "Illegal content",
    body: "Anything the law of Ethiopia prohibits, including counterfeit goods and stolen material.",
  },
];

export default function GuidelinesPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Community Guidelines
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          Medosha is where people find the professionals, materials and work
          that build things. These rules exist so it stays usable for that.
          They apply to everything you post: listings, projects, posts,
          comments, photos, videos and your profile.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">What is not allowed</h2>
        <ul className="space-y-4">
          {NOT_ALLOWED.map((rule) => (
            <li key={rule.title} className="space-y-1">
              <h3 className="font-medium text-foreground">{rule.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {rule.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How we check</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          What you upload is checked automatically before anyone else can see
          it. Most things pass in a moment. If a check is uncertain, a person
          looks at it before it goes live rather than it being refused
          outright — automated checks get things wrong, and we would rather be
          slow than unfair.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You will see one of three things: <strong>Published</strong>,{" "}
          <strong>Under review</strong>, or a message saying the content cannot
          be published.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Reporting</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every post, comment, listing and profile has a Report option.
          Reporting something does not delete it — it puts it in front of a
          moderator. Reports are not anonymous to us, and filing them in bulk
          to bury a competitor is itself a violation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What happens if you break them</h2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">First time, minor:</strong> the
            content comes down and you get a warning.
          </li>
          <li>
            <strong className="text-foreground">Repeatedly:</strong> you are
            temporarily unable to post while the restriction lasts.
          </li>
          <li>
            <strong className="text-foreground">Repeatedly, serious:</strong>{" "}
            the account is suspended.
          </li>
          <li>
            <strong className="text-foreground">Severe:</strong> immediate
            restriction and escalation to the authorities where the law
            requires it.
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          An account is never suspended by an automated check alone. A person
          decides.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">If we get it wrong</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You can appeal any decision, and a moderator who did not make the
          original call will read it. Tell us what the content actually was and
          why you think the decision was wrong.
        </p>
      </section>

      <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
        Questions about a decision?{" "}
        <Link href="/contact" className="text-brand hover:underline">
          Contact us
        </Link>
        .
      </footer>
    </article>
  );
}
