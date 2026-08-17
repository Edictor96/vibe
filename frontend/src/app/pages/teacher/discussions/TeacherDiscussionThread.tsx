import { ThreadView } from "@/components/discussions/ThreadView";

interface TeacherDiscussionThreadProps {
    /** Path param from the router — `:threadId`. */
    threadId: string;
    /** Path param from the router — `:courseId`. */
    courseId: string;
}

/**
 * Teacher-side discussion thread detail page.
 *
 * Sibling of `TeacherDiscussions`; lives inside the same `/teacher/...`
 * layout so the existing sidebar / main content panel wrap it.
 */
export default function TeacherDiscussionThread({
    threadId,
    courseId,
}: TeacherDiscussionThreadProps) {
    return (
        <ThreadView
            threadId={threadId}
            listHref={`/teacher/courses/${courseId}/discussions`}
        />
    );
}