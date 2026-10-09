import type { Catalog, CatalogEntry } from "./model.ts";
/** Ranked entries for a query. Exact names first; several unrelated keywords are merged round-robin. */
export declare function searchEntries(catalog: Catalog, query: string, limit: number, keep: (e: CatalogEntry) => boolean): CatalogEntry[];
