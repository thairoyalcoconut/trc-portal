import { redirect } from "next/navigation";

// Root just forwards to the dashboard; middleware handles the
// "must be logged in" redirect to /login if there's no session.
export default function Home() {
  redirect("/dashboard");
}
