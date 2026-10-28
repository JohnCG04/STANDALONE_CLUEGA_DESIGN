declare module "@dogclaw-ad/workflow" {
  import type { ComponentType } from "react";

  export type HostModelEntry = any;
  export type ImageModel = any;
  export type WorkflowTheme = "light" | "dark";
  export type WorkflowLocale = "en" | "vi" | "zh";
  export type ProjectMenuConfig = any;
  export type WorkflowHeaderConfig = any;
  export type WorkflowActions = any;
  export type AssetsPanelConfig = any;
  export type WorkflowAsset = any;
  export type Asset = any;
  export type AssetAction = any;
  export type AssetSource = "creation" | "upload";
  export type AssetsTab = AssetSource | "characters";
  export type AssetType = "image" | "video" | "audio" | "document";
  export type AssetKind = "image" | "video";
  export type ImageInput = any;
  export type StoryboardRequest = any;
  export type ObjectRect = {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  export type BlendMode = string;
  export type LogoPlacement = any;
  export type LogoPosition = any;
  export type PlaceRelativeTo = any;
  export type WorkflowDocument = any;
  export type AutoSaveResult = any;
  /** The canvas pan/zoom — `WorkflowEditor`'s `defaultViewport` / `onViewportChange`. */
  export type WorkflowViewport = { x: number; y: number; zoom: number };

  /**
   * One row of the Content panel's Pages list — a project split across several
   * canvases. Host-owned: the editor renders the row and reports intent, and
   * never invents, numbers, orders or stores one.
   */
  export interface WorkflowPageItem {
    /** Opaque, stable id, echoed back on every callback. */
    id: string;
    /** Row label, rendered exactly as passed and never translated. */
    name: string;
    /** Disables the row's actions while the host is busy with it. */
    busy?: boolean;
  }
  export type WorkflowVariableKind = "image" | "video" | "audio" | "text";
  /** One media file of a variable, snapshotted from the library. */
  export interface WorkflowVariableItem {
    id?: string;
    url: string;
    thumbnailUrl?: string;
    mimeType?: string;
    title?: string;
  }
  /** A saved project variable; rows drag onto the canvas as `variable` nodes. */
  export interface WorkflowVariable {
    id: string;
    name: string;
    kind: WorkflowVariableKind;
    items?: WorkflowVariableItem[];
    text?: string;
  }
  export type CharacterStatus = "processing" | "active" | "failed";
  /** One character of the workspace's library; the Assets panel's Characters tab lists `active` ones. */
  export interface WorkflowCharacter {
    id: string;
    name: string;
    coverUrl?: string;
    status: CharacterStatus;
    failureReason?: string;
  }
  /** The Character node's saved data; `draft` belongs to the host. */
  export interface CharacterNodeData {
    characterIds?: string[];
    draft?: unknown;
  }
  /** One image wired into the Character node; `media` only while `status` is `ready`. */
  export interface CharacterNodeInput {
    sourceId: string;
    sourceLabel?: string;
    status: SocialPostInputStatus;
    media?: SocialPostMedia;
  }
  /** What the `characters` prop's `Body` receives inside the Character node. */
  export interface CharacterNodeBodyProps {
    nodeId: string;
    /** Images wired into the node's `images` input, in wiring order. */
    inputs: CharacterNodeInput[];
    data: CharacterNodeData;
    onDataChange: (updater: (d: CharacterNodeData) => CharacterNodeData) => void;
    readOnly?: boolean;
  }
  /** The `characters` prop: the Character node's body and the Assets panel's Characters tab. */
  export interface WorkflowCharactersConfig {
    characters: WorkflowCharacter[];
    loading?: boolean;
    Body?: ComponentType<CharacterNodeBodyProps>;
  }
  /** The `variables` prop; `onCreate` opens the host's own picker. */
  export interface WorkflowVariablesConfig {
    items?: WorkflowVariable[];
    loading?: boolean;
    onCreate?: () => void;
    onRename?: (variable: WorkflowVariable, name: string) => Promise<void> | void;
    onDelete?: (variable: WorkflowVariable) => Promise<void> | void;
  }
  /**
   * The `pages` prop. Headless: the editor keeps no page list and no off-screen
   * graph — in particular it does NOT swap the canvas on `onSelectPage`; the
   * host loads that page's document and remounts the editor. Gated by
   * `isActiveMultiplePages`; an absent callback hides just its affordance.
   */
  export interface WorkflowPagesConfig {
    items?: WorkflowPageItem[];
    activeId?: string;
    loading?: boolean;
    onSelectPage?: (page: WorkflowPageItem) => void;
    onCreatePage?: () => void;
    onRenamePage?: (page: WorkflowPageItem, name: string) => void;
    onDuplicatePage?: (page: WorkflowPageItem) => void;
    onDeletePage?: (page: WorkflowPageItem) => void;
    /**
     * A row was dragged (or keyboard-moved) to a new slot. `next` is `items`
     * already re-ordered — hand it straight back as `items` and persist it;
     * `moved` says which page travelled and between which indices. The editor
     * keeps NO copy of the order, so the list snaps back to whatever `items`
     * says on the next render. Omitted = no drag handle on the rows.
     */
    onReorderPages?: (
      next: WorkflowPageItem[],
      moved: { page: WorkflowPageItem; from: number; to: number },
    ) => void;
    skipDeleteConfirm?: boolean;
    keepLastPage?: boolean;
    emptyLabel?: string;
  }

  /** One row in the internal Save Template dialog's Category picker. */
  export interface WorkflowTemplateCategory {
    /** Stable slug sent verbatim as the payload's `category`. Never localized. */
    id: string;
    /** Display label, rendered exactly as passed. */
    name: string;
  }
  /**
   * One row in the Save Template dialog's INDUSTRY picker — which market the
   * template serves, where the category says what kind of technique it is. The
   * axes are independent, so a template carries one category and any number of
   * industries.
   *
   * FLAT, with `parent` naming another row's `id`; the picker builds the
   * two-level view itself.
   */
  export interface WorkflowTemplateIndustry {
    /** Stable slug, sent verbatim in the payload's `industries`. Never localized. */
    id: string;
    /** Display label, rendered exactly as passed. */
    name: string;
    /** The parent row's `id`; absent for a top-level industry. */
    parent?: string;
  }
  export type WorkflowTemplateCoverType = AssetKind;
  /**
   * What `onHandleSaveTemplate` receives. snake_case on purpose: it mirrors the
   * backend template record 1:1, and its graph half is exactly what autosave
   * sends — so the host can post it without a mapping layer.
   */
  export type WorkflowTemplateCardType = "primary" | "secondary";
  export type WorkflowTemplateMediaEffect =
    | "slide-left"
    | "slide-right"
    | "slide-up"
    | "slide-down"
    | "curtain";
  export interface WorkflowTemplateMediaItem {
    url: string;
    type: WorkflowTemplateCoverType;
    asset_id?: string;
    poster?: string;
  }
  /** One entry the Save Template media scanner found on a workflow graph. */
  export interface WorkflowTemplateMedia {
    url: string;
    type: WorkflowTemplateCoverType;
    assetId?: string;
    poster?: string;
    nodeId: string;
    nodeLabel?: string;
  }
  /**
   * Scan live-shaped graph nodes (`{ id, type, data }`) for every media file
   * they hold — generations, imports, uploads, run history — deduped by url.
   * A persisted document's nodes qualify once `config` is restored to `data`.
   */
  export function collectTemplateMedia(
    nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  ): WorkflowTemplateMedia[];
  export const nodeTypes: Record<string, unknown>;
  export function inputPortsOf(
    node: { id: string; type?: string; data?: Record<string, unknown> },
    wired: ReadonlySet<string>,
    opts?: unknown,
  ): Array<{ name?: string; handle?: string; kind?: string }>;
  /**
   * Loose slug form for a field being typed into: lowercase ASCII letters,
   * digits and dashes, diacritics stripped (`đ` included); a TRAILING dash is
   * kept so "my-" survives the keystroke. `slugify` trims it for the wire.
   */
  export function slugifyDraft(input: string): string;
  /** The wire slug: `slugifyDraft` with the trailing dash trimmed; `""` when nothing survives. */
  export function slugify(input: string): string;
  /** One piece of authored copy in each language the wizards offer. */
  export interface WorkflowLocalizedText {
    en: string;
    vi: string;
    zh: string;
  }
  /**
   * Who can reach a published tool. Wire values, never localized; the drawer
   * opens on `"private"`, so publishing is never accidentally world-visible.
   */
  export type WorkflowToolVisibility = "public" | "team" | "private";
  export interface WorkflowTemplatePayload {
    /** English is always non-empty — Save is disabled without it. */
    name: WorkflowLocalizedText;
    description: WorkflowLocalizedText;
    /** A `WorkflowTemplateCategory.id`, or `""` when none was picked. */
    category: string;
    /** The ticked `WorkflowTemplateIndustry.id`s, in pick order; `[]` when none.
     *  Always an array, so the host can decide for itself whether to send the
     *  field at all. */
    industries: string[];
    /** Search tags as typed; absent from editors built before tags existed. */
    tags?: string[];
    status: "published" | "draft";
    /** Both cover fields are `null` when the user picked no cover. */
    primary_type: WorkflowTemplateCoverType | null;
    primary_src: string | null;
    thumbnail_url: string | null;
    card_type: WorkflowTemplateCardType;
    is_featured: boolean;
    media_items: WorkflowTemplateMediaItem[];
    media_effect: WorkflowTemplateMediaEffect | null;
    sort_order: number;
    /** What the graph observably needs and produces, derived by the editor. */
    io: WorkflowIO;
    nodes: any[];
    edges: any[];
    groups: any[];
    viewport: { x: number; y: number; zoom: number };
    global_config?: Record<string, unknown>;
  }
  /**
   * What the Save Tool wizard produces: an app someone opens and runs, rather
   * than a card in a library. It shares only its copy and its graph with a
   * template — no category, no gallery, no card layout.
   */
  export interface WorkflowToolPayload {
    name: WorkflowLocalizedText;
    description: WorkflowLocalizedText;
    /** The address the app opens this tool at; always non-empty. */
    slug: string;
    thumbnail_url: string | null;
    visibility: WorkflowToolVisibility;
    /** Always `true` — this record IS a tool. */
    is_tool: true;
    /**
     * The ends the author marked on the canvas, in pick order. GRAPH
     * REFERENCES, not media urls: an app has to put the user's value into the
     * graph and read the result back out, which a url cannot address.
     */
    tool_inputs: WorkflowIOInput[];
    tool_outputs: WorkflowIOOutput[];
    io: WorkflowIO;
    nodes: any[];
    edges: any[];
    groups: any[];
    viewport: { x: number; y: number; zoom: number };
    global_config?: Record<string, unknown>;
  }
  /** A saved template's wizard fields, under the payload's own names (edit mode). */
  export type WorkflowTemplateSeed = Partial<
    Pick<
      WorkflowTemplatePayload,
      | "name"
      | "description"
      | "category"
      | "industries"
      | "tags"
      | "card_type"
      | "is_featured"
      | "media_items"
      | "media_effect"
    >
  >;
  /** A saved tool's wizard fields, under the payload's own names (edit mode). */
  export type WorkflowToolSeed = Partial<
    Pick<
      WorkflowToolPayload,
      | "name"
      | "description"
      | "slug"
      | "thumbnail_url"
      | "visibility"
      | "tool_inputs"
      | "tool_outputs"
    >
  >;
  /**
   * `WorkflowEditor`'s `publishEdit`: open the Save Template or Save Tool wizard
   * on mount, prefilled from a saved record and pinned open; the header's publish
   * buttons are hidden while set.
   */
  export type WorkflowPublishEdit =
    | {
        kind: "template";
        seed: WorkflowTemplateSeed;
        onSave: (payload: WorkflowTemplatePayload) => void | Promise<void>;
        onExit?: () => void;
      }
    | {
        kind: "tool";
        seed: WorkflowToolSeed;
        onSave: (payload: WorkflowToolPayload) => void | Promise<void>;
        onExit?: () => void;
      };
  /**
   * A run request the user can stop mid-flight — mirrored from dist/index.d.ts.
   * The editor aborts `signal` on the node's pause and resets the node at once;
   * the host cancels the upstream job(s) and rejects with an `AbortError`. It
   * never goes on the wire. The `any`-typed requests below carry it too.
   */
  export interface AbortableRequest {
    signal?: AbortSignal;
  }
  /** Every job-creating request: the node that placed it, and its pause. */
  export interface NodeScopedRequest extends AbortableRequest {
    nodeId?: string;
  }
  export type FaceSwapRequest = any;
  /** A synchronous call with no job, so no `signal`. */
  export type FaceDetectRequest = any;
  export type FaceDetectResult = any;
  export type GenImageRequest = any;
  export type GenResult = any;
  export type GenVideoRequest = any;
  export type GenAudioRequest = any;
  /** The Voice Translate / Speech to Text nodes' requests (`translateVoice` / `transcribeAudio`). */
  export type TranslateVoiceRequest = any;
  export type TranscribeAudioRequest = any;
  export type TranscribeAudioResult = { text: string };
  export type AudioModels = any;
  /** One voice the Voice picker lists, from the `listVoiceSamples` host action. */
  export type VoiceSample = {
    id: string;
    name: string;
    loadSample?: () => Promise<string>;
  };
  /** The Dub and Captions nodes' requests — the `dubVideo` / `burnCaptions`
   *  host actions (components/workflow/actions/{dub,captions}). The published package
   *  types them, but this shim shadows the package, so they must be named here
   *  too or host-actions.ts cannot import them. */
  export type DubVideoRequest = any;
  /** Dub v2 capability catalog returned by media-ai-service. */
  export interface DubCapabilities {
    enabled: boolean;
    max_duration_seconds: number;
    languages: { code: string; label: string; voice_modes: ("preserve" | "preset")[] }[];
    /** Whether the host can re-animate the speaker's mouth to the new audio.
     *  A property of the render, not of a language, so the Dub node reads it
     *  here rather than per entry in `languages`. */
    lip_sync?: boolean;
    defaults: { target_language: string; voice_mode: "preserve" | "preset" };
  }
  /** A voice advertised for a target language by the Dub capability API. */
  export interface DubVoice {
    id: string;
    name: string;
    language: string;
    preview_url?: string;
  }
  export type BurnCaptionsRequest = any;

  /**
   * The host's write handle into the open canvas (`onGraphApiReady`). This is
   * how the job ledger lands a generation that finished AFTER the action's
   * promise died (a reload mid-render) on the node that asked for it — through
   * the same write-back the live generate paths use. Every method tolerates a
   * node that has since been deleted.
   */
  export interface WorkflowGraphApi {
    /** Whether `nodeId` is still on the open canvas. */
    hasNode(nodeId: string): boolean;
    /** Write a finished generation onto the node (result + history +
     *  `status: "idle"`). `prompt` labels the history entries; omitted, the
     *  node's own prompt stands in. `false` = the node is gone, nothing wrote. */
    applyResult(nodeId: string, result: GenResult, prompt?: string): boolean;
    /** Put the node into its error state (a rehydrated job came back failed). */
    failNode(nodeId: string, message: string): void;

    /*
     * Reading the graph.
     *
     * The host cannot use React Flow's own `useReactFlow()` for this: the
     * provider lives INSIDE `<WorkflowEditor>`, so a hook called out here has no
     * store to read. These four are the same store, handed outward.
     *
     * `getNodes`/`getEdges` read COMMITTED state, while `updateNodeData` queues
     * a write drained on the next render — so a read straight after a write
     * still sees the old value, and anything walking the graph has to let it
     * settle rather than assume.
     */
    /** Every node currently on the canvas. */
    getNodes(): GraphNodeView[];
    /** Every wire currently on the canvas. */
    getEdges(): GraphEdgeView[];
    /** One node, or `undefined` when it is gone. */
    getNode(nodeId: string): GraphNodeView | undefined;
    /** Merge into a node's `data`. Queued, not immediate — see above. */
    updateNodeData(nodeId: string, data: Record<string, unknown>): void;

    /**
     * Select the node and bring it into view. `false` = it is gone.
     *
     * Both halves matter. Selection is what MARKS it — React Flow draws the
     * ring — and centring is what makes the mark findable on a canvas the user
     * is not currently looking at; one without the other is half an answer.
     */
    revealNode(nodeId: string): boolean;
    /**
     * Mark exactly these nodes until told otherwise. `[]` clears.
     *
     * Declarative rather than add/remove: the set being marked — "the nodes
     * this message is about" — is edited freely while the message is written,
     * and a missed removal would leave a card marked with nothing referring to
     * it.
     */
    highlightNodes(nodeIds: readonly string[]): void;
    /**
     * Run `nodeId` as an EDITOR run, so its card shows the pause button and can
     * be stopped on its own; aborting `opts.signal` stops it the same way.
     * Resolves `false` when the node has no run flow or is already running.
     */
    runNode(nodeId: string, opts?: AbortableRequest): Promise<boolean>;
    /** Save what is pending now and wait for it; `false` when the last write failed. */
    flushSave?(): Promise<boolean>;
  }

  /** A node as the graph hands it out. Structural, not React Flow's own type. */
  export interface GraphNodeView {
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: Record<string, any>;
    parentId?: string;
  }

  /** A wire as the graph hands it out. */
  export interface GraphEdgeView {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }

  /**
   * The node catalogue: what exists, what each one is for, what it takes and
   * gives. Derived from the editor's own registries, so it cannot drift from the
   * nodes actually registered — which is why it is built here and sent to the
   * planner rather than kept as a second copy upstream.
   */
  export function buildNodeManifest(): ManifestNode[];
  export type ManifestNode = {
    type: string;
    use: string;
    /**
     * Input ports. `handle` is what goes in an edge's `target_handle` — spelled
     * that way here because that is what the editor emits and what the planning
     * service validates. A local copy once called it `name`, and every chat
     * turn came back 422.
     */
    in: {
      handle: string;
      kind: string;
      required?: true;
      /** A growing family: `handle` is the prefix — `in-0`, `in-1`, … */
      many?: true;
    }[];
    out: string;
    writes?: string;
    params?: Record<string, any>;
  };

  /**
   * Run one node through the host's actions. Resolves `false` when the node
   * could not run at all (a type with no runner, a missing input) — distinct
   * from a run that started and failed, which is written onto the node.
   *
   * `reader` is the graph, narrowed to the three methods a node flow needs, so
   * the same flows work against a live canvas or a test double.
   */
  export function runNode(
    reader: {
      getNode(id: string): GraphNodeView | undefined;
      getEdges(): GraphEdgeView[];
      updateNodeData(id: string, data: Record<string, unknown>): void;
    },
    actions: WorkflowActions,
    nodeId: string,
    opts?: RunNodeOptions,
  ): Promise<boolean>;
  /** Per-run extras forwarded to the node's flow; `signal` stops it like its pause. */
  export type RunNodeOptions = AbortableRequest & Record<string, unknown>;

  /**
   * Node types that keep their settings under `data.params`, not on `data`.
   *
   * A generator spreads its settings flat; a parameter-only transform nests
   * them, and its migration effect rewrites that object on mount — so a value
   * left flat is erased rather than merely ignored.
   */
  export const NESTED_PARAM_TYPES: ReadonlySet<string>;

  /** Lay a graph out left-to-right by dependency order. */
  export function optimizeLayout(
    nodes: readonly any[],
    edges: readonly any[],
    options?: any,
  ): any[];

  /**
   * What the canvas holds right now, small enough to put in a prompt.
   *
   * Takes the same `{nodes, edges}` shape as `describeWorkflowIO`, so a host can
   * hand it the live graph without reshaping it twice.
   */
  export function digestGraph(graph: {
    nodes: readonly any[];
    edges: readonly any[];
  }): any;

  /** Lifecycle of a run row in the left rail's Runs panel; `stopped` = paused. */
  export type WorkflowRunStatus =
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "stopped";
  /** One host-supplied row of the Runs panel. */
  export interface WorkflowRun {
    id: string;
    label: string;
    status: WorkflowRunStatus;
    /** Makes the row a "jump to node" link when set. */
    nodeId?: string;
    thumbnailUrl?: string;
    kind?: "image" | "video" | "audio";
    detail?: string;
    progress?: number;
  }
  /** The editor's `runs` prop: extra host rows + the clear callbacks. */
  export interface WorkflowRunsConfig {
    runs?: WorkflowRun[];
    trackNodeRuns?: boolean;
    loading?: boolean;
    onSelectRun?: (run: WorkflowRun) => void;
    onClearRun?: (run: WorkflowRun) => void;
    onClearAll?: () => void;
    /**
     * The user paused a node whose in-flight run only an ACTIVE row here
     * reports (`nodeId` + `queued`/`running` — e.g. rehydrated after a reload):
     * cancel that job and mark the row inactive promptly. Absent, such nodes
     * cannot be paused; runs the editor started stop through `signal`.
     */
    onStopRun?: (run: WorkflowRun) => void;
  }
  export type LogoCompositeRequest = any;
  export type MultiCameraAnglesRequest = any;
  export type PromptEnhanceRequest = any;
  export type RemoveBackgroundRequest = any;
  export type MagicLayerRequest = any;
  /**
   * Magic Layer. Declared PRECISELY: the host maps media-ai's design map into this shape
   * (shared/magicLayerMap.ts). Mirrored from the package's typings (dist/index.d.ts).
   */
  interface MagicLayerItemBase {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    name?: string;
  }
  export interface MagicLayerImageItem extends MagicLayerItemBase {
    kind: "image";
    url: string;
    id?: string;
    opacity?: number;
  }
  export interface MagicLayerTextItem extends MagicLayerItemBase {
    kind: "text";
    text: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    fontStyle?: "normal" | "italic";
    color?: string;
    align?: "left" | "center" | "right";
    lineHeight?: number;
  }
  export type MagicLayerItem = MagicLayerImageItem | MagicLayerTextItem;
  export interface MagicLayerResult {
    width: number;
    height: number;
    layers: MagicLayerItem[];
    composite?: any;
    raw?: unknown;
  }
  export type ResizeImageRequest = any;
  /**
   * Relight. Declared PRECISELY rather than `any` like its siblings: the host's
   * own `relight` action re-reads and clamps this rig (shared/relight.ts), and a
   * loose type would let a wrong unit through unnoticed. Mirrored from the
   * package's typings (dist/index.d.ts).
   */
  export interface RelightLightSpec {
    /** Hex, e.g. `#ffd9a0`. Free-form — the picker is not limited to presets. */
    color: string;
    /** Azimuth in degrees, -135..180. 0 is straight in front of the subject. */
    rotate: number;
    /** Height in degrees, -90..90. Negative is below the subject. */
    elevation: number;
    /** Brightness, 1 (faint) to 10 (intense). */
    intensity: number;
  }
  /** A light as the NODE stores it — the spec plus its chip's stable key. */
  export interface RelightLight extends RelightLightSpec {
    id: string;
  }
  /** What the node writes: the rig, or the flat keys a planner can name. */
  export interface RelightSettings {
    lights?: RelightLight[];
    activeLight?: string;
    rotate?: number;
    elevation?: number;
    intensity?: number;
    color?: string;
  }
  export interface RelightRequest extends NodeScopedRequest {
    /** The picture being relit. */
    image: ImageInput;
    /** Optional picture whose lighting is borrowed. */
    lightSource?: ImageInput;
    /** The light rig, in the order the user arranged it. */
    lights: RelightLightSpec[];
    /** The rig expressed as lighting language. */
    prompt: string;
    /** Per-run extras (today: `runs`), plus the rig echoed as `lights`. */
    params?: Record<string, unknown>;
  }
  /**
   * Generative Fill. Declared PRECISELY for the same reason Relight is: the
   * host's `generativeFill` action turns this geometry into a canvas
   * (GenerativeFill/generativeFill.ts), and a loose type would let a FRACTION
   * through where a pixel count is meant. Mirrored from dist/index.d.ts.
   */
  export type GenerativeFillMode = "inpaint" | "outpaint";
  /** Where the source sits in an outpaint's new frame, as fractions OF THAT
   *  FRAME — so `sourceWidthPx / width` is the frame's own width. */
  export interface GenerativeFillPlacement {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  export interface GenerativeFillRequest extends NodeScopedRequest {
    /** The picture being filled. */
    image: ImageInput;
    mode: GenerativeFillMode;
    /** What to put in the region. Typed by the user, never composed. */
    prompt: string;
    /** The model the user picked, as its catalog id. */
    model?: string;
    /** inpaint: a hosted PNG where WHITE is the region to change. It matches the
     *  image's ASPECT, not its pixel size. */
    mask?: ImageInput;
    /** outpaint: target frame as `"W:H"`, or absent for a freely dragged one. */
    aspectRatio?: string;
    /** outpaint: where the original sits in the new frame. */
    placement?: GenerativeFillPlacement;
    /** Per-run extras only (today: `runs`), plus `mode`. */
    params?: Record<string, unknown>;
  }
  /** A face box in `[0..1]` fractions of its frame, top-left origin. */
  export interface FaceRect {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  /** A face picked after `detectFaces`: normalized rect plus the detector's index. */
  export interface FaceSwapFace {
    index: number;
    rect: FaceRect;
    /** Frame the box was measured on, when the detector re-hosted it. */
    measuredOn?: string;
    /** Video timestamp in seconds when this box was measured. */
    measuredAt?: number;
    label?: string | null;
  }
  /** @deprecated Use `FaceSwapFace`; the package keeps this alias too. */
  export type FaceSwapTargetFace = FaceSwapFace;
  /**
   * Video Face Swap. Declared precisely rather than `any`, unlike most of this
   * shim: the host reads `faceTarget` off it to build the service's
   * `face_swap_target_face`, and while the type was `any` the package could
   * (and did) ship without that field while the host branch type-checked and
   * silently never fired. A missing field must be a compile error here.
   */
  export interface VideoFaceSwapRequest extends NodeScopedRequest {
    video: ImageInput;
    face: ImageInput;
    /** The ONE face the user picked; absent means the service chooses. */
    faceTarget?: FaceSwapFace;
    /**
     * WHOSE face is donated: the user's pick on the face photo. Declared for
     * the same reason as `faceTarget` — the host maps it to the service's
     * `face_swap_source_face`, and an `any` here let the package ship without
     * the field while this host still type-checked.
     */
    sourceFace?: FaceSwapFace;
    /** Always literally `true`; the node gates on a consent attestation. */
    consent: true;
    faceSwapTarget: VideoFaceSwapTarget;
    params?: Record<string, unknown>;
  }
  export type VideoFaceSwapTarget = "prominent" | "all";
  /** One asset wired into the Post to social node; mirrored from dist/index.d.ts. */
  export interface SocialPostMedia {
    url: string;
    id?: string;
  }
  /** Whether a wired input can be posted yet; only `ready` carries media. */
  export type SocialPostInputStatus =
    | "ready"
    | "running"
    | "notRun"
    | "unappliedEdits"
    | "unbaked";
  export interface SocialPostNodeInput {
    handle: string;
    sourceId: string;
    sourceLabel?: string;
    kind: AssetKind;
    status: SocialPostInputStatus;
    /** Set only while `status` is `ready`. */
    media?: SocialPostMedia;
    /** Every image of that run in carousel order, containing `media`; `[media]` for a video. */
    candidates: SocialPostMedia[];
    prompt?: string;
  }
  /** What the `socialPost` prop's `Body` receives inside the node. */
  export interface SocialPostNodeBodyProps {
    nodeId: string;
    inputs: SocialPostNodeInput[];
    /** The host's own saved state, `data.post`. */
    data: Record<string, unknown> | undefined;
    onDataChange(
      update: (prev: Record<string, unknown> | undefined) => Record<string, unknown>,
    ): void;
    selected: boolean;
    readOnly: boolean;
  }
  export interface WorkflowSocialPostConfig {
    Body: ComponentType<SocialPostNodeBodyProps>;
  }

  export const COLOR_STRENGTH_RANGE: { min: number; max: number };
  export const CROP_PAD_RANGE: { min: number; max: number };
  export const FEATHER_RANGE: { min: number; max: number };
  export const MASK_SCALE_RANGE: { min: number; max: number };

  export const RELIGHT_ROTATE_RANGE: { min: number; max: number; step: number };
  export const RELIGHT_ELEVATION_RANGE: {
    min: number;
    max: number;
    step: number;
  };
  export const RELIGHT_INTENSITY_RANGE: {
    min: number;
    max: number;
    step: number;
  };
  export const RELIGHT_LIGHT_DEFAULTS: RelightLightSpec;
  export const RELIGHT_MAX_LIGHTS: number;
  /** Folds the defaults in, accepts either writer's shape, clamps every knob. */
  export function effectiveRelightSettings(data: RelightSettings): {
    lights: RelightLight[];
    activeLight: string;
  };
  /** The rig as lighting prose — the node's own wording, reproducible here. */
  export function relightPromptFor(
    data: RelightSettings,
    options?: { hasLightTransfer?: boolean },
  ): string;

  export const UPLOAD_ACCEPT: string;
  export const STORYBOARD_GRID_SIZES: readonly string[];

  export function toModelOption(entry: HostModelEntry): ImageModel;
  export function toModelOptions(entries: HostModelEntry[], overrides?: unknown): ImageModel[];
  export function validateUploadBatch(files: File[]): string | null;

  export const WorkflowEditor: ComponentType<any>;

  // ---------------------------------------------------------------------------
  // Workflow IO — mirrored from the package's own typings (dist/index.d.ts,
  // `describeWorkflowIO`). This shim shadows those typings wholesale, so every
  // export the host uses has to be declared here; these are copied verbatim.
  // ---------------------------------------------------------------------------

  /** A saved graph node — structurally the flow-builder API's `FlowNode`. */
  export interface WorkflowDocumentNode {
    id: string;
    type?: string;
    position: { x: number; y: number };
    /** Freeform business config — the node's cleaned `data`. */
    config?: Record<string, unknown>;
    asset_ref?: string;
    prompt?: string;
    output?: string;
    parent_group?: string;
  }
  /** A saved graph edge — structurally the flow-builder API's `FlowEdge`. */
  export interface WorkflowDocumentEdge {
    id: string;
    source: string;
    target: string;
    source_handle?: string;
    target_handle?: string;
    metadata?: Record<string, unknown>;
  }
  /** Data kind a workflow input or output carries — a port type, on the wire. */
  export type WorkflowIOKind = "text" | "image" | "video";
  /**
   * Something the user must bring for the workflow to run. `source: "node"` is
   * an unwired source node (Upload / Import / Reference Image / Prompt / Text
   * Iterator) — `prefilled` says whether the template already holds a value;
   * `source: "port"` is a required input handle nothing is wired into.
   */
  export interface WorkflowIOInput {
    node_id: string;
    /** The node's registry key (`"upload"`, `"multiCameraAngles"`, …). */
    node_type: string;
    kind: WorkflowIOKind;
    /** The node's card label, when it has one. Host/user text, as saved. */
    label?: string;
    source: "node" | "port";
    /** The unwired input handle, for `source: "port"`. */
    handle?: string;
    /** Whether the template already carries a value for this input. */
    prefilled: boolean;
    /**
     * Whether the workflow cannot run without it. Always `true` from
     * `describeWorkflowIO`; a tool may also expose optional ends, which are
     * `false` — so an app must read the flag rather than assume.
     */
    required: boolean;
    /**
     * Tool inputs only: values the author offers the app's user to start from,
     * as a run carries them — a hosted media url, or the text. Absent when none.
     */
    samples?: string[];
  }
  /** A terminal node (nothing wired out of it) that produces something. */
  export interface WorkflowIOOutput {
    node_id: string;
    node_type: string;
    kind: WorkflowIOKind;
    label?: string;
    /** Size of the last saved result; `null` if the node was never run. */
    count: number | null;
  }
  /** A workflow described by its ends and its run order. */
  export interface WorkflowIO {
    inputs: WorkflowIOInput[];
    outputs: WorkflowIOOutput[];
    /** Kahn's topological order, flattened from `stages`. */
    order: string[];
    /** `stages[i]` = nodes whose every upstream sits in an earlier stage. */
    stages: string[][];
    cyclic: boolean;
    summary: {
      inputs: Record<WorkflowIOKind, number>;
      outputs: Record<WorkflowIOKind, number>;
    };
  }
  /** The graph half `describeWorkflowIO` reads. */
  export interface WorkflowIOGraph {
    nodes: WorkflowDocumentNode[];
    edges: WorkflowDocumentEdge[];
  }
  /** Node types whose content the USER supplies rather than the graph computing it. */
  export const WORKFLOW_SOURCE_NODE_TYPES: ReadonlySet<string>;
  /** Describe a workflow by its ends (inputs the user brings, terminal outputs) and its run order. Never throws. */
  export function describeWorkflowIO(graph: WorkflowIOGraph): WorkflowIO;
}

declare module "@dogclaw-ad/workflow/styles.css" {
  const css: string;
  export default css;
}
