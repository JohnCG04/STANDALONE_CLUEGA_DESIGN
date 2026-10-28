// The skill card's updated-at label.
//
// The implementation is shared with every other list that shows "how long ago"
// (`@/lib/time/relativeTime`); these names stay so the skill module and its
// tests keep reading the way they did.
export { relativeTime as relativeUpdatedAt, preciseTime as preciseUpdatedAt } from "@/lib/time/relativeTime";
