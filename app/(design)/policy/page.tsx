import { PolicyDocument } from "@/components/policy/PolicyDocument";

// Opened in a new tab from the workflow account menu (`footerLinks`), so it is a
// standalone reading page — no app chrome, no consent gate. Language comes from
// the I18nProvider mounted in app/(design)/layout.tsx (cluega-language cookie).
export default function PolicyPage() {
  return (
    <main className="min-h-screen w-full bg-background">
      <PolicyDocument />
    </main>
  );
}
