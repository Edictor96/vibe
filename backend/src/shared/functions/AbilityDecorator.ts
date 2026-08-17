import {getFromContainer, createParamDecorator} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {AuthenticatedUser, AuthenticatedUserEnrollements} from '../interfaces/models.js';
import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {EnrollmentService} from '#root/modules/users/services/EnrollmentService.js';
import {MongoAbility} from '@casl/ability';

const VALID_ENROLLMENT_ROLES = ['STUDENT', 'INSTRUCTOR', 'MANAGER', 'TA', 'STAFF'];
const UNRESTRICTED_COHORT_ROLES = ['MANAGER', 'TA'];

/**
 * `roles` on the raw user doc has been observed as either a scalar string or
 * an array; normalize defensively so an array-shaped value doesn't silently
 * fail a strict `=== 'admin'` check.
 */
function normalizeGlobalRole(roles: unknown): 'admin' | 'user' {
  const values = Array.isArray(roles) ? roles : [roles];
  return values.some(r => typeof r === 'string' && r.toLowerCase() === 'admin')
    ? 'admin'
    : 'user';
}

/**
 * Enrollment role values in the DB are inconsistently cased (and sometimes
 * null); normalize to the canonical uppercase enum so a stray `student` or
 * `instructor` doesn't fall through every ability switch with zero grants.
 */
function normalizeEnrollmentRole(
  role: unknown,
): AuthenticatedUserEnrollements['role'] | null {
  if (typeof role !== 'string') return null;
  const upper = role.toUpperCase();
  return VALID_ENROLLMENT_ROLES.includes(upper)
    ? (upper as AuthenticatedUserEnrollements['role'])
    : null;
}

/**
 * Build the canonical `cohortIds` list from a raw enrollment row.
 *
 * The DB schema uses two shapes:
 *   - STUDENT rows carry a singular `cohortId`.
 *   - INSTRUCTOR / STAFF rows carry an `assignedCohortIds` array.
 *
 * The discussion service reads `AuthenticatedUserEnrollements.cohortIds`,
 * which is the canonical form. `null` means "unrestricted on this course"
 * (MANAGER / TA / legacy rows without a cohort); `[]` means "no access";
 * a populated array means "scoped to exactly these cohorts".
 *
 * Raw rows that don't carry either field fall back to `null` for
 * unrestricted-cohort roles, `[]` for everyone else — the safe default
 * that matches "I have no idea, deny by default".
 */
function normalizeCohortIds(
  enrollment: Record<string, unknown>,
  role: AuthenticatedUserEnrollements['role'] | null,
): ObjectId[] | null {
  if (UNRESTRICTED_COHORT_ROLES.includes(String(role))) {
    return null;
  }
  if (Array.isArray(enrollment.assignedCohortIds)) {
    const ids = enrollment.assignedCohortIds
      .filter((id: unknown) => ObjectId.isValid(String(id)))
      .map((id: unknown) => new ObjectId(String(id)));
    return ids;
  }
  if (
    enrollment.cohortId !== undefined &&
    enrollment.cohortId !== null &&
    ObjectId.isValid(String(enrollment.cohortId))
  ) {
    return [new ObjectId(String(enrollment.cohortId))];
  }
  // No cohort recorded on the row AND the role isn't
  // unrestricted-cohort — fall through to empty. Deny by default.
  return [];
}

/**
 * Parameter decorator that builds and injects user abilities into the controller method
 * Usage: methodName(@Ability(getCourseAbility) ability: MongoAbility<any>)
 */
export function Ability(
  abilityBuilder: (
    user: AuthenticatedUser,
  ) => MongoAbility<any> | Promise<MongoAbility<any>>,
) {
  return createParamDecorator({
    value: async action => {
      // Get current user
      const authService = getFromContainer(FirebaseAuthService);
      const token = action.request.headers['authorization']?.split(' ')[1];

      if (!token) {
        throw new Error('No authorization token provided');
      }

      const user = await authService.getCurrentUserFromToken(token);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's enrollments
      const enrollmentService = getFromContainer(EnrollmentService);
      const enrollments = await enrollmentService.getAllEnrollments(
        user._id.toString(),
      );

      // Create authenticated user object. The Milestone C discussion
      // controller relies on `cohortIds` being populated for every
      // enrollment row, so we normalise the raw schema's two cohort
      // shapes (singular `cohortId` vs `assignedCohortIds`) into the
      // canonical `cohortIds` array on every row before we drop the
      // raw shape.
      const authenticatedUser: AuthenticatedUser = {
        userId: user._id.toString(),
        globalRole: normalizeGlobalRole(user.roles),
        enrollments: enrollments
          .map(enrollment => {
            const role = normalizeEnrollmentRole(enrollment.role);
            const cohortIds = normalizeCohortIds(
              enrollment as Record<string, unknown>,
              role,
            );
            return {
              courseId: enrollment.courseId.toString(),
              versionId: enrollment.courseVersionId.toString(),
              role,
              cohortIds,
            } as AuthenticatedUserEnrollements;
          })
          .filter(
            (e): e is AuthenticatedUserEnrollements => e.role !== null,
          ),
      };

      // Build and return the ability using the provided builder function.
      //
      // Both `user` (the raw auth user document) and `authenticatedUser`
      // (the normalised {userId, globalRole, enrollments} shape consumed by
      // the ability builder / controller logic) are returned. `user` is the
      // long-standing convention used across the codebase; `authenticatedUser`
      // is also returned so controllers that destructure it (notably the
      // Milestone A discussionBoard controller) get a defined value rather
      // than silently `undefined`.
      return {
        ability: await abilityBuilder(authenticatedUser),
        user: user,
        authenticatedUser: authenticatedUser,
      };
    },
  });
}
