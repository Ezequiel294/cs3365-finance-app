import { redirect } from "next/navigation";
import { sessionService } from "@/lib/session";

export default async function Home() {
  const session = await sessionService.getSession();
  redirect(session ? "/dashboard" : "/signin");
}
