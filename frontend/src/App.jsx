import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import PredictiveMaintenanceSystem from "./pages/PredictiveMaintenanceSystem.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* default route */}
        <Route path="/" element={<Navigate to="/monitor" replace />} />

        {/* public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* protected */}
        <Route
          path="/monitor"
          element={
            <RequireAuth>
              <PredictiveMaintenanceSystem />
            </RequireAuth>
          }
        />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
