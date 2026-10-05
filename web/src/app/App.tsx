import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../components/RequireAuth";
import { AppShell } from "../components/shell/AppShell";
import { NotFound } from "../components/NotFound";
import { LoginPage } from "../features/auth/LoginPage";
import { EventCreatePage } from "../features/events/EventCreatePage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventShell } from "../features/events/EventShell";
import { EventsPage } from "../features/events/EventsPage";
import { GroupsPage } from "../features/groups/GroupsPage";
import { ParticipantDetailPage } from "../features/participants/ParticipantDetailPage";
import { ParticipantsPage } from "../features/participants/ParticipantsPage";
import { RegisterParticipantPage } from "../features/participants/RegisterParticipantPage";
import { AccessPage } from "../features/access/AccessPage";
import { AdminLayout } from "../features/admin/AdminLayout";
import { AdminRoute } from "../features/admin/AdminRoute";
import { AuditPage } from "../features/admin/AuditPage";
import { EventSettingsPage } from "../features/admin/EventSettingsPage";
import { EventsAdminPage } from "../features/admin/EventsAdminPage";
import { OverviewPage } from "../features/admin/OverviewPage";
import { UserDetailPage } from "../features/admin/UserDetailPage";
import { UsersPage } from "../features/admin/UsersPage";
import { AuthProvider } from "./AuthContext";

// Address structure: docs/design/ui-architecture.md. Addresses here are unchanged from earlier releases.
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<EventsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/new" element={<EventCreatePage />} />
            <Route path="events/:eventId" element={<EventShell />}>
              <Route index element={<EventDetailPage />} />
              <Route path="participants" element={<ParticipantsPage />} />
              <Route path="participants/new" element={<RegisterParticipantPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="access" element={<AccessPage />} />
            </Route>
            <Route path="event-participants/:participantId" element={<ParticipantDetailPage />} />
            <Route path="admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<OverviewPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:userId" element={<UserDetailPage />} />
              <Route path="events" element={<EventsAdminPage />} />
              <Route path="events/:eventId" element={<EventSettingsPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
