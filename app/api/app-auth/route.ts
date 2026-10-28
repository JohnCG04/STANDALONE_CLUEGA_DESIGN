// Mounted so the product zone can mint its own app_auth cookie + CDP tokens when
// run standalone. Signs with the same secret as the landing zone's copy, so the
// cookie is interchangeable between the two.
export { POST, DELETE } from "@/lib/auth/app-auth-route";
