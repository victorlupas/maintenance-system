import "./App.css";
import PredictiveMaintenanceSystem from "./pages/PredictiveMaintenanceSystem.jsx";
import { Routes, Route } from "react-router-dom";

function App() {
  return (
    <Routes>
      <Route path="/" element={<PredictiveMaintenanceSystem />} />
      <Route path="/monitor" element={<PredictiveMaintenanceSystem />} />
    </Routes>
  );
}

export default App;
