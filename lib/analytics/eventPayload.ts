import { eventIdentifiers } from "./browserIdentity";

// What one product event looks like on the wire.
//
// Separate from productEvents.ts, which owns the transport, for a reason the
// test runner forces: `tsx --test` does not resolve the `@/` path alias, and
// productEvents.ts imports `@/config/cdp-api`. Anything importable from a test
// therefore has to reach only relative modules -- so the SHAPE of an event
// lives here, where it can be asserted, and the queueing and flushing stay
// there.
//
// Field names are snake_case because they are the wire fields, read by CDP's
// EventInput and then by mid-platform's own columns. They are siblings of
// `name` and `props`, never nested inside `props`: the raw store has a column
// for each, and `actor_key` -- what every funnel groups on -- is the user id
// falling back to `anonymous_id`. Inside `props` those columns would be empty
// and no funnel could follow anyone from before they logged in.

export type EventProps = Record<string, unknown>;

export type QueuedEvent = {
  name: string;
  ts: string;
  props?: EventProps;
  anonymous_id?: string;
  session_id?: string;
  event_id?: string;
};

/**
 * Builds one event, stamped now and carrying the browser's ids.
 *
 * Called when the event is QUEUED rather than when the batch flushes:
 * `event_id` identifies this event, and the session's last-seen mark belongs at
 * the moment of the action, not up to three seconds later when the batch
 * happens to leave.
 */
export function buildEvent(name: string, props?: EventProps): QueuedEvent {
  return {
    name,
    ts: new Date().toISOString(),
    ...eventIdentifiers(),
    // Omitted rather than sent empty: an absent key and `{}` mean the same
    // thing to the server, and the smaller body matters for a keepalive send.
    ...(props && Object.keys(props).length > 0 ? { props } : {}),
  };
}
