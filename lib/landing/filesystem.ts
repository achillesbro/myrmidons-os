/**
 * The landing page's virtual filesystem — single source of truth for CLI
 * navigation (cd/ls/open/run in app/page.tsx) AND the pane indexes
 * (StrategiesWindowContent, ToolsWindowContent). Adding an entry here is the
 * whole job: the CLI resolves it, ls lists it, the pane renders its tile.
 *
 * Model: two directories (STRATEGIES/, TOOLS/), each backing one pane. A
 * directory's `pane` is what cd mounts; a file's `id` is the pane's tile id
 * (communicated via the #file=/#tool= URL hash, unchanged). Files with a
 * `route` are "executables" — `run` navigates to their dedicated page and
 * `ls` marks them with `*`.
 */

export type FsStatus = "ACTIVE" | "IN DEVELOPMENT" | "OFFLINE" | "READ ONLY";
export type FsAccess = "Public" | "Private" | "Internal";

export interface FsFile {
  /** CLI name — what ls prints and open/run resolve (case-insensitive). */
  name: string;
  /** Pane tile id — goes into the #file=/#tool= hash. */
  id: string;
  /** Index tile title. */
  title: string;
  /** Index tile secondary label (also the FileScreen header suffix). */
  secondary?: string;
  status: FsStatus;
  access: FsAccess;
  /** Pane index group this tile renders under (STRATEGIES | SYSTEM | ACCESS | TOOLS). */
  group: string;
  /** Dedicated page — presence makes the file runnable. */
  route?: string;
  /** Lowercase alternate names the CLI accepts. */
  aliases: string[];
}

export interface FsDir {
  name: "STRATEGIES" | "TOOLS";
  pane: "strategies" | "tools";
  children: FsFile[];
}

export const FS_DIRS: FsDir[] = [
  {
    name: "STRATEGIES",
    pane: "strategies",
    children: [
      {
        name: "MYRMIDONS_USDT0",
        id: "strategy-usdt0-v2",
        title: "MYRMIDONS USDT0 — Morpho Vault V2",
        secondary: "VAULT_V2 // HEGEMON_V2",
        status: "IN DEVELOPMENT",
        access: "Public",
        group: "STRATEGIES",
        route: "/vaults/usdt0-v2",
        aliases: ["usdt0", "hegemon-v2", "hegemon_v2", "v2"],
      },
      {
        name: "MYRMIDONS_USDC",
        id: "strategy-usdc-v2",
        title: "MYRMIDONS USDC — Morpho Vault V2",
        secondary: "VAULT_V2 // HEGEMON_V2",
        status: "IN DEVELOPMENT",
        access: "Public",
        group: "STRATEGIES",
        route: "/vaults/usdc-v2",
        aliases: ["usdc"],
      },
      {
        name: "MYRMIDONS_WHYPE",
        id: "strategy-whype-v2",
        title: "MYRMIDONS WHYPE — Morpho Vault V2",
        secondary: "VAULT_V2 // HEGEMON_V2",
        status: "IN DEVELOPMENT",
        access: "Public",
        group: "STRATEGIES",
        route: "/vaults/whype-v2",
        aliases: ["whype", "hype"],
      },
      {
        name: "HEGEMON",
        id: "strategy-usdt0",
        title: "Morpho Reallocator — USDT0",
        secondary: "MORPHO_REALLOCATOR",
        status: "OFFLINE",
        access: "Public",
        group: "STRATEGIES",
        route: "/vaults/usdt0",
        aliases: ["v1", "morpho"],
      },
      {
        name: "EREBUS",
        id: "strategy-liq-protect",
        title: "Liquidation Execution",
        secondary: "LIQUIDATION_ENGINE",
        status: "OFFLINE",
        access: "Private",
        group: "STRATEGIES",
        aliases: ["liquidation"],
      },
    ],
  },
  {
    name: "TOOLS",
    pane: "tools",
    children: [
      {
        name: "MNEMON",
        id: "mnemon",
        title: "MNEMON",
        secondary: "MARKET_ANALYSER",
        status: "ACTIVE",
        access: "Public",
        group: "TOOLS",
        route: "/tools/mnemon",
        aliases: [],
      },
      {
        name: "SWAP",
        id: "swap",
        title: "Swap",
        secondary: "ONCHAIN_ROUTER",
        status: "ACTIVE",
        access: "Public",
        group: "TOOLS",
        aliases: [],
      },
    ],
  },
];

/** Normalize a CLI path token: strip slashes, lowercase. */
function norm(token: string): string {
  return token.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** Resolve a directory by name ("strategies", "/TOOLS/", …). */
export function resolveDir(token: string): FsDir | null {
  const t = norm(token);
  return FS_DIRS.find((d) => d.name.toLowerCase() === t) ?? null;
}

/** Resolve a file inside a directory by name or alias (case-insensitive). */
export function resolveFile(dir: FsDir, token: string): FsFile | null {
  const t = norm(token);
  return (
    dir.children.find((f) => f.name.toLowerCase() === t) ??
    dir.children.find((f) => f.aliases.includes(t)) ??
    null
  );
}

/** Find a file by its pane tile id, with the directory it lives in. */
export function fileByPaneId(id: string): { dir: FsDir; file: FsFile } | null {
  for (const dir of FS_DIRS) {
    const file = dir.children.find((f) => f.id === id);
    if (file) return { dir, file };
  }
  return null;
}

/** Pane index shape (what the SYSTEM_INDEX column renders). */
export interface PaneFileItem {
  id: string;
  title: string;
  status: FsStatus;
  access: FsAccess;
}
export interface PaneFileGroup {
  name: string;
  files: PaneFileItem[];
}

/** Group a directory's files for the pane index, preserving declaration order. */
export function paneGroups(pane: "strategies" | "tools"): PaneFileGroup[] {
  const dir = FS_DIRS.find((d) => d.pane === pane);
  if (!dir) return [];
  const groups: PaneFileGroup[] = [];
  for (const f of dir.children) {
    let g = groups.find((x) => x.name === f.group);
    if (!g) {
      g = { name: f.group, files: [] };
      groups.push(g);
    }
    g.files.push({ id: f.id, title: f.title, status: f.status, access: f.access });
  }
  return groups;
}

/** Tile labels (primary/secondary) for a pane id — the CLI name IS the label. */
export function labelsForId(id: string): { primary: string; secondary?: string } {
  const hit = fileByPaneId(id);
  if (!hit) return { primary: id.toUpperCase() };
  return { primary: hit.file.name, secondary: hit.file.secondary };
}

/** `ls` status tag. */
export function statusTag(status: FsStatus): string {
  switch (status) {
    case "ACTIVE":
      return "[ACTIVE]";
    case "IN DEVELOPMENT":
      return "[IN_DEV]";
    case "OFFLINE":
      return "[OFFLINE]";
    case "READ ONLY":
      return "[READ_ONLY]";
  }
}
