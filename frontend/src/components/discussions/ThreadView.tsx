import { ArrowLeft, Calendar, MessageSquare, Pin } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDiscussionThread } from "@/hooks/discussion-hooks";
import type {
    DiscussionReply,
    DiscussionThread,
} from "@/types/discussion.types";
import { DiscussionErrorState } from "./DiscussionErrorState";

interface ThreadViewProps {
    threadId: string;
    listHref: string;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function initialsOf(id: string): string {
    const s = id.replace(/[^a-zA-Z]/g, "");
    const out = (s.length >= 2 ? s.slice(0, 2) : s).toUpperCase();
    return out.length > 0 ? out : "??";
}
function renderThreadBody(thread: DiscussionThread, replies: DiscussionReply[]) {
    return (
        <>
            <Card data-testid="discussion-thread-detail">
                <CardHeader className="pb-2 space-y-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3 items-start min-w-0 flex-1">
                            <Avatar className="h-10 w-10 border border-border/30 shrink-0">
                                <AvatarImage
                                    src={"https://api.dicebear.com/7.x/initials/svg?seed=" + thread.authorId}
                                    alt=""
                                />
                                <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-xs font-bold">
                                    {initialsOf(thread.authorId)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1
                                        className="text-xl font-semibold leading-tight"
                                        data-testid="discussion-thread-title"
                                    >
                                        {thread.title}
                                    </h1>
                                    {thread.pinned ? (
                                        <Badge
                                            variant="secondary"
                                            className="gap-1 text-[10px] h-5 px-1.5 shrink-0"
                                        >
                                            <Pin className="h-3 w-3" />
                                            Pinned
                                        </Badge>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                                    <span
                                        className="flex items-center gap-1"
                                        data-testid="discussion-thread-author"
                                    >
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(thread.createdAt)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                    <div
                        className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-foreground/90"
                        data-testid="discussion-thread-body"
                    >
                        {thread.body}
                    </div>
                </CardContent>
            </Card>
            <RepliesStub count={replies.length} />
        </>
    );
}

function RepliesStub({ count }: { count: number }) {
    return (
        <Card
            className="border-2 border-dashed bg-muted/20"
            data-testid="discussion-replies-slot"
        >
            <CardContent className="py-10 px-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-muted-foreground">
                    {count === 0
                        ? "No replies yet"
                        : count + " " + (count === 1 ? "reply" : "replies")}
                </h3>
                <p className="text-sm text-muted-foreground/80 max-w-sm mx-auto mt-1">
                    Reply posting and moderation arrive in the next milestone.
                </p>
            </CardContent>
        </Card>
    );
}

function ThreadViewSkeleton() {
    return (
        <div
            className="space-y-4"
            data-testid="discussion-thread-skeleton"
            aria-busy="true"
            aria-live="polite"
        >
            <Card>
                <CardHeader className="pb-2 space-y-0">
                    <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="space-y-2 flex-1 min-w-0">
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                </CardContent>
            </Card>
            <Card>
                <CardContent className="py-10 px-6 text-center space-y-2">
                    <Skeleton className="h-6 w-6 rounded-full mx-auto" />
                    <Skeleton className="h-4 w-1/3 mx-auto" />
                    <Skeleton className="h-3 w-2/3 mx-auto" />
                </CardContent>
            </Card>
        </div>
    );
}

export function ThreadView({ threadId, listHref }: ThreadViewProps) {
    const { data, isLoading, error, refetch } = useDiscussionThread(threadId);
    const thread = data ? data.thread : null;
    const replies = data ? data.replies : [];

    return (
        <div className="flex-1 min-w-0">
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="gap-2 -ml-2 text-muted-foreground"
                    data-testid="discussion-back-to-list"
                >
                    <Link to={listHref as any}>
                        <ArrowLeft className="h-4 w-4" />
                        Back to discussions
                    </Link>
                </Button>
                {isLoading ? (
                    <ThreadViewSkeleton />
                ) : error ? (
                    <DiscussionErrorState error={error} onRetry={refetch} />
                ) : thread ? (
                    renderThreadBody(thread, replies)
                ) : (
                    <DiscussionErrorState
                        error={{
                            kind: "not_found",
                            message: "This thread could not be found.",
                        }}
                    />
                )}
            </div>
        </div>
    );
}