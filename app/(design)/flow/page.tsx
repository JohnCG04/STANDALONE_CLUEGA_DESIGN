import type { Metadata } from "next";

import { DesignShell } from "@/components/design-shell/DesignShell";
import { FlowPage } from "@/resources/app/pages/app/components/Flow";

export const metadata: Metadata = {
  title: "Workflow",
};

export default function FlowRoute() {
  return (
    <DesignShell>
      <FlowPage />
    </DesignShell>
  );
}
