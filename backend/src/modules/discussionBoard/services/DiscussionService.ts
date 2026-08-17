import {inject, injectable} from 'inversify';
import {BadRequestError, ForbiddenError, NotFoundError} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {BaseService} from '#root/shared/classes/BaseService.js';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {
  AuthenticatedUser,
  AuthenticatedUserEnrollements,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {IDiscussionThreadRepository} from '../interfaces/IDiscussionThreadRepository.js';
import {IDiscussionReplyRepository} from '../interfaces/IDiscussionReplyRepository.js';
import {DISCUSSIONBOARD_TYPES} from '../types.js';
import {IDiscussionThread, IDiscussionReply} from '../repositories/model.js';

export interface CreateThreadInput {
  courseId: string;
  cohortId: string;
  title: string;
  body: string;
}

export interface UpdateThreadInput {
  title?: string;
  body?: string;
}

export interface CreateReplyInput {
  body: string;
}

/**
 * Course-level cohort scope (parallel to the existing
 * `CohortScopeService`, but scoped by `courseId` rather than
 * `courseVersionId`, because DiscussionThread has no versionId).
 *
 * `cohortIds: null` means unrestricted (admin / cohort-agnostic roles /
 * legacy students without a cohortId).
 */
export interface DiscussionCohortScope {
  cohortIds: ObjectId[] | null;
}

/**
 * Discussion-board orchestration.
 *
 * Every read and every write independently re-derives the caller's cohort
 * scope from their enrollments, then applies it as a Mongo filter or a
 * targeted permission check. A client-supplied `cohortId` is treated as a
 * request, never as a grant — if it falls outside the caller's scope the
 * service throws the reference-module convention (`NotFoundError`), so the
 * existence of another cohort's thread is never leaked.
 *
 * `BaseService` is extended so multi-step writes (create thread + reply,
 * delete thread + its replies) run inside a Mongo transaction.
 */
@injectable()
export class DiscussionService extends BaseService {
  constructor(
    @inject(DISCUSSIONBOARD_TYPES.DiscussionThreadRepository)
    private readonly _threadRepo: IDiscussionThreadRepository,
    @inject(DISCUSSIONBOARD_TYPES.DiscussionReplyRepository)
    private readonly _replyRepo: IDiscussionReplyRepository,
    @inject(GLOBAL_TYPES.Database)
    private readonly _database: MongoDatabase,
  ) {
    super(_database);
  }

  // -------------------------------------------------------------------
  // Public API — list / create / get / update / delete / reply
  // -------------------------------------------------------------------

  /**
   * List every thread on a course visible to the caller, sorted pinned
   * first then newest first. Cohort-scoping is applied server-side.
   */
  async listThreads(
    courseId: string,
    user: AuthenticatedUser,
  ): Promise<IDiscussionThread[]> {
    this.assertValidCourseId(courseId);

    const scope = this.resolveCourseScope(user, courseId);
    const filter = this.cohortFilter(scope);
    return this._threadRepo.listByCourse(courseId, filter);
  }

  /**
   * Create a thread. The caller must hold an enrollment on the course AND
   * the requested cohortId must be inside their authorised scope; for a
   * student, that means it has to be their own cohort, so they can't post
   * into another cohort by accident or by tampering.
   */
  async createThread(
    input: CreateThreadInput,
    user: AuthenticatedUser,
  ): Promise<IDiscussionThread> {
    this.assertValidCourseId(input.courseId);
    this.assertValidCohortId(input.cohortId);

    this.assertCourseMembership(user, input.courseId);
    this.assertCohortWritable(user, input.courseId, input.cohortId);

    const authorId = this.toObjectId(user.userId);

    return this._withTransaction(async session => {
      return this._threadRepo.create(
        {
          courseId: new ObjectId(input.courseId),
          cohortId: new ObjectId(input.cohortId),
          authorId,
          title: input.title,
          body: input.body,
          pinned: false,
        } as IDiscussionThread,
        session,
      );
    });
  }

  /**
   * Fetch a thread by ID together with its replies. Returns NotFoundError
   * both when the thread doesn't exist AND when it does but the caller's
   * cohort scope excludes its cohort — same error code, no leak.
   */
  async getThread(
    threadId: string,
    user: AuthenticatedUser,
  ): Promise<{thread: IDiscussionThread; replies: IDiscussionReply[]}> {
    const thread = await this._threadRepo.findById(threadId);
    if (!thread) {
      throw new NotFoundError('Thread not found');
    }

    const courseId = this.idToString(thread.courseId);
    this.assertCourseMembership(user, courseId);

    // Cohort visibility check — fail with the same NotFoundError convention
    // a missing thread uses, so the existence of another cohort's thread
    // can't be inferred from a different status code.
    this.assertCohortReadable(
      user,
      courseId,
      this.idToString(thread.cohortId),
    );

    const replies = await this._replyRepo.listByThread(threadId);
    return {thread, replies};
  }

  /**
   * Edit an existing thread. Only the author can edit for now; teacher
   * moderation is a later milestone (the controller accepts the request
   * and the service short-circuits with a ForbiddenError if needed).
   */
  async updateThread(
    threadId: string,
    input: UpdateThreadInput,
    user: AuthenticatedUser,
  ): Promise<IDiscussionThread> {
    if (!input.title && !input.body) {
      throw new BadRequestError(
        'At least one of `title` or `body` must be provided',
      );
    }

    const thread = await this._threadRepo.findById(threadId);
    if (!thread) {
      throw new NotFoundError('Thread not found');
    }

    const courseId = this.idToString(thread.courseId);
    this.assertCourseMembership(user, courseId);
    this.assertCohortReadable(
      user,
      courseId,
      this.idToString(thread.cohortId),
    );
    this.assertAuthor(thread.authorId, user);

    return this._withTransaction(async session => {
      const updated = await this._threadRepo.update(
        threadId,
        {title: input.title, body: input.body},
        session,
      );
      if (!updated) {
        throw new NotFoundError('Thread not found');
      }
      return updated;
    });
  }

  /**
   * Delete a thread. Only the author can delete for now; teacher
   * delete-any is a later milestone.
   */
  async deleteThread(
    threadId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const thread = await this._threadRepo.findById(threadId);
    if (!thread) {
      throw new NotFoundError('Thread not found');
    }

    const courseId = this.idToString(thread.courseId);
    this.assertCourseMembership(user, courseId);
    this.assertCohortReadable(
      user,
      courseId,
      this.idToString(thread.cohortId),
    );
    this.assertAuthor(thread.authorId, user);

    await this._withTransaction(async session => {
      await this._replyRepo.deleteByThread(threadId, session);
      await this._threadRepo.deleteById(threadId, session);
    });
  }

  /**
   * Post a reply to an existing thread. The caller must hold an enrollment
   * on the course and be permitted to read into the thread's cohort.
   *
   * Edge cases (reply edit-permission, teacher reply moderation) are
   * intentionally deferred to a later milestone — base plumbing only here.
   */
  async createReply(
    threadId: string,
    input: CreateReplyInput,
    user: AuthenticatedUser,
  ): Promise<IDiscussionReply> {
    const thread = await this._threadRepo.findById(threadId);
    if (!thread) {
      throw new NotFoundError('Thread not found');
    }

    const courseId = this.idToString(thread.courseId);
    this.assertCourseMembership(user, courseId);
    this.assertCohortReadable(
      user,
      courseId,
      this.idToString(thread.cohortId),
    );

    const authorId = this.toObjectId(user.userId);

    return this._withTransaction(async session => {
      return this._replyRepo.create(
        {
          threadId: new ObjectId(threadId),
          authorId,
          body: input.body,
        } as IDiscussionReply,
        session,
      );
    });
  }

  // -------------------------------------------------------------------
  // Cohort-scope resolution — courseId level, no versionId involved
  // -------------------------------------------------------------------

  /**
   * Resolve the cohorts on a single course the caller may read or write
   * into. Returns `null` for unrestricted callers (admin, cohort-agnostic
   * roles, legacy students without a cohortId).
   *
   * Reuses the same role semantics as the existing `CohortScopeService`:
   *   - admin  -> unrestricted
   *   - INSTRUCTOR / STAFF -> their assignedCohortIds (fails open when none)
   *   - STUDENT -> pinned to own cohortId
   *   - MANAGER / TA -> unrestricted (course-wide moderators)
   *
   * Cohorts are unioned across every enrollment the caller holds on the
   * course (any version), so a user enrolled twice still sees the union.
   */
  resolveCourseScope(
    user: AuthenticatedUser,
    courseId: string,
    requestedCohortId?: string,
  ): DiscussionCohortScope {
    if (user.globalRole === 'admin') {
      if (requestedCohortId) {
        return {cohortIds: [this.toObjectId(requestedCohortId)]};
      }
      return {cohortIds: null};
    }

    const matching = user.enrollments.filter(
      e => e.courseId === courseId,
    );
    if (matching.length === 0) {
      // No enrollment on this course at all. CASL is the coarse gate; we
      // still let the caller through if they explicitly asked for one
      // cohort — but the assertion helpers below will reject any access.
      if (requestedCohortId) {
        return {cohortIds: [this.toObjectId(requestedCohortId)]};
      }
      return {cohortIds: []};
    }

    // A caller who has *any* enrollment with cohortIds=null (typically
    // MANAGER/TA, or a legacy student whose row predates cohorts) stays
    // unrestricted on this course.
    if (matching.some(e => e.cohortIds === null)) {
      if (requestedCohortId) {
        return {cohortIds: [this.toObjectId(requestedCohortId)]};
      }
      return {cohortIds: null};
    }

    const union = [
      ...new Set(matching.flatMap(e => e.cohortIds ?? [])),
    ];
    const objectIdUnion = union.map(id => new ObjectId(id));

    if (requestedCohortId) {
      if (!union.some(id => id.toString() === requestedCohortId)) {
        // Use the reference-module convention: NotFoundError, not Forbidden,
        // so the caller can't probe for other cohorts' existence.
        throw new NotFoundError('Thread not found');
      }
      return {cohortIds: [new ObjectId(requestedCohortId)]};
    }

    return {cohortIds: objectIdUnion};
  }

  /**
   * Translate a scope into the Mongo filter fragment consumed by the
   * thread repo. Unrestricted callers contribute nothing; restricted
   * callers always get an `$in`, even for a single cohort, so a typo in a
   * later code path can't silently widen them.
   */
  cohortFilter(scope: DiscussionCohortScope): Record<string, unknown> {
    if (scope.cohortIds === null) return {};
    if (scope.cohortIds.length === 0) {
      // A restricted scope that matched no cohorts at all — force empty.
      return {cohortId: {$in: []}};
    }
    return {cohortId: {$in: scope.cohortIds}};
  }

  // -------------------------------------------------------------------
  // Permission assertions — used by mutating paths
  // -------------------------------------------------------------------

  /**
   * Confirm the caller holds at least one enrollment on the course. We
   * throw NotFoundError (not Forbidden) so a typo or a forged courseId
   * doesn't leak whether the course exists.
   */
  private assertCourseMembership(
    user: AuthenticatedUser,
    courseId: string,
  ): void {
    if (user.globalRole === 'admin') return;

    const hasEnrollment = user.enrollments.some(
      (e: AuthenticatedUserEnrollements) => e.courseId === courseId,
    );
    if (!hasEnrollment) {
      throw new NotFoundError('Thread not found');
    }
  }

  /**
   * Confirm the caller can read into a particular cohort. Uses
   * `resolveCourseScope` so the same role semantics cover both reads and
   * writes.
   */
  private assertCohortReadable(
    user: AuthenticatedUser,
    courseId: string,
    cohortId: string,
  ): void {
    const scope = this.resolveCourseScope(user, courseId, cohortId);
    if (scope.cohortIds === null) return;
    const allowed = scope.cohortIds.map(id => id.toString());
    if (!allowed.includes(cohortId)) {
      throw new NotFoundError('Thread not found');
    }
  }

  /**
   * Confirm the caller can write into a particular cohort. For Milestone A
   * the rules are identical to "readable" — teacher delete-any and other
   * moderation powers are explicitly deferred to a later task. The
   * separate method name documents the intent so the later work has an
   * obvious place to plug in.
   */
  private assertCohortWritable(
    user: AuthenticatedUser,
    courseId: string,
    cohortId: string,
  ): void {
    this.assertCohortReadable(user, courseId, cohortId);
  }

  /**
   * Confirm the caller is the author of the resource they're editing or
   * deleting. Teacher moderation comes later; for now this is a hard
   * "you can only touch your own thread" gate.
   */
  private assertAuthor(authorIdField: unknown, user: AuthenticatedUser): void {
    const authorId = this.idToString(authorIdField);
    if (authorId !== user.userId) {
      throw new ForbiddenError(
        'Only the author can modify this thread',
      );
    }
  }

  // -------------------------------------------------------------------
  // ID helpers
  // -------------------------------------------------------------------

  private assertValidCourseId(courseId: string): void {
    if (!ObjectId.isValid(courseId)) {
      throw new BadRequestError('Invalid courseId');
    }
  }

  private assertValidCohortId(cohortId: string): void {
    if (!ObjectId.isValid(cohortId)) {
      throw new BadRequestError('Invalid cohortId');
    }
  }

  private toObjectId(id: string): ObjectId {
    return new ObjectId(id);
  }

  /**
   * Normalise anything that might land here — `ObjectId`, a stringified
   * `ObjectId`, or the raw 24-char hex string — into a plain string. The
   * repo stores ObjectIds, the ability/auth path uses strings, and both
   * can meet at this boundary.
   */
  private idToString(id: unknown): string {
    if (!id) return '';
    if (id instanceof ObjectId) return id.toString();
    if (typeof id === 'string') return id;
    // last resort — anything with a toString()
    return (id as {toString(): string}).toString();
  }
}