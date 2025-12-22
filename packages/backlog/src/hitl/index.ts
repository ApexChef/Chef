/**
 * HITL Module - Human-in-the-Loop Session Management
 *
 * Provides the core logic for managing HITL pipeline sessions,
 * which can be used by any interface (CLI, Web, API).
 */

export {
  HITLSession,
  listThreads,
  type HITLSessionOptions,
  type SessionStatus,
  type PendingApprovalInfo,
  type PendingContextInfo,
} from "./session.js";
