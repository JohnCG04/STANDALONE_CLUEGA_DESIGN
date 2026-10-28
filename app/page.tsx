import { redirect } from "next/navigation";

// The app is Cluega Design only: its home is the Flow workspace.
export default function RootPage() {
  redirect("/flow");
}
