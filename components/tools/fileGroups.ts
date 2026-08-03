// Derived from the landing page's virtual filesystem — the single source of
// truth for pane indexes AND CLI navigation. Add entries in
// lib/landing/filesystem.ts, not here.
import { paneGroups, type PaneFileItem, type PaneFileGroup } from "@/lib/landing/filesystem";

export type FileItem = PaneFileItem;
export type FileGroup = PaneFileGroup;

export const toolsFileGroups: FileGroup[] = paneGroups("tools");

export const allToolIds = new Set(toolsFileGroups.flatMap((g) => g.files.map((f) => f.id)));

export function getToolById(fileId: string): FileItem | null {
  for (const group of toolsFileGroups) {
    const file = group.files.find((f) => f.id === fileId);
    if (file) return file;
  }
  return null;
}
