import type { Metadata } from "next";

import { DesignShell } from "@/components/design-shell/DesignShell";
import { FlowBrandKitPage } from "@/resources/app/pages/app/components/Flow/brand-kit";

export const metadata: Metadata = {
  title: "New Brand Kit",
};

export default function FlowBrandKitNewRoute() {
  return (
    <DesignShell>
      <FlowBrandKitPage />
    </DesignShell>
  );
}
