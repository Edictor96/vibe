import {ClientSession} from 'mongodb';
import {IDiscussionReply} from '../repositories/model.js';

export interface IDiscussionReplyRepository {
  /**
   * List all replies for a thread, oldest-first (chronological).
   */
  listByThread(
    threadId: string,
    session?: ClientSession,
  ): Promise<IDiscussionReply[]>;

  /**
   * Insert a new reply. Returns the inserted document.
   */
  create(
    reply: IDiscussionReply,
    session?: ClientSession,
  ): Promise<IDiscussionReply>;

  /**
   * Hard-delete a reply. Returns true when a reply was deleted.
   */
  deleteById(
    replyId: string,
    session?: ClientSession,
  ): Promise<boolean>;

  /**
   * Delete every reply on a thread — used by the thread-delete path to keep
   * the collection tidy. Returns the count of replies deleted.
   */
  deleteByThread(
    threadId: string,
    session?: ClientSession,
  ): Promise<number>;
}
