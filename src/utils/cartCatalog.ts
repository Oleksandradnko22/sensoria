// What a cart entry can point at: real programs, catalog guides and meditations (a meditation is a free practice).
import { guides } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import type { Program } from "../data/programs.ts";
import type { CartKind } from "./cart.ts";

export type CartCatalogItem = {
  kind: CartKind;
  id: string;
  title: string;
  author: string;
  description: string;
  price: string | number | null | undefined;
  coverUrl?: string;
  coverFocus?: import("./coverFocus.ts").CoverFocus;
  tags?: string[];
};

export function buildCartCatalog(programs: Program[]): CartCatalogItem[] {
  return [
    ...programs.map((p) => ({ kind: "program" as const, id: p.id, title: p.title, author: p.author, description: p.description, price: p.price, coverUrl: p.coverUrl, coverFocus: p.coverFocus, tags: p.tags })),
    ...guides.map((g) => ({ kind: "guide" as const, id: g.id, title: g.title, author: g.author, description: g.description ?? "", price: g.price })),
    ...meditations.map((m) => ({ kind: "meditation" as const, id: m.id, title: m.title, author: "Sensoria", description: m.description, price: 0 })),
  ];
}
