// frontend/src/pages/PredictiveMaintenanceSystem.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle,
  Activity,
  TrendingUp,
  Calendar,
  Download,
  LogOut,
  Plus,      // From Script 1
  X,         // From Script 1
  Trash2,    // From Script 1
} from "lucide-react";
import { api } from "../apiClient";
import { useNavigate } from "react-router-dom";

const PredictiveMaintenanceSystem = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  // Data from backend
  const [sensorData, setSensorData] = useState([]);
  const [equipment, setEquipment] = useState([]);

  // Derived lists (computed client-side)
  const [anomalies, setAnomalies] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  // --- STATE FROM SCRIPT 1 (ADD MACHINE MODAL) ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [machineTypes, setMachineTypes] = useState([]);
  const [newMachineName, setNewMachineName] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  // ----------------------------------------------

  // --- STATE FROM SCRIPT 2 (ML PREDICTIONS) ---
  const [mlPredictions, setMlPredictions] = useState({});
  // --------------------------------------------

  // Auth UI
  const [me, setMe] = useState(null);
  const navigate = useNavigate();

  // thresholds kept for Settings UI
  const [thresholds, setThresholds] = useState({
    temperature: { warning: 75, critical: 85 },
    vibration: { warning: 3.5, critical: 4.5 },
    pressure: { warning: 95, critical: 110 },
  });

  // ----------------------------
  // Auth helpers
  // ----------------------------
  const fetchMe = async () => {
    try {
      const res = await api.get("/api/auth/me/");
      setMe(res.data);
    } catch {
      setMe(null);
    }
  };

  const onLogout = async () => {
  try {
    const refresh = localStorage.getItem("refresh");
    if (refresh) {
      await api.post("/api/auth/logout/", { refresh });
    }
  } catch (err) {
    console.error("Logout error:", err);
  } finally {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    navigate("/login");
  }
  };

  // ----------------------------
  // Backend data fetch (Merged Logic)
  // ----------------------------
  const fetchSyntheticData = async () => {
    setIsProcessing(true);
    setLoadErr("");
    try {
      const res = await api.get("/api/synthetic/");
      const eq = res.data.equipment || [];
      const rows = res.data.sensorData || [];

      setEquipment(eq);
      setSensorData(rows);

      // recompute derived outputs client-side
      performAnomalyDetection(rows, eq);
      generatePredictions(rows, eq);
    } catch (e) {
      console.error(e);
      setLoadErr(
        "Failed to load data. Make sure you are logged in and backend is running."
      );
      setEquipment([]);
      setSensorData([]);
      setAnomalies([]);
      setPredictions([]);
      setAlerts([]);
    } finally {
      setIsProcessing(false);
    }
  };
  const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  // ----------------------------
  // ML Prediction Fetchers (From Script 2)
  // ----------------------------
  const fetchAirCompressorPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/air-compressor/");
      setMlPredictions((prev) => ({
        ...prev,
        [res.data.equipmentId]: res.data,
      }));
    } catch (e) {
      console.error("Failed to load air compressor ML prediction", e);
    }
  };

  const fetchMillingPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/milling/");
      setMlPredictions((prev) => ({
        ...prev,
        [res.data.equipmentId]: res.data,
      }));
    } catch (e) {
      console.error("Failed to load milling ML prediction", e);
    }
  };

  const fetchTurbofanPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/turbofan/");
      setMlPredictions((prev) => ({
        ...prev,
        [res.data.equipmentId]: res.data,
      }));
    } catch (e) {
      console.error("Failed to load turbofan ML prediction", e);
    }
  };

  // ----------------------------
  // ADD MACHINE Functions (From Script 1)
  // ----------------------------
  const openAddModal = async () => {
    setIsAddModalOpen(true);
    // Fetch available types from DB
    try {
      const res = await api.get("/api/machine-types/");
      setMachineTypes(res.data);
      if (res.data.length > 0) {
        setSelectedTypeId(res.data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch machine types", error);
      alert("Could not load machine types from database.");
    }
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setNewMachineName("");
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!newMachineName || !selectedTypeId) return;

    setIsAdding(true);
    try {
      // 1. Save to DB
      await api.post("/api/machines/add/", {
        name: newMachineName,
        type_id: selectedTypeId,
      });

      // 2. Refresh the dashboard
      await fetchSyntheticData();
      // Try to fetch ML predictions again in case the new machine matches a type
      fetchAirCompressorPrediction();
      fetchMillingPrediction();
      fetchTurbofanPrediction();

      // 3. Close modal
      closeAddModal();
    } catch (error) {
      console.error("Failed to add machine", error);
      alert("Failed to add machine. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  // ----------------------------
  // DELETE MACHINE Function (From Script 1)
  // ----------------------------
  const handleDeleteMachine = async (machineId) => {
    if (!window.confirm("Are you sure you want to remove this machine?")) return;

    try {
      await api.delete(`/api/machines/${machineId}/delete/`);
      // Refresh data to update the UI
      await fetchSyntheticData();
    } catch (error) {
      console.error("Failed to delete machine", error);
      alert("Failed to remove machine.");
    }
  };

  // ----------------------------
  // Helpers
  // ----------------------------
  const calculateTrend = (values) => {
    if (!values || values.length < 2) return 0;
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  };

  // ----------------------------
  // Alerts
  // ----------------------------
  const generateAlerts = (detectedAnomalies) => {
    const newAlerts = detectedAnomalies
      .filter((a) => a.severity === "critical" || a.severity === "warning")
      .slice(-10)
      .map((a, idx) => ({
        id: `alert-${Date.now()}-${idx}`,
        timestamp: a.timestamp,
        equipmentName: a.equipmentName,
        severity: a.severity,
        message: a.explanation,
        acknowledged: false,
      }));

    setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20));
  };

  const acknowledgeAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
  };

  // ----------------------------
  // Anomaly Detection
  // ----------------------------
  const zscore = (x, mean, std) => {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(mean) ||
      !Number.isFinite(std) ||
      std === 0
    )
      return 0;
    return (x - mean) / std;
  };

  const computeStats = (values) => {
    const arr = values.filter((v) => Number.isFinite(v));
    if (arr.length < 5) return { mean: 0, std: 1 };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const varSum = arr.reduce((s, v) => s + (v - mean) ** 2, 0);
    const std = Math.sqrt(varSum / (arr.length - 1 || 1)) || 1;
    return { mean, std };
  };

  const performAnomalyDetection = (data, equipmentProfiles) => {
    const detectedAnomalies = [];
    const WARN_Z = 2.5; // lower -> more anomalies
    const CRIT_Z = 3.2;

    equipmentProfiles.forEach((eq) => {
      const eqDataAll = data.filter((d) => d.equipmentId === eq.id);
      if (eqDataAll.length < 10) return;

      // Baseline: first 70% of points, Recent: last 24 points
      const baseline = eqDataAll.slice(0, Math.floor(eqDataAll.length * 0.7));
      const recent = eqDataAll.slice(-24);

      const temps = baseline.map((r) => Number(r.temperature));
      const vibs = baseline.map((r) => Number(r.vibration));
      const press = baseline.map((r) => Number(r.pressure));

      const tStats = computeStats(temps);
      const vStats = computeStats(vibs);
      const pStats = computeStats(press);

      recent.forEach((reading) => {
        const t = Number(reading.temperature);
        const v = Number(reading.vibration);
        const p = Number(reading.pressure);

        const zT = Math.abs(zscore(t, tStats.mean, tStats.std));
        const zV = Math.abs(zscore(v, vStats.mean, vStats.std));
        const zP = Math.abs(zscore(p, pStats.mean, pStats.std));

        const maxZ = Math.max(zT, zV, zP);
        const issues = [];

        if (zT >= WARN_Z) issues.push(`Temperature abnormal (z=${zT.toFixed(2)})`);
        if (zV >= WARN_Z) issues.push(`Vibration abnormal (z=${zV.toFixed(2)})`);
        if (zP >= WARN_Z) issues.push(`Pressure abnormal (z=${zP.toFixed(2)})`);

        if (issues.length === 0) return;

        const severity = maxZ >= CRIT_Z ? "critical" : "warning";
        const anomalyScore = Math.min(1, maxZ / 4);

        detectedAnomalies.push({
          equipmentId: eq.id,
          equipmentName: eq.name,
          timestamp: reading.timestamp,
          anomalyScore,
          severity,
          issues,
          explanation: `Detected unusual behavior vs baseline: ${issues.join(", ")}`,
        });
      });
    });

    const last20 = detectedAnomalies.slice(-20);
    setAnomalies(last20);
    generateAlerts(detectedAnomalies);
  };

  // ----------------------------
  // ML → Prediction mapping (From Script 2)
  // ----------------------------
  const mlToPrediction = (ml) => {
    const { probFailure, riskLevel } = ml;

    let daysToFailure;
    let estimatedCost;
    let potentialSavings;

    if (riskLevel === "critical") {
      daysToFailure = Math.round(5 + (1 - probFailure) * 15);
      estimatedCost = 6000;
      potentialSavings = 45;
    } else if (riskLevel === "medium") {
      daysToFailure = Math.round(20 + (1 - probFailure) * 30);
      estimatedCost = 2500;
      potentialSavings = 30;
    } else {
      daysToFailure = Math.round(45 + (1 - probFailure) * 45);
      estimatedCost = 800;
      potentialSavings = 15;
    }

    return {
      daysToFailure,
      estimatedCost,
      potentialSavings,
    };
  };

  // ----------------------------
  // Predictions (Hybrid: ML from Script 2 + Heuristic from Script 1)
  // ----------------------------
  const generatePredictions = (data, equipmentProfiles) => {
    const predictionResults = [];

    equipmentProfiles.forEach((eq) => {
      // 1. Check if we have ML predictions (Script 2 Logic)
      const ml = mlPredictions[eq.id];

      if (ml) {
        const derived = mlToPrediction(ml);

        predictionResults.push({
          equipmentId: eq.id,
          equipmentName: eq.name,

          daysToFailure: derived.daysToFailure,
          confidence: ml.confidence,
          riskLevel: ml.riskLevel,

          estimatedCost: derived.estimatedCost,
          potentialSavings: derived.potentialSavings,

          recommendedAction:
            ml.riskLevel === "critical"
              ? "Schedule immediate maintenance"
              : ml.riskLevel === "medium"
              ? "Plan maintenance within 2 weeks"
              : "Continue monitoring",

          trends: {
            temperature: "stable",
            vibration: "stable",
            pressure: "stable",
          },
        });

        return; // Exit this iteration if ML data found
      }

      // 2. Fallback to Heuristic Logic (Script 1 Logic)
      const eqData = data.filter((d) => d.equipmentId === eq.id).slice(-48);

      const tempTrend = calculateTrend(eqData.map((d) => Number(d.temperature)));
      const vibTrend = calculateTrend(eqData.map((d) => Number(d.vibration)));
      const presTrend = calculateTrend(eqData.map((d) => Number(d.pressure)));

      let daysToFailure = 90;
      let confidence = 0.7;
      let riskLevel = "low";

      if (eq.health === "critical") {
        daysToFailure = 5 + Math.random() * 10;
        confidence = 0.85;
        riskLevel = "critical";
      } else if (eq.health === "warning") {
        daysToFailure = 20 + Math.random() * 20;
        confidence = 0.75;
        riskLevel = "medium";
      } else {
        daysToFailure = 60 + Math.random() * 30;
        confidence = 0.65;
        riskLevel = "low";
      }

      predictionResults.push({
        equipmentId: eq.id,
        equipmentName: eq.name,
        daysToFailure: Math.round(daysToFailure),
        confidence,
        riskLevel,
        recommendedAction:
          daysToFailure < 15
            ? "Schedule immediate maintenance"
            : daysToFailure < 30
            ? "Plan maintenance within 2 weeks"
            : "Continue monitoring",
        trends: {
          temperature:
            tempTrend > 0.1
              ? "increasing"
              : tempTrend < -0.1
              ? "decreasing"
              : "stable",
          vibration:
            vibTrend > 0.05
              ? "increasing"
              : vibTrend < -0.05
              ? "decreasing"
              : "stable",
          pressure:
            presTrend > 0.2
              ? "increasing"
              : presTrend < -0.2
              ? "decreasing"
              : "stable",
        },
        estimatedCost:
          riskLevel === "critical"
            ? 5000 + Math.random() * 3000
            : riskLevel === "medium"
            ? 2000 + Math.random() * 2000
            : 500 + Math.random() * 1000,
      });
    });

    setPredictions(predictionResults);
  };

  // ----------------------------
  // Export Data
  // ----------------------------
  const exportData = (type) => {
    let data, filename;
    switch (type) {
      case "sensor":
        data = sensorData;
        filename = "sensor_data.json";
        break;
      case "anomalies":
        data = anomalies;
        filename = "anomalies.json";
        break;
      case "predictions":
        data = predictions;
        filename = "predictions.json";
        break;
      default:
        return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const getChartData = (equipmentId) => {
    return sensorData
      .filter((d) => d.equipmentId === equipmentId)
      .slice(-24)
      .map((d) => ({
        time: new Date(d.timestamp).toLocaleTimeString(),
        temperature: Number(d.temperature).toFixed(1),
        vibration: Number(d.vibration).toFixed(2),
        pressure: Number(d.pressure).toFixed(1),
      }));
  };

  // ----------------------------
  // On Mount
  // ----------------------------
  useEffect(() => {
    fetchMe();
    fetchSyntheticData();
    // Fetch ML predictions
    fetchAirCompressorPrediction();
    fetchMillingPrediction();
    fetchTurbofanPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAlertsCount = useMemo(
    () => alerts.filter((a) => !a.acknowledged).length,
    [alerts]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                SME Predictive Maintenance System
              </h1>
              <p className="text-gray-600 mt-2">
                AI-powered equipment monitoring and failure prediction
              </p>

              <div className="mt-2 flex items-center gap-3">
                {me?.username ? (
                  <p className="text-sm text-gray-700">
                    Logged in as <span className="font-semibold">{me.username}</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Logged in</p>
                )}
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
                  title="Logout"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>

              {loadErr && <p className="mt-2 text-sm text-red-600">{loadErr}</p>}
            </div>

            <div className="flex gap-2">
              {/* Add Machine Button (From Script 1) */}
              <button
                onClick={openAddModal}
                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 flex items-center gap-2"
                title="Add New Machine"
              >
                <Plus size={20} />
                <span className="hidden md:inline">Add Machine</span>
              </button>

              <button
                onClick={() => {
                  fetchSyntheticData();
                  fetchAirCompressorPrediction();
                  fetchMillingPrediction();
                  fetchTurbofanPrediction();
                }}
                disabled={isProcessing}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                <Activity size={20} />
                {isProcessing ? "Loading..." : "Refresh Data"}
              </button>
            </div>
          </div>
        </div>

        {/* --- MODAL FOR ADDING MACHINE (From Script 1) --- */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
              <button
                onClick={closeAddModal}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
              
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Plus className="text-green-600" /> Add New Equipment
              </h2>
              
              <form onSubmit={handleAddMachine} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shop Air Compressor 2"
                    value={newMachineName}
                    onChange={(e) => setNewMachineName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machine Type
                  </label>
                  <select
                    value={selectedTypeId}
                    onChange={(e) => setSelectedTypeId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none bg-white"
                  >
                    {machineTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select the model to simulate appropriate sensor behavior.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {isAdding ? "Adding..." : "Add Machine"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b overflow-x-auto">
            {["dashboard", "equipment", "anomalies", "predictions", "alerts", "settings"].map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 font-medium capitalize whitespace-nowrap ${
                    activeTab === tab
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab}
                </button>
              )
            )}
          </div>
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Equipment</p>
                    <p className="text-3xl font-bold text-gray-900">{equipment.length}</p>
                  </div>
                  <Activity className="text-blue-600" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Active Alerts</p>
                    <p className="text-3xl font-bold text-red-600">{activeAlertsCount}</p>
                  </div>
                  <AlertTriangle className="text-red-600" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Critical Risks</p>
                    <p className="text-3xl font-bold text-orange-600">
                      {predictions.filter((p) => p.riskLevel === "critical").length}
                    </p>
                  </div>
                  <TrendingUp className="text-orange-600" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Anomalies Detected</p>
                    <p className="text-3xl font-bold text-yellow-600">{anomalies.length}</p>
                  </div>
                  <AlertTriangle className="text-yellow-600" size={32} />
                </div>
              </div>
            </div>

            {/* Equipment Status Overview */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Equipment Health Status
              </h2>

              {equipment.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No equipment loaded yet.</p>
                  <button onClick={openAddModal} className="text-green-600 font-medium hover:underline mt-2">
                    Add your first machine
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...equipment]
                    .sort((a, b) => b.id - a.id) // Sorts descending (Highest ID first)
                    .map((eq) => {
                    const pred = predictions.find((p) => p.equipmentId === eq.id);
                    const ml = mlPredictions[eq.id];

                    return (
                      <div key={eq.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow relative group">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-900">{eq.name}</h3>
                          
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                pred?.riskLevel === "critical"
                                  ? "bg-red-100 text-red-800"
                                  : pred?.riskLevel === "medium"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {pred?.riskLevel?.toUpperCase() || eq.health?.toUpperCase() || "GOOD"}
                            </span>

                            {/* DELETE BUTTON (From Script 1) */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation(); 
                                handleDeleteMachine(eq.id);
                              }}
                              className="text-gray-400 hover:text-red-600 transition-colors p-1"
                              title="Remove Machine"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-gray-500">ID: {eq.id}</p>
                        <p className="text-xs text-gray-500">Type: {eq.type}</p>
                        <p className="text-xs text-gray-500">
                          Added: {eq.dateAdded ? formatDate(eq.dateAdded) : "—"}
                        </p>

                        {/* ML Data Display (From Script 2) */}
                        {ml && (
                          <div className="mt-1 mb-2">
                             <p className="text-sm text-gray-700">
                               Failure Prob: <span className="font-semibold">{(ml.probFailure * 100).toFixed(1)}%</span>
                             </p>
                             <p className="text-sm text-gray-700">
                               Confidence: <span className="font-semibold">{(ml.confidence * 100).toFixed(0)}%</span>
                             </p>
                          </div>
                        )}

                        {pred && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Est. failure:</span> {pred.daysToFailure} days
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Equipment Tab (Details) */}
        {activeTab === "equipment" && (
          <div className="space-y-6">
            {equipment.map((eq) => {
              const chartData = getChartData(eq.id);
              return (
                <div key={eq.id} className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    {eq.name} <span className="text-gray-400 text-sm">({eq.id})</span>
                  </h2>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="temperature"
                        stroke="#ef4444"
                        name="Temperature"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="vibration"
                        stroke="#3b82f6"
                        name="Vibration"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="pressure"
                        stroke="#10b981"
                        name="Pressure"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === "anomalies" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Detected Anomalies</h2>
              <button
                onClick={() => exportData("anomalies")}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Download size={16} />
                Export
              </button>
            </div>

            <div className="space-y-4">
              {anomalies.length === 0 ? (
                <p className="text-gray-600">No anomalies detected.</p>
              ) : (
                anomalies.map((anomaly, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              anomaly.severity === "critical"
                                ? "bg-red-100 text-red-800"
                                : anomaly.severity === "warning"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {anomaly.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold">{anomaly.equipmentName}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {new Date(anomaly.timestamp).toLocaleString()}
                        </p>
                        <p className="text-gray-700">{anomaly.explanation}</p>
                        <div className="mt-2">
                          <span className="text-sm font-medium">Anomaly Score: </span>
                          <span className="text-sm">
                            {(anomaly.anomalyScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Predictions Tab */}
        {activeTab === "predictions" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Failure Predictions & Recommendations
              </h2>
              <button
                onClick={() => exportData("predictions")}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Download size={16} />
                Export
              </button>
            </div>

            <div className="space-y-4">
              {predictions
                .slice()
                .sort((a, b) => a.daysToFailure - b.daysToFailure)
                .map((pred, idx) => (
                  <div key={idx} className="border rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {pred.equipmentName}
                        </h3>
                        <p className="text-sm text-gray-600">{pred.equipmentId}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded font-medium ${
                          pred.riskLevel === "critical"
                            ? "bg-red-100 text-red-800"
                            : pred.riskLevel === "medium"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {pred.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-600">Est. Time to Failure</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {pred.daysToFailure} days
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Confidence</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {(pred.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Est. Maintenance Cost</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ${pred.estimatedCost.toFixed(0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Potential Savings</p>
                        <p className="text-2xl font-bold text-green-600">
                          {pred.potentialSavings}%
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Sensor Trends:
                      </p>
                      <div className="flex gap-4">
                        <span className="text-sm">
                          Temp:{" "}
                          <span
                            className={
                              pred.trends.temperature === "increasing"
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {pred.trends.temperature}
                          </span>
                        </span>
                        <span className="text-sm">
                          Vibration:{" "}
                          <span
                            className={
                              pred.trends.vibration === "increasing"
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {pred.trends.vibration}
                          </span>
                        </span>
                        <span className="text-sm">
                          Pressure:{" "}
                          <span
                            className={
                              pred.trends.pressure === "increasing"
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {pred.trends.pressure}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded p-4">
                      <div className="flex items-start gap-2">
                        <Calendar className="text-blue-600 mt-1" size={20} />
                        <div>
                          <p className="font-medium text-blue-900">
                            Recommended Action:
                          </p>
                          <p className="text-blue-800">{pred.recommendedAction}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === "alerts" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Active Alerts</h2>

            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="mx-auto text-green-600 mb-2" size={48} />
                  <p className="text-gray-600">No active alerts</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`border rounded-lg p-4 ${
                      alert.acknowledged ? "bg-gray-50 opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              alert.severity === "critical"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold">{alert.equipmentName}</span>
                          {alert.acknowledged && (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Acknowledged
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-2">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                        <p className="text-gray-700">{alert.message}</p>
                      </div>

                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="ml-4 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Threshold Configuration</h2>

            <p className="text-sm text-gray-600 mb-4">
              Note: thresholds are currently only UI placeholders. Anomaly detection now uses
              per-machine z-score baselines.
            </p>

            <div className="space-y-6">
              {Object.entries(thresholds).map(([sensor, values]) => (
                <div key={sensor} className="border rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4 capitalize">{sensor}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Warning Threshold
                      </label>
                      <input
                        type="number"
                        value={values.warning}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            [sensor]: {
                              ...prev[sensor],
                              warning: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Critical Threshold
                      </label>
                      <input
                        type="number"
                        value={values.critical}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            [sensor]: {
                              ...prev[sensor],
                              critical: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  fetchSyntheticData();
                  fetchAirCompressorPrediction();
                  fetchMillingPrediction();
                  fetchTurbofanPrediction();
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply & Reanalyze
              </button>

              <button
                onClick={() => exportData("sensor")}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-2"
              >
                <Download size={16} />
                Export All Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictiveMaintenanceSystem;