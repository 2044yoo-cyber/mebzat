import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Medosha is the professional network and marketplace for the construction industry.",
};

export default function AboutPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">About Medosha</h1>
      <p className="text-lg text-muted-foreground">
        Medosha is the professional network and marketplace for construction —
        one place to discover professionals, showcase projects, and source
        materials.
      </p>
      <p className="leading-relaxed">
        The construction industry runs on relationships and reputation, yet the
        tools for finding the right architect, contractor, or supplier are
        scattered across directories, group chats, and word of mouth. Medosha
        brings homeowners, architects, engineers, contractors, developers, and
        suppliers onto a single platform where work speaks for itself.
      </p>
      <p className="leading-relaxed">
        Professionals build a portfolio of real projects, suppliers list
        products in an open marketplace, and everyone can find and connect with
        the people they need — starting in Africa and built to scale globally.
      </p>
      <h2 className="pt-4 text-xl font-semibold">What you can do today</h2>
      <ul className="list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground">
        <li>Create a professional or company profile.</li>
        <li>Publish projects with photos, materials, and details.</li>
        <li>List products in the marketplace and reach buyers.</li>
        <li>Discover suppliers, contractors, and professionals near you.</li>
      </ul>
    </article>
  );
}
