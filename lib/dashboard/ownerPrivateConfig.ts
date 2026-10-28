/**
 * Slot `config` keys that are the board OWNER's private settings.
 *
 * One list, read by the two places that must agree on it:
 *
 *   - `toSnapshotSlots` (`api.ts`) strips them from every stored render. A
 *     snapshot is not private — the backend mirrors it onto an active public
 *     share — so a key left in there is published to anyone holding the link.
 *   - `applyDefinitionOwnedConfig` (`refreshMerge.ts`) takes them from the
 *     DEFINITION on reopen. Because the snapshot never carries them, the
 *     definition is the only place they live, and a stale snapshot must not
 *     resurrect one the owner removed.
 *
 * These two used to spell the list separately, so adding a key to one would
 * have left it either leaking into shares or silently dropped on reopen.
 *
 * NOT the security boundary. The backend's `ownerPrivateSlotConfigKeys`
 * (`internal/domain/dashboard_share_snapshot.go`) strips the same keys from
 * what a share link serves, and it is the authority: a client can be old,
 * modified or absent. Any key added here must be added there too, and the
 * other way round.
 */
export const OWNER_PRIVATE_SLOT_CONFIG_KEYS = ["alert_rule"] as const;
