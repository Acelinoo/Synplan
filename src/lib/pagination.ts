import { NextRequest } from "next/server";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  cursor?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

/**
 * Parses and validates query string pagination parameters with safe defaults and boundaries.
 */
export function parsePaginationParams(
  urlOrParams: URLSearchParams | NextRequest | URL | Record<string, any>,
  options: PaginationOptions = {}
): PaginationParams {
  let searchParams: URLSearchParams;
  if (urlOrParams instanceof NextRequest) {
    searchParams = urlOrParams.nextUrl.searchParams;
  } else if (urlOrParams instanceof URL) {
    searchParams = urlOrParams.searchParams;
  } else if (urlOrParams instanceof URLSearchParams) {
    searchParams = urlOrParams;
  } else if (typeof urlOrParams === "object" && urlOrParams !== null) {
    searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(urlOrParams)) {
      if (val !== undefined && val !== null) {
        searchParams.set(key, String(val));
      }
    }
  } else {
    searchParams = new URLSearchParams();
  }

  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const defaultSortOrder = options.defaultSortOrder ?? "desc";

  // Parse page (1-indexed)
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  // Parse limit with min 1 and strict max capping
  const rawLimit = parseInt(searchParams.get("limit") || String(defaultLimit), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;

  // Parse cursor
  const cursor = searchParams.get("cursor") || undefined;

  // Parse sort order
  const rawSortOrder = searchParams.get("sortOrder")?.toLowerCase();
  const sortOrder: "asc" | "desc" = rawSortOrder === "asc" || rawSortOrder === "desc" ? rawSortOrder : defaultSortOrder;

  // Parse sortBy
  const sortBy = searchParams.get("sortBy") || options.defaultSortBy || undefined;

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    cursor,
    sortBy,
    sortOrder,
  };
}

/**
 * Constructs a standardized paginated response payload.
 */
export function createPaginatedResponse<T extends { id?: string }>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit) || 1;
  const hasMore = params.page < totalPages || (items.length === params.limit && items.length > 0);

  // Next cursor is typically the ID of the last item in the current batch
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    if (lastItem && typeof lastItem.id === "string") {
      nextCursor = lastItem.id;
    }
  }

  return {
    items,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
      hasMore,
      nextCursor,
    },
  };
}
