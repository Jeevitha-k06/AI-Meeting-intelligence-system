/**
 * DashboardPage — role-aware entry point.
 *
 * owner / admin  →  AdminDashboardPage
 * member         →  MemberDashboardPage (existing dashboard)
 *
 * While the role is being resolved a spinner is shown so there is
 * no flash of the wrong dashboard.
 */
import { useTeamRole } from "@/hooks/useQueries";
import { LoadingSpinner } from "@/components/shared/LoadingState";
import AdminDashboardPage from "./AdminDashboardPage";
import MemberDashboardPage from "./MemberDashboardPage";

const DEFAULT_TEAM_ID = "fafe5280-5124-4768-80b7-aa453687b51a";

export default function DashboardPage() {
  const { data: role, isLoading } = useTeamRole(DEFAULT_TEAM_ID);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (role === "owner" || role === "admin") {
    return <AdminDashboardPage />;
  }

  return <MemberDashboardPage />;
}
