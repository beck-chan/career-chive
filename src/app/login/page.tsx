import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { flags } from "@/lib/flags";
import { careerchiveHref } from "@/lib/paths";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (!flags.private) {
    redirect(careerchiveHref("/"));
  }
  if (await getSession()) {
    redirect(careerchiveHref("/"));
  }
  return (
    <div className="page-cols">
      <div className="page-state-full">
        <LoginForm />
      </div>
    </div>
  );
}
