import { NextRequest, NextResponse } from "next/server";

/** Share-target fallback. The service worker normally answers POST /share itself and keeps the file
 *  on the device; this only runs when it is not installed yet, so send the user home. */
export function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/", req.url), 303);
}
