/**
 * Discussion-board API integration tests.
 *
 * The cohort-isolation property is the headline acceptance criterion for
 * Milestone A, so these tests focus on proving it at the database /
 * response level rather than just at the UI hiding layer:
 *
 *   - Student A in cohort A can list / read threads inside cohort A.
 *   - Student B in cohort B cannot see cohort A's threads via any of the
 *     six endpoints, even when they hand-craft cohort A's id in the URL.
 *   - An instructor with both cohorts assigned can see threads in either.
 *   - An unauthenticated request is rejected.
 *
 * Auth is mocked at `FirebaseAuthService.getCurrentUserFromToken` and
 * enrollments are mocked at `EnrollmentService.getAllEnrollments`, so the
 * test exercises the actual routing-controllers wiring, the actual
 * controllers, and the actual DiscussionService against a real (in-memory)
 * MongoDB. No service-level mocks — that's what makes the cohort
 * isolation proof meaningful.
 */

import request from 'supertest';
import Express from 'express';
import {ObjectId} from 'mongodb';
import {useContainer, useExpressServer} from 'routing-controllers';
import {Container} from 'inversify';
import {beforeAll, describe, expect, it, vi} from 'vitest';

import {InversifyAdapter} from '#root/inversify-adapter.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {sharedContainerModule} from '#root/container.js';
import {authContainerModule} from '#root/modules/auth/container.js';
import {usersContainerModule} from '#root/modules/users/container.js';
import {coursesContainerModule} from '#root/modules/courses/container.js';
import {notificationsContainerModule} from '#root/modules/notifications/container.js';
import {projectsContainerModule} from '#root/modules/projects/container.js';
import {courseRegistrationContainerModule} from '#root/modules/courseRegistration/container.js';
import {studentQuestionsContainerModule} from '#root/modules/studentQuestions/container.js';
import {announcementsContainerModule} from '#root/modules/announcements/container.js';
import {auditTrailsContainerModule} from '#root/modules/auditTrails/container.js';
import {settingContainerModule} from '#root/modules/setting/container.js';
import {quizzesContainerModule} from '#root/modules/quizzes/container.js';
import {anomaliesContainerModule} from '#root/modules/anomalies/container.js';
import {reportsContainerModule} from '#root/modules/reports/container.js';
import {hpSystemContainerModule} from '#root/modules/hpSystem/container.js';
import {ejectionPolicyContainerModule} from '#root/modules/ejectionPolicy/container.js';
import {emotionsContainerModule} from '#root/modules/emotions/container.js';
import {genAIContainerModule} from '#root/modules/genAI/container.js';
import {discussionBoardContainerModule} from '../container.js';

import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {EnrollmentService} from '#root/modules/users/services/EnrollmentService.js';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {ICourseRepository} from '#root/shared/database/interfaces/ICourseRepository.js';
import {DiscussionController} from '../controllers/DiscussionController.js';
import {CourseController} from '#root/modules/courses/controllers/CourseController.js';
import {CourseVersionController} from '#root/modules/courses/controllers/CourseVersionController.js';
import {UserController} from '#root/modules/users/controllers/UserController.js';
import {AuthController} from '#root/modules/auth/controllers/AuthController.js';

const COHORT_A = new ObjectId();
const COHORT_B = new ObjectId();

const studentAUserId = new ObjectId().toString();
const studentBUserId = new ObjectId().toString();
const instructorUserId = new ObjectId().toString();
const adminUserId = new ObjectId().toString();

const mockStudentAUser = {
  _id: studentAUserId,
  firebaseUID: 'studentA-firebase-uid',
  email: 'studentA@test.com',
  firstName: 'Student',
  lastName: 'A',
  roles: 'user',
};
const mockStudentBUser = {
  _id: studentBUserId,
  firebaseUID: 'studentB-firebase-uid',
  email: 'studentB@test.com',
  firstName: 'Student',
  lastName: 'B',
  roles: 'user',
};
const mockInstructorUser = {
  _id: instructorUserId,
  firebaseUID: 'instructor-firebase-uid',
  email: 'instructor@test.com',
  firstName: 'Instructor',
  lastName: 'User',
  roles: 'user',
};
const mockAdminUser = {
  _id: adminUserId,
  firebaseUID: 'admin-firebase-uid',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  roles: 'admin',
};

