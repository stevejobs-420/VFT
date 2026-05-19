import { requireUser } from "@/lib/auth";

export default async function MatchesPage() {
  await requireUser();
  return (
    <section>
      <h1>Zápasy</h1>
      <p style={{ marginTop: "0.75rem", color: "var(--muted)" }}>
        Tady bude kompletní rozpis i výsledky všech zápasů MS 2026.
      </p>
    </section>
  );
}
