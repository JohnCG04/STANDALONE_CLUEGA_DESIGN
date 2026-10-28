/**
 * What the chat composer says its uploads are FOR (BUG-AI-0668).
 *
 * The composer uploads a file the moment it is picked — before the message is
 * sent, often before it is written. Without saying why, the backend filed every
 * one into the Library as an "Uploaded" card, so a file attached and never sent
 * became a permanent asset. PRD v1.6 §3.2 gives the Library three ingestion
 * paths — an upload made in the Library, output generated in a conversation,
 * output of a workflow — and an attachment is none of them, so the backend
 * keeps a file sent with this purpose out of the Library altogether
 * (`domain.MediaPurposeChatAttachment`). It stays usable in the chat.
 */
export const CHAT_ATTACHMENT_PURPOSE = "chat_attachment";
