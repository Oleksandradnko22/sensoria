// "Переглянути профіль" is offered from many places (program/guide/
// meditation pages, messages, reviews), some of them deep inside pages
// rendered by App's early-return branches. Instead of threading a callback
// through all of them, components call the stable opener below; App
// subscribes once and performs the navigation.
import { useCallback } from "react";

export type OpenAuthorProfile = (authorId: string) => void;

const listeners = new Set<OpenAuthorProfile>();

export function openAuthorProfile(authorId: string): void {
  if (!authorId) return;
  listeners.forEach((l) => l(authorId));
}

export function subscribeAuthorProfileRequests(listener: OpenAuthorProfile): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Stable function; safe to put in effect deps.
export function useOpenAuthorProfile(): OpenAuthorProfile {
  return useCallback((id: string) => openAuthorProfile(id), []);
}

// The same for a material (program / guide / meditation), e.g. the card under a post in «Спільнота».
export type OpenMaterial = (kind: "program" | "guide" | "meditation", id: string) => void;
const materialListeners = new Set<OpenMaterial>();
export function openMaterial(kind: "program" | "guide" | "meditation", id: string): void {
  if (!id) return;
  materialListeners.forEach((l) => l(kind, id));
}
export function subscribeMaterialRequests(listener: OpenMaterial): () => void {
  materialListeners.add(listener);
  return () => {
    materialListeners.delete(listener);
  };
}
