import { useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDiscussionThreads } from "@/hooks/discussion-hooks";
import { CreateDiscussionDialog } from "./CreateDiscussionDialog";
import { DiscussionErrorState } from "./DiscussionErrorState";
import { DiscussionListSkeleton } from "./DiscussionListSkeleton";
import { DiscussionThreadCard } from "./DiscussionThreadCard";
import { EmptyDiscussionState } from "./EmptyDiscussionState";

interface DiscussionListProps {
    courseId: string;
    /** Resolved from `useCourseStore.currentCourse.cohortId`. */
    cohortId: string | null;
    /**
     * Builder for the per-thread deep-link URL. The parent page knows its
     * own route shape (`/teacher/courses/...` vs `/student/courses/...`),
     * so we accept it rather than re-deriving.
     */
    threadHrefBuilder: (threadId: string) => string;
    /** Optional right-aligned header actions (e.g. extra buttons). */
    headerActions?: React.ReactNode;
}

/**
 * The list page body — orchestrates the loading / empty / error / data
 * states for the discussion thread list. Renders inside the existing
 * teacher/student layout's main content panel, exactly like the
 * announcements list does.
 */
export function DiscussionList({
    courseId,
    cohortId,
    threadHrefBuilder,
    headerActions,
}: DiscussionListProps) {
    const navigate = useNavigate();
    const { data, isLoading, error, refetch } = useDiscussionThreads(courseId);
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <div className="flex-1 min-w-0">
            <div className="space-y-6">
                <PageHeader
                    title="Discussions"
                    description="Conversations with everyone in your cohort"
                    actions={
                        <div className="flex items-center gap-2">
                            {headerActions}
                            <Button
                                size="sm"
                                className="gap-2"
                                onClick={() => setCreateOpen(true)}
                                data-testid="discussion-create-button"
                                disabled={!cohortId}
                                title={
                                    cohortId
                                        ? "Start a new thread"
                                        : "Open a course first to start a thread"
                                }
                            >
                                <Plus className="h-4 w-4" />
                                Create Thread
                            </Button>
                        </div>
                    }
                />

                {isLoading ? (
                    <DiscussionListSkeleton />
                ) : error ? (
                    <DiscussionErrorState error={error} onRetry={refetch} />
                ) : data.length === 0 ? (
                    <EmptyDiscussionState
                        onStartThread={
                            cohortId
                                ? () => setCreateOpen(true)
                                : undefined
                        }
                    />
                ) : (
                    <div
                        className="grid gap-4"
                        data-testid="discussion-list"
                    >
                        {data.map(thread => (
                            <DiscussionThreadCard
                                key={thread._id}
                                thread={thread}
                                hrefBuilder={threadHrefBuilder}
                            />
                        ))}
                    </div>
                )}
            </div>

            <CreateDiscussionDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                courseId={courseId}
                cohortId={cohortId}
                onCreated={thread => {
                    navigate({ to: threadHrefBuilder(thread._id) as any });
                }}
            />
        </div>
    );
}