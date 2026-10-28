/**
 * `@dogclaw-ad/workflow-agent` ships its own types, so only the pre-compiled
 * stylesheet needs declaring: Next declares `*.module.css` but not a plain
 * `.css` subpath import — the same gap dogclaw-workflow.d.ts closes for the
 * editor package.
 */
declare module "@dogclaw-ad/workflow-agent/styles.css" {
  const css: string;
  export default css;
}
