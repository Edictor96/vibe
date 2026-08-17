/**
 * Typed client for the Milestone A discussionBoard backend.
 *
 * Matches the announcement-hooks pattern: raw `fetch` against
 * `${BASE_URL}/...` with an inlined `getAuthHeaders()` helper that reads the
 * Firebase auth token from localStorage. This is the prevailing convention
 * for course-scoped features (announcements, peer reviews, HP system, …) —
 * do not substitute `lib/api-client.ts` here.
 *
 * Endpoints covered (view + create + read only — Milestone B):
 *   GET    /course/:courseId/discussions              → DiscussionThread[]
 *   POST   /course/:courseId/discussions              → DiscussionThread
 *   GET    /discussions/:threadId                     → DiscussionThreadDetail
 *
 * Reply / edit / delete / pin endpoints exist on the backend but are
 * intentionally NOT exposed here — they are Milestone C work.
 */

import { useCallback, useEffect, useState } from "react";

import type {
    CreateDiscussionBody,
    DiscussionError,
    DiscussionErrorKind,
    DiscussionThread,
    DiscussionThreadDetail,
} from "@/types/discussion.types";

const BASE_URL = (
    import.meta.env.VITE_BASE_URL ?? ""
).replace(/\/$/, "");

/** Same Firebase token contract as announcement-hooks / hooks.ts. */
function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("firebase-auth-token");
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

/**
 * Decode a routing-controllers / class-validator error payload into a
 * field-keyed map. The backend returns either
 *   { message, errors: [{ property, constraints, children }] }
 * or just `{ message }` for non-validation errors.
 */
function decodeErrorPayload(
    payload: unknown,
    status: number,
): DiscussionError {
    if (!payload || typeof payload !== "object") {
        return { kind: kindFromStatus(status), status, message: defaultMessageFor(status) };
    }

    const body = payload as {
        message?: unknown;
        errors?: unknown;
    };

    const message =
        typeof body.message === "string"
            ? body.message
            : defaultMessageFor(status);

    if (status === 400 && Array.isArray(body.errors)) {
        const fieldErrors: Record<string, string[]> = {};
        for (const entry of body.errors as Array<{
            property?: string;
            constraints?: Record<string, string>;
            children?: Array<{
                property?: string;
                constraints?: Record<string, string>;
                children?: Array<unknown>;
            }>;
        }>) {
            collectFieldErrors(entry, "", fieldErrors);
        }
        return {
            kind: "validation",
            status,
            message,
            fieldErrors,
        };
    }

    return { kind: kindFromStatus(status), status, message };
}

function kindFromStatus(status: number): DiscussionErrorKind {
    if (status === 401) return "unauthenticated";
    if (status === 403) return "forbidden";
    if (status === 404) return "not_found";
    if (status >= 500) return "server";
    return "validation";
}

function defaultMessageFor(status: number): string {
    switch (status) {
        case 401:
            return "Your session has expired. Please sign in again.";
        case 403:
            return "You don't have permission to view or post in this discussion.";
        case 404:
            return "This discussion is no longer available.";
        case 0:
            return "Couldn't reach the server. Check your connection and try again.";
        default:
            return "Something went wrong while loading the discussion. Please try again.";
    }
}

/**
 * Recursively flatten nested class-validator `children` so a deeply nested
 * field ends up keyed by its full path (e.g. `body` not `children.0.body`).
 */
function collectFieldErrors(
    entry: {
        property?: string;
        constraints?: Record<string, string>;
        children?: Array<{
            property?: string;
            constraints?: Record<string, string>;
            children?: Array<unknown>;
        }>;
    },
    parentPath: string,
    out: Record<string, string[]>,
): void {
    const key = entry.property ?? "";
    const path = parentPath ? `${parentPath}.${key}` : key;

    if (entry.constraints) {
        out[path] = Object.values(entry.constraints);
    }

    if (Array.isArray(entry.children)) {
        for (const child of entry.children) {
            collectFieldErrors(child, path, out);
        }
    }
}

