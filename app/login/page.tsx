// The product zone mounts /login so it authenticates on its OWN origin.
//
// In production the browser always sits on the landing origin, so this copy is
// never reached — landing owns /login and does not rewrite it here. It exists so
// `npm run dev:app` alone works: hitting localhost:3001/app with no session
// redirects to localhost:3001/login (proxy.ts), signs in here, and writes the CDP
// tokens into port 3001's localStorage. localStorage is keyed by origin — scheme,
// host AND port — so tokens written by the landing zone on :3000 are invisible here.
export { LoginPage as default } from "@/components/login/LoginPage";
