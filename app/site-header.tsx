import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function SiteHeader() {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const themeCookie = cookieStore.get("vft-theme")?.value;
  const initialTheme: "light" | "dark" | null =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : null;

  return (
    <header className="site-header">
      <Link href="/" className="site-title">VFT</Link>
      <nav className="site-nav">
        {user && (
          <>
            <Link href="/predict">Tipy</Link>
            <Link href="/matches">Zápasy</Link>
            <Link href="/dashboard">Žebříček</Link>
            <form action={signOut}>
              <button type="submit" className="site-nav-button">Odhlásit</button>
            </form>
          </>
        )}
        <ThemeToggle initialTheme={initialTheme} />
      </nav>
    </header>
  );
}