/** Common fetcher used by every hook below. */
async function request<T>(
    path: string,
    init: RequestInit = {},
): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        credentials: "include",
        headers: {
            ...getAuthHeaders(),
            ...(init.headers ?? {}),
        },
    });

    if (res.status === 204) {
        return undefined as T;
    }

    const text = await res.text();
    const json = text ? safeJson(text) : null;

    if (!res.ok) {
        throw decodeErrorPayload(json, res.status);
    }

    return json as T;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function toDiscussionError(err: unknown): DiscussionError {
    if (err && typeof err === "object" && "kind" in err) {
        return err as DiscussionError;
    }
    return {
        kind: "network",
        status: 0,
        message:
            err instanceof Error
                ? err.message
                : "Couldn't reach the server. Check your connection and try again.",
    };
}

// =============================================================================
// List threads for a course  →  GET /course/:courseId/discussions
// =============================================================================

export interface UseDiscussionThreadsResult {
    data: DiscussionThread[];
    isLoading: boolean;
    error: DiscussionError | null;
    refetch: () => Promise<void>;
}

/**
 * Fetches every thread on the course visible to the caller, in the order
 * the backend returns (pinned first, then newest first).
 */
export function useDiscussionThreads(
    courseId: string | undefined | null,
): UseDiscussionThreadsResult {
    const [data, setData] = useState<DiscussionThread[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(!!courseId);
    const [error, setError] = useState<DiscussionError | null>(null);

    const refetch = useCallback(async () => {
        if (!courseId) {
            setData([]);
            setError(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const result = await request<DiscussionThread[]>(
                `/course/${courseId}/discussions`,
                { method: "GET" },
            );
            setData(Array.isArray(result) ? result : []);
            setError(null);
        } catch (err) {
            setError(toDiscussionError(err));
            setData([]);
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { data, isLoading, error, refetch };
}

// =============================================================================
// Get a single thread + replies  →  GET /discussions/:threadId
// =============================================================================

export interface UseDiscussionThreadResult {
    data: DiscussionThreadDetail | null;
    isLoading: boolean;
    error: DiscussionError | null;
    refetch: () => Promise<void>;
}

/**
 * Fetches a single thread together with its replies. The bundled shape is
 * intentional — it saves the client from a second roundtrip just to render
 * the thread page.
 */
export function useDiscussionThread(
    threadId: string | undefined | null,
): UseDiscussionThreadResult {
    const [data, setData] = useState<DiscussionThreadDetail | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(!!threadId);
    const [error, setError] = useState<DiscussionError | null>(null);

    const refetch = useCallback(async () => {
        if (!threadId) {
            setData(null);
            setError(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const result = await request<DiscussionThreadDetail>(
                `/discussions/${threadId}`,
                { method: "GET" },
            );
            setData(result);
            setError(null);
        } catch (err) {
            setError(toDiscussionError(err));
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, [threadId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { data, isLoading, error, refetch };
}

// =============================================================================
// Create a thread  →  POST /course/:courseId/discussions
// =============================================================================

export interface UseCreateDiscussionThreadResult {
    mutateAsync: (
        body: CreateDiscussionBody,
    ) => Promise<DiscussionThread>;
    isPending: boolean;
    error: DiscussionError | null;
}

/**
 * POST a new thread. On success returns the created thread (caller is
 * expected to navigate to its detail page). On 400 the returned
 * `DiscussionError` carries a `fieldErrors` map for inline display.
 */
export function useCreateDiscussionThread(
    courseId: string | undefined | null,
): UseCreateDiscussionThreadResult {
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<DiscussionError | null>(null);

    const mutateAsync = useCallback(
        async (body: CreateDiscussionBody): Promise<DiscussionThread> => {
            if (!courseId) {
                const err: DiscussionError = {
                    kind: "validation",
                    message: "No course is currently selected.",
                };
                setError(err);
                throw err;
            }

            setIsPending(true);
            setError(null);
            try {
                const result = await request<DiscussionThread>(
                    `/course/${courseId}/discussions`,
                    {
                        method: "POST",
                        body: JSON.stringify(body),
                    },
                );
                return result;
            } catch (err) {
                const discussionErr = toDiscussionError(err);
                setError(discussionErr);
                throw discussionErr;
            } finally {
                setIsPending(false);
            }
        },
        [courseId],
    );

    return { mutateAsync, isPending, error };
}