"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button className="btn" onClick={handleClick}>
      Sign out
    </button>
  );
}
