import { redirect } from "next/navigation";
import { supabaseSession } from "@/lib/supabase/session";

export default async function Home() {
  const db = await supabaseSession();
  const {
    data: { user },
  } = await db.auth.getUser();
  redirect(user ? "/dashboard" : "/sign-in");
}
