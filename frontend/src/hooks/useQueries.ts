import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDashboardStats,
  getMeetings,
  getMeetingDetail,
  getTasks,
  updateTaskStatus,
  updateTaskAssignment,
  createTask,
  deleteTask,
  deleteMeeting,
  getTeamMembers,
  getAdminReport,
  searchAll,
} from "@/api/services";
import { useAuth } from "@/context/AuthContext";
import type { TaskStatus } from "@/types";

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  tasks: ["tasks"] as const,
  teamMembers: (teamId: string) => ["team-members", teamId] as const,
  search: (q: string) => ["search", q] as const,
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: getDashboardStats,
    refetchInterval: 30_000,        // poll every 30s
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,     // refresh when user tabs back in
  });
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export function useMeetings() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: getMeetings,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 20, // 20s
  });
}

export function useMeetingDetail(meetingId: string) {
  return useQuery({
    queryKey: queryKeys.meeting(meetingId),
    queryFn: () => getMeetingDetail(meetingId),
    enabled: !!meetingId,
    refetchOnWindowFocus: true,
  });
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: getTasks,
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      updateTaskStatus(taskId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      task: string;
      meeting_id: string;
      assigned_to?: string | null;
      deadline?: string | null;
    }) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      // Admin report uses a separate key — invalidate so metrics update immediately
      queryClient.invalidateQueries({ queryKey: ["admin-report"] });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => deleteMeeting(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useUpdateTaskAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      assignedTo,
      deadline,
    }: {
      taskId: string;
      assignedTo: string | null;
      deadline: string | null;
    }) => updateTaskAssignment(taskId, assignedTo, deadline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      // Also invalidate the specific meeting detail so it refreshes inline
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: queryKeys.teamMembers(teamId),
    queryFn: () => getTeamMembers(teamId),
    enabled: !!teamId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Resolves the current user's role in a team via the backend.
 * Waits until auth loading is complete and a user session exists.
 * Re-runs automatically when teamId or user changes.
 */
export function useTeamRole(teamId: string) {
  const { user, loading: authLoading, getTeamRole } = useAuth();
  return useQuery({
    queryKey: ["team-role", teamId, user?.id ?? ""],
    queryFn: () => getTeamRole(teamId),
    // Don't run until auth has resolved AND we have a user AND a teamId
    enabled: !authLoading && !!user && !!teamId,
    staleTime: 1000 * 60 * 5,   // 5 min
    retry: 1,
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function useSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => searchAll(query),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 30,
  });
}

// ─── Admin Report ─────────────────────────────────────────────────────────────

export function useAdminReport(teamId: string) {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["admin-report", teamId, user?.id ?? ""],
    queryFn: () => getAdminReport(teamId, user!.id),
    enabled: !authLoading && !!user && !!teamId,
    staleTime: 1000 * 60,     // 1 min
    refetchInterval: 60_000,  // auto-refresh every 60s
    retry: 1,
  });
}
