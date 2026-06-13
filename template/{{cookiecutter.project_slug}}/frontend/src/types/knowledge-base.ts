export type KBScope = "personal" | "org" | "app";
export type RequirementRole = "product" | "developer";

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
  created_at: string | null;
  completed_at: string | null;
}

export interface RequirementDocumentVersionList {
  items: RequirementDocumentVersionItem[];
  total: number;
}

export interface RequirementDocumentDiffResponse {
  filename: string;
  from_document_id: string;
  to_document_id: string;
  from_version: number;
  to_version: number;
  summary: string;
  diff_lines: string[];
}
