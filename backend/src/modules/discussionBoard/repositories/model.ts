import {ID} from '#root/shared/interfaces/models.js';

/**
 * DiscussionThread — a top-level conversation pinned to a single
 * (courseId, cohortId). References the existing User model by ID only;
 * user details are joined in the repository layer, never embedded.
 */
export interface IDiscussionThread {
  _id?: ID;
  courseId: ID;
  cohortId: ID;
  authorId: ID;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DiscussionReply — a single reply on a DiscussionThread. References the
 * existing User and DiscussionThread models by ID only.
 */
export interface IDiscussionReply {
  _id?: ID;
  threadId: ID;
  authorId: ID;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
