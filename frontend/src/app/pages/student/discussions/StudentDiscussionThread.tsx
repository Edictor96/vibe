import { ThreadView } from "@/components/discussions/ThreadView";

interface StudentDiscussionThreadProps {
    /** Path param from the router — `:threadId`. */
    threadId: string;
    /** Path param from the router — `:courseId`. */
    courseId: string;
}

/**
 * Student-side discussion thread detail page.
 *
 * Sibling of `StudentDiscussions`; lives inside the same `/student/...`
 * layout so the existing sidebar / main content panel wrap it.
 */
export default function StudentDiscussionThread({
    threadId,
    courseId,
}: StudentDiscussionThreadProps) {
    return (
        <ThreadView
            threadId={threadId}
            listHref={`/student/courses/${courseId}/discussions`}
        />
    );
}