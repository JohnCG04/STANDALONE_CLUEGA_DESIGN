import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "cluega-home",
    timestamp: new Date().toISOString(),
  });
}
