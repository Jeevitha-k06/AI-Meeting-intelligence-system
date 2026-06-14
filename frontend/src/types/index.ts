// ─── Meeting ────────────────────────────────────────────────────────────────

export interface MeetingListItem {
  id: string;
  title: string;
  summary: string | null;
  processing_status: string;
  uploaded_file_name: string | null;
  created_at: string;
}

export interface MeetingsListResponse {
  success: boolean;
  count: number;
  meetings: MeetingListItem[];
}

export interface MeetingDetail {
  id: string;
  team_id: string;
  title: string;
  summary: string | null;
  processing_status: string;
  uploaded_file_name: string | null;
  transcript_text: string | null;
  created_at: string;
}

export interface ActionItemRecord {
  id: string;
  meeting_id: string;
  task: string;
  status: string;
  assigned_to: string | null;     // UUID of assigned user
  confidence: number | null;
  deadline: string | null;        // ISO 8601 UTC string
  created_at: string;
}

export interface DecisionRecord {
  id: string;
  meeting_id: string;
  decision_text: string;
  category: string | null;
  confidence: number | null;
  created_at: string;
}

export interface RiskRecord {
  id: string;
  meeting_id: string;
  risk_text: string;
  severity: string;
  created_at: string;
}

export interface TopicClusterRecord {
  id: string;
  meeting_id: string;
  topic_name: string;
  coherence: number | null;
  keywords: string[];
  created_at: string;
}

export interface MeetingDetailResponse {
  success: boolean;
  meeting: MeetingDetail;
  action_items: ActionItemRecord[];
  decisions: DecisionRecord[];
  risks: RiskRecord[];
  topic_clusters: TopicClusterRecord[];
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface TaskItem {
  id: string;
  meeting_id: string;
  task: string;
  status: TaskStatus;
  assigned_to: string | null;     // UUID of assigned user
  confidence: number | null;
  deadline: string | null;        // ISO 8601 UTC string
  created_at: string;
}

export interface TasksListResponse {
  success: boolean;
  count: number;
  tasks: TaskItem[];
}

export interface TaskDetailResponse {
  success: boolean;
  task: TaskItem;
}

export interface TaskStatusUpdateResponse {
  success: boolean;
  message: string;
  task: TaskItem;
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

export interface TeamMembersResponse {
  success: boolean;
  members: TeamMember[];
}

// ─── Team Role (from team_members table) ─────────────────────────────────────

export type TeamRole = "owner" | "admin" | "member";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  total_meetings: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  total_decisions: number;
  total_risks: number;
}

export interface DashboardStatsResponse {
  success: boolean;
  stats: DashboardStats;
  recent_meetings: MeetingListItem[];
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadMeetingResponse {
  success: boolean;
  meeting_id: string;
  summary: string;
  action_items_count: number;
  decisions_count: number;
  risks_count: number;
  topic_clusters_count: number;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export interface AdminOverview {
  total_members: number;
  total_meetings: number;
  total_tasks: number;
  completed_tasks: number;
  open_tasks: number;
  overdue_tasks: number;
  cancelled_tasks: number;
  completion_rate: number;
}

export interface MemberPerf {
  user_id: string;
  display_name: string;
  role: string;
  assigned: number;
  completed: number;
  open: number;
  overdue: number;
  completion_rate: number;
}

export interface DeadlineTask {
  id: string;
  task: string;
  status: string;
  deadline: string | null;
  assigned_to: string | null;
  assigned_name: string;
  meeting_id: string | null;
  bucket: "overdue" | "today" | "week";
}

export interface AdminRiskSummary {
  counts: { critical: number; high: number; medium: number; low: number };
  recent: Array<{
    id: string;
    meeting_id: string;
    meeting_title: string;
    risk_text: string;
    severity: string;
    created_at: string;
  }>;
}

export interface AdminDecision {
  id: string;
  meeting_id: string;
  meeting_title: string;
  decision_text: string;
  category: string | null;
  created_at: string;
}

export interface AdminMember {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface AdminReportResponse {
  success: boolean;
  overview: AdminOverview;
  member_perf: MemberPerf[];
  deadline_tasks: DeadlineTask[];
  risk_summary: AdminRiskSummary;
  decisions: AdminDecision[];
  members: AdminMember[];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchMeeting {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
}

export interface SearchActionItem {
  id: string;
  task: string;
  status: string;
  meeting_id: string;
  created_at: string;
}

export interface SearchDecision {
  id: string;
  decision_text: string;
  category: string | null;
  meeting_id: string;
  created_at: string;
}

export interface SearchRisk {
  id: string;
  risk_text: string;
  severity: string;
  meeting_id: string;
  created_at: string;
}

export interface SearchResponse {
  query: string;
  results: {
    meetings: SearchMeeting[];
    action_items: SearchActionItem[];
    decisions: SearchDecision[];
    risks: SearchRisk[];
  };
}
