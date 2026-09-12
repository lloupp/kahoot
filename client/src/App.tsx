import { Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { QuizEditor } from "./pages/QuizEditor";
import { HostSession } from "./pages/HostSession";
import { StudentJoin } from "./pages/StudentJoin";
import { StudentSession } from "./pages/StudentSession";
import { History } from "./pages/History";
import { SessionReport } from "./pages/SessionReport";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <div className="min-h-full">
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/join" element={<StudentJoin />} />
          <Route path="/play/:pin" element={<StudentSession />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/new"
            element={
              <ProtectedRoute>
                <QuizEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes/:id/edit"
            element={
              <ProtectedRoute>
                <QuizEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/host/:pin"
            element={
              <ProtectedRoute>
                <HostSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history/:id"
            element={
              <ProtectedRoute>
                <SessionReport />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