describe('Discussion Controller — Milestone A cohort isolation', {timeout: 90000}, () => {
  const appInstance = Express();
  let app: any;
  let courseId: string;
  let courseVersionId: string;
  let cohortAId: string;
  let cohortBId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const container = new Container();
    await container.load(
      sharedContainerModule,
      authContainerModule,
      usersContainerModule,
      coursesContainerModule,
      quizzesContainerModule,
      notificationsContainerModule,
      anomaliesContainerModule,
      settingContainerModule,
      courseRegistrationContainerModule,
      projectsContainerModule,
      reportsContainerModule,
      hpSystemContainerModule,
      ejectionPolicyContainerModule,
      emotionsContainerModule,
      genAIContainerModule,
      studentQuestionsContainerModule,
      announcementsContainerModule,
      auditTrailsContainerModule,
      discussionBoardContainerModule,
    );

    const inversifyAdapter = new InversifyAdapter(container);
    useContainer(inversifyAdapter);

    const db = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
    await db.connect();

    // -------------------------------------------------------------------
    // Set up a course with two cohorts directly via the repo so we don't
    // depend on every single piece of the course-creation flow.
    // -------------------------------------------------------------------
    const courseRepo = container.get<ICourseRepository>(GLOBAL_TYPES.CourseRepo);
    const created = await courseRepo.create({
      name: 'Discussion Test Course',
      description: 'For testing cohort-isolated discussions',
      versions: [],
      instructors: [new ObjectId(instructorUserId)],
    } as any);
    expect(created).not.toBeNull();
    courseId = (created!._id as ObjectId).toString();

    const createdVersion = await courseRepo.createVersion({
      courseId: new ObjectId(courseId),
      version: '1.0',
      description: 'Test version',
      modules: [],
      versionStatus: 'active',
    } as any, undefined);
    courseVersionId = (createdVersion!._id as ObjectId).toString();
    await courseRepo.addNewCourseVersionToCourse(
      courseId,
      courseVersionId,
    );

    const cohortObjectIds = await courseRepo.createCohorts(
      courseId,
      courseVersionId,
      ['Cohort A', 'Cohort B'],
      0,
    );
    expect(cohortObjectIds).toHaveLength(2);
    // The cohort ids come out in the same order they were requested, but
    // re-derive by name in case the underlying impl ever sorts differently.
    const hydrated = await courseRepo.getCohortsByIds(cohortObjectIds);
    const aDoc = hydrated.find(c => c.name === 'Cohort A');
    const bDoc = hydrated.find(c => c.name === 'Cohort B');
    expect(aDoc).toBeDefined();
    expect(bDoc).toBeDefined();
    cohortAId = aDoc!._id!.toString();
    cohortBId = bDoc!._id!.toString();

    // -------------------------------------------------------------------
    // Mock auth: a token per persona.
    // -------------------------------------------------------------------
    vi.spyOn(
      FirebaseAuthService.prototype,
      'getCurrentUserFromToken',
    ).mockImplementation(async (token: string) => {
      switch (token) {
        case 'studentA-token':
          return mockStudentAUser as any;
        case 'studentB-token':
          return mockStudentBUser as any;
        case 'instructor-token':
          return mockInstructorUser as any;
        case 'admin-token':
          return mockAdminUser as any;
        default:
          throw new Error('Invalid token');
      }
    });

    // -------------------------------------------------------------------
    // Mock enrollments: studentA pinned to cohortA, studentB pinned to
    // cohortB, instructor assigned to both. Admin stays unrestricted.
    //
    // The cast to `as any` on the mock keeps the test focused on the
    // fields the AbilityDecorator actually reads; the real
    // `EnrollmentService.getAllEnrollments` returns many more fields the
    // mock doesn't need to populate.
    // -------------------------------------------------------------------
    vi.spyOn(
      EnrollmentService.prototype,
      'getAllEnrollments',
    ).mockImplementation((async (userId: string) => {
      if (userId === studentAUserId) {
        return [
          {
            _id: new ObjectId(),
            userId: new ObjectId(userId),
            courseId: new ObjectId(courseId),
            courseVersionId: new ObjectId(courseVersionId),
            role: 'STUDENT',
            status: 'ACTIVE',
            cohortId: new ObjectId(cohortAId),
          },
        ];
      }
      if (userId === studentBUserId) {
        return [
          {
            _id: new ObjectId(),
            userId: new ObjectId(userId),
            courseId: new ObjectId(courseId),
            courseVersionId: new ObjectId(courseVersionId),
            role: 'STUDENT',
            status: 'ACTIVE',
            cohortId: new ObjectId(cohortBId),
          },
        ];
      }
      if (userId === instructorUserId) {
        return [
          {
            _id: new ObjectId(),
            userId: new ObjectId(userId),
            courseId: new ObjectId(courseId),
            courseVersionId: new ObjectId(courseVersionId),
            role: 'INSTRUCTOR',
            status: 'ACTIVE',
            assignedCohortIds: [
              new ObjectId(cohortAId),
              new ObjectId(cohortBId),
            ],
          },
        ];
      }
      if (userId === adminUserId) {
        return [
          {
            _id: new ObjectId(),
            userId: new ObjectId(userId),
            courseId: new ObjectId(courseId),
            courseVersionId: new ObjectId(courseVersionId),
            role: 'INSTRUCTOR',
            status: 'ACTIVE',
            assignedCohortIds: [],
          },
        ];
      }
      return [];
    }) as any);

    app = useExpressServer(appInstance, {
      controllers: [
        DiscussionController,
        // Stand up enough of the existing routes to be a realistic surface,
        // but keep the test focused on the discussion endpoints.
        CourseController,
        CourseVersionController,
        AuthController,
        UserController,
      ],
      authorizationChecker: async action => {
        const auth = action.request.headers.authorization;
        if (!auth) return false;
        // Accept both "Bearer token" and bare-token forms so the test
        // doesn't need to constantly wrap every header value.
        const token = auth.includes(' ') ? auth.split(' ')[1] : auth;
        return !!token && token !== 'no-token';
      },
      currentUserChecker: async action => {
        const auth = action.request.headers.authorization;
        if (!auth) return null;
        const token = auth.includes(' ') ? auth.split(' ')[1] : auth;
        switch (token) {
          case 'studentA-token':
            return mockStudentAUser;
          case 'studentB-token':
            return mockStudentBUser;
          case 'instructor-token':
            return mockInstructorUser;
          case 'admin-token':
            return mockAdminUser;
          default:
            return null;
        }
      },
      defaultErrorHandler: true,
      validation: true,
    });
  });

  // ---------------------------------------------------------------------
  // Acceptance criteria
  // ---------------------------------------------------------------------

  it('rejects an unauthenticated request to list threads', async () => {
    const res = await request(app)
      .get(`/course/${courseId}/discussions`)
      .expect(401);
    expect(res.body).toHaveProperty('message');
  });

  it('lets a student create and list a thread inside their own cohort', async () => {
    const createRes = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Cohort A thread',
        body: 'Anyone else stuck on module 3?',
        cohortId: cohortAId,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      title: 'Cohort A thread',
      body: 'Anyone else stuck on module 3?',
      courseId,
      cohortId: cohortAId,
      authorId: studentAUserId,
      pinned: false,
    });
    expect(createRes.body._id).toBeDefined();

    const listRes = await request(app)
      .get(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      title: 'Cohort A thread',
      cohortId: cohortAId,
    });
  });

  it('lets a teacher create / list threads for their course', async () => {
    const createRes = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer instructor-token')
      .send({
        title: 'Instructor announcement',
        body: 'Welcome to the new cohort',
        cohortId: cohortAId,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      authorId: instructorUserId,
      cohortId: cohortAId,
    });

    // Teacher sees cohort A's student thread too because they're assigned
    // to both cohorts.
    const listRes = await request(app)
      .get(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer instructor-token')
      .expect(200);

    const titles = (listRes.body as any[]).map(t => t.title).sort();
    expect(titles).toEqual(
      expect.arrayContaining([
        'Cohort A thread',
        'Instructor announcement',
      ]),
    );
  });

  it('stops a student in cohort B from seeing cohort A threads via list', async () => {
    const res = await request(app)
      .get(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentB-token')
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('stops a student in cohort B from creating a thread in cohort A', async () => {
    await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentB-token')
      .send({
        title: 'Trying to sneak into cohort A',
        body: 'should not work',
        cohortId: cohortAId,
      })
      .expect(404);
  });

  it('returns the same 404 for cross-cohort single-thread reads', async () => {
    // student A creates a thread
    const create = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Cohort A only',
        body: 'private to A',
        cohortId: cohortAId,
      })
      .expect(201);
    const threadId = create.body._id;

    // student B should not be able to fetch it
    const cross = await request(app)
      .get(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentB-token')
      .expect(404);
    expect(cross.body).toHaveProperty('message');

    // The instructor can
    const ok = await request(app)
      .get(`/discussions/${threadId}`)
      .set('authorization', 'Bearer instructor-token')
      .expect(200);
    expect(ok.body.thread._id).toBe(threadId);
    expect(Array.isArray(ok.body.replies)).toBe(true);
  });

  it('lets a student edit and delete their own thread, blocks anyone else', async () => {
    const create = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Editable',
        body: 'first version',
        cohortId: cohortAId,
      })
      .expect(201);
    const threadId = create.body._id;

    const patched = await request(app)
      .patch(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentA-token')
      .send({title: 'Edited title'})
      .expect(200);
    expect(patched.body.title).toBe('Edited title');

    // Different student can't edit. Cohort isolation runs first, so a
    // cross-cohort edit returns 404 (same status as a missing thread) to
    // avoid leaking the existence of another cohort's thread.
    await request(app)
      .patch(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentB-token')
      .send({title: 'Hacked'})
      .expect(404);

    // Author can delete
    await request(app)
      .delete(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentA-token')
      .expect(204);

    // Gone — same 404 even for the original author
    await request(app)
      .get(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentA-token')
      .expect(404);
  });

  it('lets a student post and read replies inside their own cohort', async () => {
    const create = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Thread for replies',
        body: 'start a conversation',
        cohortId: cohortAId,
      })
      .expect(201);
    const threadId = create.body._id;

    const reply = await request(app)
      .post(`/discussions/${threadId}/replies`)
      .set('authorization', 'Bearer studentA-token')
      .send({body: 'first reply'})
      .expect(201);
    expect(reply.body.body).toBe('first reply');

    const detail = await request(app)
      .get(`/discussions/${threadId}`)
      .set('authorization', 'Bearer studentA-token')
      .expect(200);
    expect(detail.body.thread._id).toBe(threadId);
    expect(detail.body.replies).toHaveLength(1);
    expect(detail.body.replies[0].body).toBe('first reply');
  });

  it('stops a student in cohort B from replying to a cohort A thread', async () => {
    const create = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Cohort A thread for reply test',
        body: 'private',
        cohortId: cohortAId,
      })
      .expect(201);
    const threadId = create.body._id;

    await request(app)
      .post(`/discussions/${threadId}/replies`)
      .set('authorization', 'Bearer studentB-token')
      .send({body: 'sneak in'})
      .expect(404);
  });

  it('sorts pinned threads before non-pinned ones', async () => {
    // Create a fresh thread and capture its id, so we can target the pin
    // update precisely instead of guessing by title.
    const create = await request(app)
      .post(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .send({
        title: 'Pinned thread',
        body: 'should sort first',
        cohortId: cohortAId,
      })
      .expect(201);
    // The response body's _id may be either a string or a {$oid: "..."}
    // object depending on how class-transformer serialised the ObjectId —
    // normalise to the plain hex string so new ObjectId(...) below works.
    const rawId = create.body._id as string | {$oid?: string};
    const pinnedId =
      typeof rawId === 'string' ? rawId : rawId?.$oid ?? String(rawId);
    expect(typeof pinnedId).toBe('string');
    expect(pinnedId).toHaveLength(24);

    // Pin it directly via Mongo so the API endpoint doesn't need to
    // expose pin/unpin (deferred to a later milestone). The application
    // uses the `vibe` database (see `config/db.ts`); `client.db()` would
    // otherwise default to `test` against a connection string that has
    // no path, so we pass the name explicitly.
    const {MongoClient} = await import('mongodb');
    const client = new MongoClient(process.env.DB_URL!);
    await client.connect();
    try {
      const threads = client.db('vibe').collection('discussion_threads');
      const result = await threads.updateOne(
        {_id: new ObjectId(pinnedId)},
        {$set: {pinned: true}},
      );
      expect(result.matchedCount).toBe(1);
    } finally {
      await client.close();
    }

    const listRes = await request(app)
      .get(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer studentA-token')
      .expect(200);

    const titles = (listRes.body as any[]).map(t => t.title);
    // The pinned one is first regardless of createdAt order.
    expect(titles[0]).toBe('Pinned thread');
  });

  it('lets an admin list every cohort on the course', async () => {
    const res = await request(app)
      .get(`/course/${courseId}/discussions`)
      .set('authorization', 'Bearer admin-token')
      .expect(200);

    // Admin sees all of cohort A's threads (and only A's — no one has
    // posted into B yet in this test).
    const bodies = (res.body as any[]).map(t => t.cohortId);
    expect(bodies.length).toBeGreaterThan(0);
    bodies.forEach(c => expect(c).toBe(cohortAId));
  });
});
