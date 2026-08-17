import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDiscussionThread } from "@/hooks/discussion-hooks";
import type {
    CreateDiscussionBody,
    DiscussionError,
    DiscussionThread,
} from "@/types/discussion.types";

interface CreateDiscussionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    courseId: string;
    /**
     * Cohort the thread should be created in. The backend re-derives the
     * caller's authorised scope server-side, so this is treated as a
     * request, not a grant.
     */
    cohortId: string | null;
    /**
     * Called with the freshly-created thread so the parent can navigate to
     * its detail page. The hook will already have unwound `isPending`.
     */
    onCreated?: (thread: DiscussionThread) => void;
}

/**
 * Modal form to create a new discussion thread.
 *
 * - Title: required, ≤ 200 characters (mirrors `CreateThreadBody`).
 * - Body:  required (mirrors `CreateThreadBody`).
 * - cohortId: required by the backend, taken from the prop (resolved by
 *   the caller from `useCourseStore.currentCourse.cohortId`).
 *
 * Validation errors come back as `DiscussionError.fieldErrors` and are
 * surfaced inline under each input, with the same wording the backend
 * returns.
 */
export function CreateDiscussionDialog({
    open,
    onOpenChange,
    courseId,
    cohortId,
    onCreated,
}: CreateDiscussionDialogProps) {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const { mutateAsync, isPending, error: hookError } = useCreateDiscussionThread(courseId);

    // Reset local form state every time the dialog re-opens.
    useEffect(() => {
        if (open) {
            setTitle("");
            setBody("");
            setFieldErrors({});
            setFormError(null);
        }
    }, [open]);

    // Surface hook-level errors that aren't field-scoped.
    useEffect(() => {
        if (!hookError) return;
        if (hookError.kind === "validation" && hookError.fieldErrors) {
            setFieldErrors(hookError.fieldErrors);
            setFormError(null);
            return;
        }
        setFieldErrors({});
        setFormError(hookError.message);
    }, [hookError]);

    const titleMessages = fieldErrors.title ?? [];
    const bodyMessages = fieldErrors.body ?? [];
    const cohortMessages = fieldErrors.cohortId ?? [];

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormError(null);
        setFieldErrors({});

        if (!cohortId) {
            setFormError(
                "No cohort is currently selected. Open a course before starting a discussion.",
            );
            return;
        }

        const payload: CreateDiscussionBody = {
            title: title.trim(),
            body: body.trim(),
            cohortId,
        };

        try {
            const thread = await mutateAsync(payload);
            onOpenChange(false);
            onCreated?.(thread);
        } catch (err) {
            const discussionErr = err as DiscussionError;
            if (discussionErr.kind === "validation" && discussionErr.fieldErrors) {
                setFieldErrors(discussionErr.fieldErrors);
                return;
            }
            setFormError(discussionErr.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[525px]"
                data-testid="create-discussion-dialog"
            >
                <DialogHeader>
                    <DialogTitle>Start a new discussion</DialogTitle>
                    <DialogDescription>
                        Posts a thread visible to everyone in your cohort.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="discussion-title">Title</Label>
                        <Input
                            id="discussion-title"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="What's on your mind?"
                            maxLength={200}
                            disabled={isPending}
                            aria-invalid={titleMessages.length > 0}
                            data-testid="create-discussion-title"
                        />
                        {titleMessages.map((msg, idx) => (
                            <p
                                key={idx}
                                className="text-xs text-destructive"
                                data-testid="create-discussion-title-error"
                            >
                                {msg}
                            </p>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="discussion-body">Body</Label>
                        <Textarea
                            id="discussion-body"
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Share the details. Markdown / plain text both work."
                            className="min-h-[140px]"
                            disabled={isPending}
                            aria-invalid={bodyMessages.length > 0}
                            data-testid="create-discussion-body"
                        />
                        {bodyMessages.map((msg, idx) => (
                            <p
                                key={idx}
                                className="text-xs text-destructive"
                                data-testid="create-discussion-body-error"
                            >
                                {msg}
                            </p>
                        ))}
                    </div>

                    {cohortMessages.length > 0 && (
                        <p className="text-xs text-destructive">
                            {cohortMessages.join(" ")}
                        </p>
                    )}

                    {formError && (
                        <p
                            className="text-xs text-destructive"
                            data-testid="create-discussion-form-error"
                        >
                            {formError}
                        </p>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="min-w-[120px]"
                            data-testid="create-discussion-submit"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                "Post thread"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}