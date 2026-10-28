/** Explicit chat identity; absent for canvas and workflow callers. */
export type MediaConversationTurn = {
  conversationId: string;
  turnId: string;
  inheritedInputs?: boolean;
};

export function mediaConversationFields(turn?: MediaConversationTurn) {
  return turn?.conversationId && turn.turnId
    ? {
        conversation_id: turn.conversationId,
        turn_id: turn.turnId,
        ...(turn.inheritedInputs ? { context_inputs_inherited: true } : {}),
      }
    : {};
}
