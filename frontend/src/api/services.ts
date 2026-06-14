import apiClient from "./client";
import type {
  DashboardStatsResponse,
  MeetingsListResponse,
  MeetingDetailResponse,
  TasksListResponse,
  TaskDetailResponse,
  TaskStatusUpdateResponse,
  TeamMembersResponse,
  AdminReportResponse,
  TaskStatus,
  UploadMeetingResponse,
  SearchResponse,
} from "@/types";

// ─── Health ──────────────────────────────────────────────────────────────────

export const healthCheck = async (): Promise<unknown> => {
  const { data } = await apiClient.get("/");
  return data;
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const getDashboardStats = async (): Promise<DashboardStatsResponse> => {
  const { data } = await apiClient.get<DashboardStatsResponse>("/dashboard/stats");
  return data;
};

// ─── Meetings ────────────────────────────────────────────────────────────────

export const getMeetings = async (): Promise<MeetingsListResponse> => {
  const { data } = await apiClient.get<MeetingsListResponse>("/meetings");
  return data;
};

/** Returns the most recently processed meeting id for use as anchor for manual tasks. */
export const getLatestMeetingId = async (): Promise<string | null> => {
  const res = await getMeetings();
  const completed = res.meetings.filter(m => m.processing_status === "completed");
  return completed.length > 0 ? completed[0].id : (res.meetings[0]?.id ?? null);
};

export const getMeetingDetail = async (meetingId: string): Promise<MeetingDetailResponse> => {
  const { data } = await apiClient.get<MeetingDetailResponse>(`/meetings/${meetingId}`);
  return data;
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadMeeting = async (
  file: File,
  title?: string,
  teamId?: string,
  onUploadProgress?: (progress: number) => void
): Promise<UploadMeetingResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  if (teamId) formData.append("team_id", teamId);

  const { data } = await apiClient.post<UploadMeetingResponse>("/upload-meeting", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onUploadProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onUploadProgress(percent);
      }
    },
  });
  return data;
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const getTasks = async (): Promise<TasksListResponse> => {
  const { data } = await apiClient.get<TasksListResponse>("/tasks");
  return data;
};

export const getTaskDetail = async (taskId: string): Promise<TaskDetailResponse> => {
  const { data } = await apiClient.get<TaskDetailResponse>(`/tasks/${taskId}`);
  return data;
};

export const updateTaskStatus = async (
  taskId: string,
  status: TaskStatus
): Promise<TaskStatusUpdateResponse> => {
  const { data } = await apiClient.patch<TaskStatusUpdateResponse>(
    `/tasks/${taskId}/status`,
    { status }
  );
  return data;
};

export const deleteTask = async (taskId: string): Promise<void> => {
  await apiClient.delete(`/tasks/${taskId}`);
};

export const createTask = async (payload: {
  task: string;
  meeting_id: string;
  assigned_to?: string | null;
  deadline?: string | null;
}): Promise<TaskDetailResponse> => {
  const { data } = await apiClient.post<TaskDetailResponse>("/tasks", {
    task: payload.task,
    meeting_id: payload.meeting_id,
    assigned_to: payload.assigned_to ?? null,
    deadline: payload.deadline ?? null,
  });
  return data;
};

export const updateTaskAssignment = async (
  taskId: string,
  assignedTo: string | null,
  deadline: string | null
): Promise<TaskStatusUpdateResponse> => {
  const { data } = await apiClient.patch<TaskStatusUpdateResponse>(
    `/tasks/${taskId}/assignment`,
    {
      assigned_to: assignedTo ?? "",
      deadline: deadline ?? "",
    }
  );
  return data;
};

export const deleteMeeting = async (meetingId: string): Promise<void> => {
  await apiClient.delete(`/meetings/${meetingId}`);
};

export const getTeamMembers = async (teamId: string): Promise<TeamMembersResponse> => {
  const { data } = await apiClient.get<TeamMembersResponse>(`/teams/${teamId}/members`);
  return data;
};

export const getMyTeamRole = async (
  teamId: string,
  userId: string
): Promise<{ role: string | null }> => {
  const { data } = await apiClient.get<{ success: boolean; role: string | null }>(
    `/teams/${teamId}/my-role`,
    { params: { user_id: userId } }
  );
  return { role: data.role };
};

export const getAdminReport = async (
  teamId: string,
  userId: string
): Promise<AdminReportResponse> => {
  const { data } = await apiClient.get<AdminReportResponse>(
    `/admin/report/${teamId}`,
    { params: { user_id: userId } }
  );
  return data;
};

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchAll = async (query: string): Promise<SearchResponse> => {
  const { data } = await apiClient.get<SearchResponse>("/search", {
    params: { q: query },
  });
  return data;
};
