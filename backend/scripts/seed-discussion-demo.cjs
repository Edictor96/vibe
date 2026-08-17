/**
 * Milestone E demo seeding script — populates the local MongoDB and the
 * local Firebase Auth emulator with deterministic accounts for the
 * Discussion Board end-to-end walkthrough.
 *
 * See backend/scripts/seed-discussion-demo.ts (the previous revision)
 * for the full design notes; this is the CommonJS twin kept under
 * a `.cjs` so it runs cleanly through `node` without needing a TS
 * transpile step. Both files share the same Mongo + Firebase schema.
 *
 *   node scripts/seed-discussion-demo.cjs
 */

"use strict";

require("dotenv").config();

const admin = require("firebase-admin");
const { MongoClient, ObjectId } = require("mongodb");

const DB_URL = process.env.DB_URL || "mongodb://127.0.0.1:27018/vibe";
const DB_NAME = process.env.DB_NAME || "vibe";
const FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-test";

const PERSONAS = [
  {
    key: "teacher",
    email: "teacher.discussion@demo.test",
    password: "DemoTeacherPass123!",
    firstName: "Demo",
    lastName: "Teacher",
    role: "INSTRUCTOR",
    firebaseUid: "demo-teacher-uid-0001",
  },
  {
    key: "studentA",
    email: "studenta.discussion@demo.test",
    password: "DemoStudentPass123!",
    firstName: "Demo",
    lastName: "StudentA",
    role: "STUDENT",
    firebaseUid: "demo-studentA-uid-0001",
  },
  {
    key: "studentB",
    email: "studentb.discussion@demo.test",
    password: "DemoStudentPass123!",
    firstName: "Demo",
    lastName: "StudentB",
    role: "STUDENT",
    firebaseUid: "demo-studentB-uid-0001",
  },
];

const COURSE_NAME = "Milestone E Discussion Demo Course";
const DEMO_VERSION = "1.0";
const COHORT_A_NAME = "Cohort A";
const COHORT_B_NAME = "Cohort B";

const TEACHER = PERSONAS.find((p) => p.key === "teacher");
const STUDENT_A = PERSONAS.find((p) => p.key === "studentA");
const STUDENT_B = PERSONAS.find((p) => p.key === "studentB");

function now() {
  return new Date();
}

async function upsertAuthUser(auth, persona) {
  try {
    await auth.getUser(persona.firebaseUid);
    // Already exists — leave it (UID is the join key on the Mongo side).
    return;
  } catch (e) {
    if (e && e.code !== "auth/user-not-found") throw e;
  }
  await auth.createUser({
    uid: persona.firebaseUid,
    email: persona.email,
    password: persona.password,
    displayName: `${persona.firstName} ${persona.lastName}`.trim(),
    emailVerified: true,
  });
}

