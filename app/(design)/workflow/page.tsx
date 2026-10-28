import { redirect } from "next/navigation";

export default function WorkflowRoutePage() {
  // No id → not a workflow. The editor lives at /workflow/:id; send the
  // user to the project list to pick or create one.
  redirect("/flow");
}
