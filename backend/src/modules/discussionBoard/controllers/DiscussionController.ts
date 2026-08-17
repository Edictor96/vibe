import 'reflect-metadata';
import {
  Authorized,
  Body,
  Delete,
  ForbiddenError,
  Get,
  HttpCode,
  JsonController,
  OnUndefined,
  Params,
  Patch,
  Post,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {subject} from '@casl/ability';

import {Ability} from '#root/shared/functions/AbilityDecorator.js';
import {BadRequestErrorResponse} from '#root/shared/middleware/errorHandler.js';

import {DISCUSSIONBOARD_TYPES} from '../types.js';
import {DiscussionService} from '../services/DiscussionService.js';
import {
  getDiscussionAbility,
  DiscussionActions,
  DiscussionSubject,
} from '../abilities/discussionAbilities.js';
import {
  CourseIdParams,
  CreateReplyBody,
  CreateThreadBody,
  ThreadIdParams,
  UpdateThreadBody,
} from '../classes/validators/DiscussionValidators.js';
import {
  DiscussionReplyResponse,
  DiscussionThreadDetailResponse,
  DiscussionThreadResponse,
  toReplyResponse,
  toThreadDetailResponse,
  toThreadResponse,
} from '../classes/transformers/Discussion.js';

@OpenAPI({
  tags: ['Discussions'],
})
@JsonController()
@injectable()
export class DiscussionController {
  constructor(
    @inject(DISCUSSIONBOARD_TYPES.DiscussionService)
    private readonly _service: DiscussionService,
  ) {}

  /**
   * List threads on a course visible to the caller. Cohort scoping is
   * applied server-side — the caller can never widen beyond their own
   * cohort (or, for unrestricted roles, beyond the whole course).
   */
  @Authorized()
  @Get('/course/:courseId/discussions')
  @HttpCode(200)
  @OpenAPI({
    summary: 'List discussion threads on a course',
    description:
      'Returns threads visible to the authenticated caller. Threads from ' +
      "cohorts the caller isn't enrolled in are filtered out server-side.",
  })
  @ResponseSchema(DiscussionThreadResponse, {
    description: 'Visible threads',
    statusCode: 200,
    isArray: true,
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async listThreads(
    @Params() params: CourseIdParams,
    @Ability(getDiscussionAbility) {ability, authenticatedUser},
  ): Promise<DiscussionThreadResponse[]> {
    const courseSubject = subject(DiscussionSubject, {
      courseId: params.courseId,
    });
    if (!ability.can(DiscussionActions.View, courseSubject)) {
      throw new ForbiddenError(
        'You do not have permission to view discussions on this course',
      );
    }

    const threads = await this._service.listThreads(
      params.courseId,
      authenticatedUser,
    );
    return threads.map(toThreadResponse);
  }

  /**
   * Create a new thread. The `cohortId` in the body is treated as a request
   * — the service re-checks it against the caller's authorised scope, so a
   * student can't post into another cohort by tampering with the request.
   */
  @Authorized()
  @Post('/course/:courseId/discussions')
  @HttpCode(201)
  @OpenAPI({
    summary: 'Create a discussion thread',
    description:
      'Creates a thread in the requested cohort. The cohortId must be ' +
      'inside the caller\'s authorised cohort scope for the course.',
  })
  @ResponseSchema(DiscussionThreadResponse, {
    description: 'Thread created',
    statusCode: 201,
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async createThread(
    @Params() params: CourseIdParams,
    @Body() body: CreateThreadBody,
    @Ability(getDiscussionAbility) {ability, authenticatedUser},
  ): Promise<DiscussionThreadResponse> {
    const courseSubject = subject(DiscussionSubject, {
      courseId: params.courseId,
    });
    if (!ability.can(DiscussionActions.Create, courseSubject)) {
      throw new ForbiddenError(
        'You do not have permission to create discussions on this course',
      );
    }

    const created = await this._service.createThread(
      {
        courseId: params.courseId,
        cohortId: body.cohortId,
        title: body.title,
        body: body.body,
      },
      authenticatedUser,
    );

    return toThreadResponse(created);
  }

  /**
   * Fetch one thread and its replies. Cross-cohort access returns the same
   * NotFoundError a missing thread uses — see DiscussionService.
   */
  @Authorized()
  @Get('/discussions/:threadId')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Get a discussion thread',
    description:
      'Returns a thread and its replies. The thread must belong to a ' +
      'cohort the caller is permitted to read.',
  })
  @ResponseSchema(DiscussionThreadDetailResponse, {
    description: 'Thread and replies',
    statusCode: 200,
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getThread(
    @Params() params: ThreadIdParams,
    @Ability(getDiscussionAbility) {authenticatedUser},
  ): Promise<DiscussionThreadDetailResponse> {
    const {thread, replies} = await this._service.getThread(
      params.threadId,
      authenticatedUser,
    );
    return toThreadDetailResponse(thread, replies);
  }

  /**
   * Edit an existing thread. Only the author can edit for now; teacher
   * moderation is deferred to a later milestone.
   */
  @Authorized()
  @Patch('/discussions/:threadId')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Edit a discussion thread',
    description: 'Edits the title and/or body of a thread you authored.',
  })
  @ResponseSchema(DiscussionThreadResponse, {
    description: 'Updated thread',
    statusCode: 200,
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateThread(
    @Params() params: ThreadIdParams,
    @Body() body: UpdateThreadBody,
    @Ability(getDiscussionAbility) {authenticatedUser},
  ): Promise<DiscussionThreadResponse> {
    const updated = await this._service.updateThread(
      params.threadId,
      {title: body.title, body: body.body},
      authenticatedUser,
    );
    return toThreadResponse(updated);
  }

  /**
   * Delete a thread. Only the author can delete for now; teacher delete-any
   * is deferred to a later milestone.
   */
  @Authorized()
  @Delete('/discussions/:threadId')
  @OnUndefined(204)
  @HttpCode(204)
  @OpenAPI({
    summary: 'Delete a discussion thread',
    description: 'Deletes a thread you authored, along with its replies.',
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteThread(
    @Params() params: ThreadIdParams,
    @Ability(getDiscussionAbility) {authenticatedUser},
  ): Promise<void> {
    await this._service.deleteThread(params.threadId, authenticatedUser);
  }

  /**
   * Post a reply to an existing thread.
   *
   * Edge cases (reply edit-permission, teacher moderation) are intentionally
   * deferred — base plumbing only.
   */
  @Authorized()
  @Post('/discussions/:threadId/replies')
  @HttpCode(201)
  @OpenAPI({
    summary: 'Reply to a discussion thread',
    description:
      'Posts a reply to a thread the caller is permitted to read. Edit ' +
      'and moderation edge cases deepen in a later milestone.',
  })
  @ResponseSchema(DiscussionReplyResponse, {
    description: 'Reply posted',
    statusCode: 201,
  })
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async createReply(
    @Params() params: ThreadIdParams,
    @Body() body: CreateReplyBody,
    @Ability(getDiscussionAbility) {authenticatedUser},
  ): Promise<DiscussionReplyResponse> {
    const reply = await this._service.createReply(
      params.threadId,
      {body: body.body},
      authenticatedUser,
    );
    return toReplyResponse(reply);
  }
}