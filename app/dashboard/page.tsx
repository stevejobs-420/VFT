import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  await requireUser();
  return (
    <section>
      <h1>Žebříček</h1>
      <p style={{ marginTop: "0.75rem", color: "var(--muted)" }}>
        Tady uvidíš pořadí všech tipujících podle nasbíraných bodů.
      </p>
    </section>
  );
}
