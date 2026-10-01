import { redirect } from "next/navigation";

/**
 * "/" has no content of its own. The proxy already sends anonymous visitors to
 * /login; anyone with a session lands in the handbook (same place login
 * sends them). The old design-system demo that lived here is now at
 * /design-system.
 */
export default function Home() {
  redirect("/handbook");
}
