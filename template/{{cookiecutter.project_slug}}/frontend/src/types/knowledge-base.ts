export type KBScope = "personal" | "org" | "app";
export type RequirementRole = "product" | "developer" | "tester";

export interface KnowledgeBase {
  id: string;
  organization_id: string | null;
  owner_user_id: string | null;
  name: string;
  project_name: string | null;
  description: string | null;
  scope: KBScope;
  collection_name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface KnowledgeBaseList {
  items: KnowledgeBase[];
  total: number;
}

export interface CreateKnowledgeBaseInput {
  name: string;
  project_name?: string | null;
  description?: string;
  scope: KBScope;
}

/** A single document tracked in a KB's underlying vector collection. */
export interface KBDocument {
  id: string;
  collection_name: string;
  filename: string;
  filetype: string | null;
  filesize: number | null;
  status: "pending" | "processing" | "completed" | "failed" | string;
  error_message: string | null;
  vector_document_id: string | null;
  chunk_count: number;
  has_file: boolean;
  has_markdown_content: boolean;
  version: number;
  is_latest: boolean;
  previous_version_id: string | null;
  modified_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface KBDocumentList {
  items: KBDocument[];
  total: number;
}

export interface RequirementNotificationEvent {
  event_type: string;
  kb_id: string;
  document_id: string;
  filename: string;
  message: string;
  version: number | null;
  status: string | null;
  diff_summary: string | null;
}

export interface RequirementNotificationItem extends RequirementNotificationEvent {
  id: string;
  actor_user_id: string;
  read: boolean;
  created_at: string | null;
  read_at: string | null;
}

export interface RequirementNotificationList {
  items: RequirementNotificationItem[];
  total: number;
  unread_count: number;
}

export interface RequirementIntakeInput {
  description: string;
  title?: string | null;
  filename?: string | null;
}

export interface RequirementIntakeResponse {
  document_id: string;
  filename: string;
  markdown_content: string;
  clarification_questions: string[];
  notification_event: RequirementNotificationEvent | null;
  ai_used: boolean;
  ai_model: string | null;
  ai_error: string | null;
}

export interface RequirementClarificationAnswer {
  question: string;
  answer: string;
}

export interface RequirementClarificationInput {
  answers: RequirementClarificationAnswer[];
  apply?: boolean;
}

export interface RequirementClarificationRound {
  id: string;
  round: number;
  answers: RequirementClarificationAnswer[];
  actor_user_id: string;
  created_at: string | null;
}

export interface RequirementClarificationSession {
  session_id: string | null;
  kb_id: string;
  document_id: string;
  filename: string;
  state: "drafting" | "clarifying" | "awaiting_confirmation" | "ingested" | string;
  questions: string[];
  rounds: RequirementClarificationRound[];
  latest_round: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface RequirementClarificationResponse {
  session: RequirementClarificationSession;
  change: RequirementChangeResponse | null;
}

export interface RequirementQuerySource {
  document_id: string;
  vector_document_id: string | null;
  filename: string;
  label: string;
  score: number;
  page_num: number | null;
  chunk_num: number | null;
  excerpt: string;
}

export interface RequirementQueryResponse {
  answer: string;
  sources: RequirementQuerySource[];
  is_grounded: boolean;
  grounding_status: "grounded" | "partial" | "low_confidence" | "no_source";
  confidence: "high" | "medium" | "low";
  facts: string[];
  inferences: string[];
  follow_up_questions: string[];
  test_focus: string[];
  retrieval_debug: Record<string, unknown> | null;
  message: string | null;
  ai_used: boolean;
  ai_model: string | null;
  ai_error: string | null;
}

export interface RequirementBreakdownItem {
  title: string;
  summary: string;
  source_label: string;
  excerpt: string;
  test_focus: string[];
}

export interface RequirementBreakdownResponse {
  document_id: string;
  filename: string;
  answer: string;
  items: RequirementBreakdownItem[];
  ai_used: boolean;
  ai_model: string | null;
  ai_error: string | null;
}

export interface RequirementChangeInput {
  instruction: string;
  apply?: boolean;
}

export interface RequirementRollbackInput {
  reason?: string | null;
}

export interface RequirementChangeResponse {
  action: string;
  message: string;
  previous_document_id: string | null;
  document_id: string | null;
  filename: string | null;
  diff_summary: string | null;
  markdown_preview: string | null;
  notification_event: RequirementNotificationEvent | null;
  ai_used: boolean;
  ai_model: string | null;
  ai_error: string | null;
}

export interface RequirementDocumentVersionItem {
  document_id: string;
  filename: string;
  version: number;
  status: string;
  is_latest: boolean;
  previous_version_id: string | null;
  modified_by: string | null;
  has_markdown_content: boolean;
  review_note: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RequirementDocumentVersionList {
  items: RequirementDocumentVersionItem[];
  total: number;
}

export interface RequirementDocumentDiffLine {
  kind: "added" | "removed" | "context" | string;
  content: string;
  old_line_number: number | null;
  new_line_number: number | null;
}

export interface RequirementDocumentDiffHunk {
  header: string;
  old_start: number | null;
  old_count: number | null;
  new_start: number | null;
  new_count: number | null;
  lines: RequirementDocumentDiffLine[];
}

export interface RequirementDocumentDiffResponse {
  filename: string;
  from_document_id: string;
  to_document_id: string;
  from_version: number;
  to_version: number;
  summary: string;
  diff_lines: string[];
  structured_changes: RequirementDocumentDiffHunk[];
}

export interface RequirementAuditLogItem {
  id: string;
  action: string;
  actor_user_id: string;
  organization_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
}

export interface RequirementAuditLogList {
  items: RequirementAuditLogItem[];
  total: number;
}

export interface RequirementDraftCommentInput {
  body: string;
}

export interface RequirementDraftCommentItem {
  id: string;
  document_id: string;
  author_user_id: string;
  role: RequirementRole;
  body: string;
  created_at: string | null;
}

export interface RequirementDraftCommentList {
  items: RequirementDraftCommentItem[];
  total: number;
}
