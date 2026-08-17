import {AbilityBuilder, MongoAbility} from '@casl/ability';
import {
  AuthenticatedUser,
  AuthenticatedUserEnrollements,
} from '#root/shared/interfaces/models.js';
import {createDiscussionAbilityBuilder} from './types.js';

/**
 * Discussion-board actions.
 *
 * CASL only describes the *static* (courseId-bound) half of the rules; the
 * cohort-visibility half is enforced server-side by `DiscussionService`,
 * which uses the caller's authenticated enrollments to filter every read
 * and to gate every write. Keeping these two halves separate is what stops
 * a client-supplied `cohortId` from widening a student's view.
 */
export enum DiscussionActions {
  View = 'view',
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Reply = 'reply',
}

export type DiscussionSubjectType = 'Discussion';

export const DiscussionSubject = 'Discussion';

/**
 * Grant discussion abilities for one authenticated user.
 *
 * - `admin` may do anything across the whole platform.
 * - Every other authenticated user is gated by their enrollments on the
 *   course: a user with no enrollment gets no grants.
 * - INSTRUCTOR / MANAGER / TA get read + reply across all cohorts of their
 *   course(s). Moderation actions are intentionally NOT granted here —
 *   pin/unpin and teacher delete-any are deferred to a later milestone.
 * - STUDENT / STAFF get the same read + reply grants on their courses.
 *   Whether a student can read *another cohort's* thread is decided by
 *   `DiscussionService` at query time, not here.
 */
export function setupDiscussionAbilities(
  builder: AbilityBuilder<any>,
  user: AuthenticatedUser,
): void {
  const {can} = builder;

  if (user.globalRole === 'admin') {
    can('manage', DiscussionSubject);
    return;
  }

  user.enrollments.forEach((enrollment: AuthenticatedUserEnrollements) => {
    const courseBounded = {courseId: enrollment.courseId};

    switch (enrollment.role) {
      case 'STUDENT':
        can(DiscussionActions.View, DiscussionSubject, courseBounded);
        can(DiscussionActions.Reply, DiscussionSubject, courseBounded);
        can(DiscussionActions.Create, DiscussionSubject, courseBounded);
        can(DiscussionActions.Update, DiscussionSubject, courseBounded);
        can(DiscussionActions.Delete, DiscussionSubject, courseBounded);
        break;

      case 'INSTRUCTOR':
      case 'MANAGER':
      case 'TA':
      case 'STAFF':
        can(DiscussionActions.View, DiscussionSubject, courseBounded);
        can(DiscussionActions.Reply, DiscussionSubject, courseBounded);
        can(DiscussionActions.Create, DiscussionSubject, courseBounded);
        can(DiscussionActions.Update, DiscussionSubject, courseBounded);
        can(DiscussionActions.Delete, DiscussionSubject, courseBounded);
        break;

      default:
        break;
    }
  });
}

export function getDiscussionAbility(
  user: AuthenticatedUser,
): MongoAbility<any> {
  const builder = createDiscussionAbilityBuilder();
  setupDiscussionAbilities(builder, user);
  return builder.build();
}