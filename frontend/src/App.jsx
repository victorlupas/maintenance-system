import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import PredictiveMaintenanceSystem from "./pages/PredictiveMaintenanceSystem.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <PredictiveMaintenanceSystem />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
