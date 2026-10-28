import type { Metadata } from "next";

import { DesignShell } from "@/components/design-shell/DesignShell";
import { FlowBrandKitPage } from "@/resources/app/pages/app/components/Flow/brand-kit";

export const metadata: Metadata = {
  title: "Brand Kit",
};

export default function FlowBrandKitDetailRoute() {
  return (
    <DesignShell>
      <FlowBrandKitPage />
    </DesignShell>
  );
}