async function main() {
  // The Firebase Admin SDK auto-detects FIREBASE_AUTH_EMULATOR_HOST and
  // routes there; we still need a fake projectId for initialisation
  // because the Admin SDK refuses to initialise without one.
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const auth = admin.auth();

  console.log(
    `→ Connecting to Firebase Auth emulator at ${FIREBASE_AUTH_EMULATOR_HOST} (project=${PROJECT_ID})`,
  );

  for (const persona of PERSONAS) {
    await upsertAuthUser(auth, persona);
    console.log(`  ✓ Auth user: ${persona.email} (uid=${persona.firebaseUid})`);
  }

  console.log(`→ Connecting to MongoDB at ${DB_URL}`);
  const mongo = new MongoClient(DB_URL);
  await mongo.connect();
  const db = mongo.db(DB_NAME);

  try {
    const usersCol = db.collection("users");
    // The live backend uses singular collection names for these:
    //   newCourse, newCourseVersion, enrollment.
    // Pluralising them (as the test suites do with vitest-mongodb)
    // would silently miss every lookup, which is why a
    // correctly-seeded enrollment row was invisible to AbilityDecorator.
    const coursesCol = db.collection("newCourse");
    const versionsCol = db.collection("newCourseVersion");
    const cohortsCol = db.collection("cohorts");
    const enrollmentsCol = db.collection("enrollment");
    const threadsCol = db.collection("discussion_threads");
    const repliesCol = db.collection("discussion_replies");

    // ── 1. Tear down any previous instance of the demo course so the
    //    seed is idempotent across re-runs. ──────────────────────────
    const prevCourse = await coursesCol.findOne({ name: COURSE_NAME });
    if (prevCourse) {
      const prevId = prevCourse._id;
      const prevVersions = await versionsCol
        .find({ courseId: new ObjectId(prevId) })
        .toArray();
      const prevVersionIds = prevVersions.map((v) => v._id);
      await threadsCol.deleteMany({ courseId: prevId });
      await enrollmentsCol.deleteMany({ courseId: prevId });
      await cohortsCol.deleteMany({
        courseVersionId: { $in: prevVersionIds },
      });
      await versionsCol.deleteMany({ courseId: prevId });
      await coursesCol.deleteOne({ _id: prevId });
      console.log(
        `  ✓ Removed previous demo course (id=${prevId.toHexString()}, versions=${prevVersionIds.length})`,
      );
    }

    // ── 2. Wipe any leftover demo-only users (matched by demo.test email).
    //    Other users in the DB are kept untouched. ───────────────────
    for (const persona of PERSONAS) {
      const res = await usersCol.deleteMany({ email: persona.email });
      if (res.deletedCount > 0) {
        console.log(`  ✓ Cleared old mongo user for ${persona.email}`);
      }
    }

    // ── 3. Insert the three personas.
    //    We mimic exactly the shape signup would produce (so the
    //    AbilityDecorator's role-normalisation step accepts them). ──
    const teacherId = new ObjectId();
    const studentAId = new ObjectId();
    const studentBId = new ObjectId();
    await usersCol.insertMany([
      {
        _id: teacherId,
        firebaseUID: TEACHER.firebaseUid,
        email: TEACHER.email,
        firstName: TEACHER.firstName,
        lastName: TEACHER.lastName,
        roles: TEACHER.role.toLowerCase(),
        role: TEACHER.role,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: studentAId,
        firebaseUID: STUDENT_A.firebaseUid,
        email: STUDENT_A.email,
        firstName: STUDENT_A.firstName,
        lastName: STUDENT_A.lastName,
        roles: STUDENT_A.role.toLowerCase(),
        role: STUDENT_A.role,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: studentBId,
        firebaseUID: STUDENT_B.firebaseUid,
        email: STUDENT_B.email,
        firstName: STUDENT_B.firstName,
        lastName: STUDENT_B.lastName,
        roles: STUDENT_B.role.toLowerCase(),
        role: STUDENT_B.role,
        createdAt: now(),
        updatedAt: now(),
      },
    ]);
    console.log("  ✓ Inserted 3 users");

    // ── 4. Course + version + cohorts (2 cohorts).
    //    The course collection uses an `instructors` array on the
    //    existing code-path, so the teacher goes in there. Both
    //    cohorts live on the version's cohort list; both enrollments
    //    reference their own cohort id separately so the discussion
    //    Ability filter is per-cohort. ───────────────────────────────
    const courseId = new ObjectId();
    await coursesCol.insertOne({
      _id: courseId,
      name: COURSE_NAME,
      description:
        "Seed course for the Milestone E Cohort Discussion Board demo.",
      versions: [],
      instructors: [teacherId],
      createdBy: teacherId,
      createdAt: now(),
      updatedAt: now(),
    });

    const versionId = new ObjectId();
    const cohortAId = new ObjectId();
    const cohortBId = new ObjectId();

    await versionsCol.insertOne({
      _id: versionId,
      courseId,
      version: DEMO_VERSION,
      description: "Demo version",
      versionStatus: "active",
      modules: [],
      cohorts: [COHORT_A_NAME, COHORT_B_NAME],
      createdAt: now(),
      updatedAt: now(),
    });

    await cohortsCol.insertMany([
      {
        _id: cohortAId,
        courseId,
        courseVersionId: versionId,
        name: COHORT_A_NAME,
        studentCount: 0,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: cohortBId,
        courseId,
        courseVersionId: versionId,
        name: COHORT_B_NAME,
        studentCount: 0,
        createdAt: now(),
        updatedAt: now(),
      },
    ]);

    await coursesCol.updateOne(
      { _id: courseId },
      {
        $set: {
          versions: [versionId],
          cohorts: [cohortAId, cohortBId],
          updatedAt: now(),
        },
      },
    );

    console.log(
      `  ✓ Created course ${courseId.toHexString()} / version ${versionId.toHexString()}`,
    );
    console.log(
      `    cohortA=${cohortAId.toHexString()}, cohortB=${cohortBId.toHexString()}`,
    );

    // ── 5. Enrollments. The discussion board's ability layer
    //    (EnrollmentService.getAllEnrollments) reads
    //      enrollment.role, enrollment.status, enrollment.cohortId,
    //      enrollment.courseId, enrollment.courseVersionId
    //    so we populate those fields exactly. ────────────────────────
    await enrollmentsCol.insertMany([
      {
        _id: new ObjectId(),
        userId: studentAId,
        courseId,
        courseVersionId: versionId,
        role: "STUDENT",
        status: "ACTIVE",
        cohortId: cohortAId,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: new ObjectId(),
        userId: studentBId,
        courseId,
        courseVersionId: versionId,
        role: "STUDENT",
        status: "ACTIVE",
        cohortId: cohortBId,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: new ObjectId(),
        userId: teacherId,
        courseId,
        courseVersionId: versionId,
        role: "INSTRUCTOR",
        status: "ACTIVE",
        cohortId: cohortAId,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        _id: new ObjectId(),
        userId: teacherId,
        courseId,
        courseVersionId: versionId,
        role: "INSTRUCTOR",
        status: "ACTIVE",
        cohortId: cohortBId,
        createdAt: now(),
        updatedAt: now(),
      },
    ]);
    console.log("  ✓ Inserted 4 enrollments (2 students + 2 teacher-in-cohort)");

    // ── 6. Pre-existing thread in cohort A authored by the teacher,
    //    pinned, with one teacher reply. Student A sees it in step
    //    10; student B never sees it (cross-cohort isolation). ─────
    const createdThreadId = new ObjectId();
    await threadsCol.insertOne({
      _id: createdThreadId,
      courseId,
      cohortId: cohortAId,
      authorId: teacherId,
      authorFirebaseUid: TEACHER.firebaseUid,
      title: "Welcome to the Discussion Board (pre-existing thread)",
      body:
        "This thread was seeded by the Milestone E walkthrough so " +
        "the cohort-isolation cross-checks have something to bite on. " +
        "Cohort A students should see this; cohort B students should not.",
      pinned: true,
      createdAt: now(),
      updatedAt: now(),
    });

    await repliesCol.insertOne({
      _id: new ObjectId(),
      threadId: createdThreadId,
      authorId: teacherId,
      authorFirebaseUid: TEACHER.firebaseUid,
      body:
        "First reply in the demo thread — students should be able to reply on top of this without seeing cohort B traffic.",
      createdAt: now(),
      updatedAt: now(),
    });

    console.log(
      `  ✓ Seeded thread ${createdThreadId.toHexString()} (pinned, 1 reply)`,
    );

    console.log("\nDone. Demo personas (email / password):");
    for (const p of PERSONAS) {
      console.log(`  • ${p.email}  /  ${p.password}  (${p.role})`);
    }
    console.log(
      `\nCourse URL slug (use in the UI): /teacher/courses/${courseId.toHexString()}`,
    );
    console.log(
      `Student open URL:        /student/courses/${courseId.toHexString()}/discussions`,
    );
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
