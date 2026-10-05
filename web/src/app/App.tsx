import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../components/RequireAuth";
import { Layout } from "../components/Layout";
import { LoginPage } from "../features/auth/LoginPage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsPage } from "../features/events/EventsPage";
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
            <Route path="events/:eventId" element={<EventDetailPage />} />
          </Route>
          <Route path="*" element={<p className="status">Page not found.</p>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
