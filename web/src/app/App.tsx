import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../components/RequireAuth";
import { Layout } from "../components/Layout";
import { LoginPage } from "../features/auth/LoginPage";
import { EventCreatePage } from "../features/events/EventCreatePage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsPage } from "../features/events/EventsPage";
import { GroupsPage } from "../features/groups/GroupsPage";
import { ParticipantDetailPage } from "../features/participants/ParticipantDetailPage";
import { ParticipantsPage } from "../features/participants/ParticipantsPage";
import { RegisterParticipantPage } from "../features/participants/RegisterParticipantPage";
import { AuthProvider } from "./AuthContext";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<EventsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/new" element={<EventCreatePage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
            <Route path="events/:eventId/groups" element={<GroupsPage />} />
            <Route path="events/:eventId/participants" element={<ParticipantsPage />} />
            <Route path="events/:eventId/participants/new" element={<RegisterParticipantPage />} />
            <Route path="event-participants/:participantId" element={<ParticipantDetailPage />} />
          </Route>
          <Route path="*" element={<p className="status">Page not found.</p>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
