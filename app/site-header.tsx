import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="site-header">
      <Link href="/" className="site-title">VFT</Link>
      {user ? (
        <nav className="site-nav">
          <Link href="/predict">Tipy</Link>
          <Link href="/matches">Zápasy</Link>
          <Link href="/dashboard">Žebříček</Link>
          <form action={signOut}>
            <button type="submit" className="site-nav-button">Odhlásit</button>
          </form>
        </nav>
      ) : null}
    </header>
  );
}
