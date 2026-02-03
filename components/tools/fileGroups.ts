type FileStatus = "ACTIVE" | "IN DEVELOPMENT" | "READ ONLY";
type FileAccess = "Public" | "Private" | "Internal";

export interface FileItem {
  id: string;
  title: string;
  status: FileStatus;
  access: FileAccess;
}

export interface FileGroup {
  name: string;
  files: FileItem[];
}

export const toolsFileGroups: FileGroup[] = [
  {
    name: "TOOLS",
    files: [
      {
        id: "swap",
        title: "Swap",
        status: "IN DEVELOPMENT",
        access: "Public",
      },
    ],
  },
];

export const allToolIds = new Set(toolsFileGroups.flatMap((g) => g.files.map((f) => f.id)));

export function getToolById(fileId: string): FileItem | null {
  for (const group of toolsFileGroups) {
    const file = group.files.find((f) => f.id === fileId);
    if (file) return file;
  }
  return null;
}
