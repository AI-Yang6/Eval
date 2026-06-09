import { v4 as uuid } from "uuid";

import { getDB } from "./index";
import type { MediaGeneration } from "@/lib/types";

export async function listMediaGenerations(): Promise<MediaGeneration[]> {
  const items = await getDB().mediaGenerations.toArray();
  return items.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function saveMediaGeneration(
  input: Omit<MediaGeneration, "id" | "createdAt"> & { id?: string }
): Promise<MediaGeneration> {
  const item: MediaGeneration = {
    ...input,
    id: input.id ?? uuid(),
    createdAt: new Date().toISOString(),
  };
  await getDB().mediaGenerations.put(item);
  return item;
}

export async function deleteMediaGeneration(id: string): Promise<void> {
  await getDB().mediaGenerations.delete(id);
}
