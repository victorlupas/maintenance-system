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
  ReferenceArea,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle,
  Activity,
  TrendingUp,
  Calendar,
  Download,
  LogOut,
  Lock,
  Plus,
  X,
  Trash2,
  Upload,
  FileText,
  Moon,
  Sun,
  Settings,
  ChevronDown,
  ChevronUp,
  Radio,
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

  // Add Machine Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [machineTypes, setMachineTypes] = useState([]);
  const [newMachineName, setNewMachineName] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [dataFile, setDataFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  // ML predictions from backend (per equipmentId)
  const [mlPredictions, setMlPredictions] = useState({});

  // Accumulated sensor history per machine (for graphs)
  const [sensorHistory, setSensorHistory] = useState({});

  // Auto-simulation state
  const [autoSimEnabled, setAutoSimEnabled] = useState(true);
  const AUTO_SIM_INTERVAL = 10000; // 10 seconds
  const MAX_HISTORY_POINTS = 50; // Keep last 50 data points per machine
  
  // Change Password Modal State
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changePasswordSuccess, setChangePasswordSuccess] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Auth UI
  const [me, setMe] = useState(null);
  const navigate = useNavigate();

  // Machine-type-specific default thresholds based on actual sensor value ranges
  // Values derived from backend synthetic data generation ranges
  const thresholdsByType = {
    // Air Compressor: healthy 95-145°C temp, 2.0-5.5 vib, 1.5-7.5 pressure
    AC: {
      temperature: { warning: 130, critical: 145 },
      vibration: { warning: 4.5, critical: 5.5 },
      pressure: { warning: 6.0, critical: 7.5 },
    },
    // CNC Milling Machine: healthy 35-42°C temp, 1.5-3.5 vib, 40-50 pressure
    CNC: {
      temperature: { warning: 40, critical: 42 },
      vibration: { warning: 3.0, critical: 3.5 },
      pressure: { warning: 42, critical: 40 }, // Note: lower pressure = worse for CNC
    },
    // Turbofan Engine: healthy 600-680°C temp, 1.0-5.0 vib, 22-30 pressure
    TE: {
      temperature: { warning: 660, critical: 680 },
      vibration: { warning: 4.0, critical: 5.0 },
      pressure: { warning: 24, critical: 22 }, // Note: lower pressure = worse for turbofan
    },
    // Generic fallback for unknown types
    default: {
      temperature: { warning: 85, critical: 95 },
      vibration: { warning: 5.0, critical: 6.5 },
      pressure: { warning: 115, critical: 130 },
    },
  };

  // Per-machine thresholds (keyed by machine ID)
  const [machineThresholds, setMachineThresholds] = useState({});

  // Get default thresholds based on machine type
  const getDefaultThresholds = (machineType) => {
    return thresholdsByType[machineType] || thresholdsByType.default;
  };

  // Get thresholds for a specific machine (with type-specific defaults)
  const getThresholds = (machineId) => {
    if (machineThresholds[machineId]) {
      return machineThresholds[machineId];
    }
    // Find the machine to get its type
    const machine = equipment.find((eq) => eq.id === machineId);
    const machineType = machine?.type || 'default';
    return getDefaultThresholds(machineType);
  };

  // Update threshold for a specific machine
  const updateMachineThreshold = (machineId, sensor, type, value) => {
    setMachineThresholds((prev) => {
      // Get machine type to use proper defaults
      const machine = equipment.find((eq) => eq.id === machineId);
      const machineType = machine?.type || 'default';
      const current = prev[machineId] || getDefaultThresholds(machineType);
      return {
        ...prev,
        [machineId]: {
          ...current,
          [sensor]: {
            ...current[sensor],
            [type]: parseFloat(value) || 0,
          },
        },
      };
    });
  };

  // Expanded settings state per machine
  const [expandedSettings, setExpandedSettings] = useState({});

  const toggleSettings = (machineId) => {
    setExpandedSettings((prev) => ({
      ...prev,
      [machineId]: !prev[machineId],
    }));
  };

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

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

    const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError("");
    setChangePasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setChangePasswordError("All fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordError("New passwords do not match");
      return;
    }

    try {
      setIsChangingPassword(true);
      await api.post("/api/auth/change-password/", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      
      setChangePasswordSuccess("Password changed successfully!");
      setTimeout(() => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setIsChangePasswordModalOpen(false);
        setChangePasswordSuccess("");
      }, 1500);
    } catch (error) {
      const messages = error.response?.data?.detail;
      if (Array.isArray(messages)) {
        setChangePasswordError(messages);
      } else {
        setChangePasswordError(messages || "Failed to change password");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const openChangePasswordModal = () => {
    setChangePasswordError("");
    setChangePasswordSuccess("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsChangePasswordModalOpen(true);
  };

  const closeChangePasswordModal = () => {
    setIsChangePasswordModalOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordError("");
    setChangePasswordSuccess("");
  };

  // ----------------------------
  // Backend data fetch
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

      // Initialize sensor history from fetched data
      const historyInit = {};
      eq.forEach((machine) => {
        const machineRows = rows
          .filter((r) => r.equipmentId === machine.id)
          .slice(-MAX_HISTORY_POINTS);
        if (machineRows.length > 0) {
          historyInit[machine.id] = machineRows;
        }
      });
      setSensorHistory((prev) => ({ ...prev, ...historyInit }));

      // recompute derived outputs client-side
      performAnomalyDetection(rows, eq);
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
  // ML Prediction Fetchers
  // ----------------------------
  const fetchAirCompressorPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/air-compressor/");
      const list = Array.isArray(res.data) ? res.data : [];

      setMlPredictions((prev) => {
        const next = { ...prev };
        list.forEach((item) => {
          if (item?.equipmentId) {
            next[item.equipmentId] = item;
          }
        });
        return next;
      });
    } catch (e) {
      console.error("Failed to load air compressor ML prediction", e);
    }
  };

  const fetchMillingPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/milling/");
      const list = Array.isArray(res.data) ? res.data : [];

      setMlPredictions((prev) => {
        const next = { ...prev };
        list.forEach((item) => {
          if (item?.equipmentId) {
            next[item.equipmentId] = item;
          }
        });
        return next;
      });
    } catch (e) {
      console.error("Failed to load milling ML prediction", e);
    }
  };

  const fetchTurbofanPrediction = async () => {
    try {
      const res = await api.get("/api/predictions/turbofan/");
      const list = Array.isArray(res.data) ? res.data : [];

      setMlPredictions((prev) => {
        const next = { ...prev };
        list.forEach((item) => {
          if (item?.equipmentId) {
            next[item.equipmentId] = item;
          }
        });
        return next;
      });
    } catch (e) {
      console.error("Failed to load turbofan ML prediction", e);
    }
  };

  const openAddModal = async () => {
    setIsAddModalOpen(true);
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
    setDataFile(null);
    setUploadResult(null);
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!newMachineName || !selectedTypeId) return;

    setIsAdding(true);
    setUploadResult(null);

    try {
      let result;

      if (dataFile) {
        // Use file upload endpoint
        const formData = new FormData();
        formData.append("name", newMachineName);
        formData.append("type_id", selectedTypeId);
        formData.append("data_file", dataFile);

        const res = await api.post("/api/machines/add-with-data/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        result = res.data;

        // Show prediction result
        setUploadResult(result);

        // Update ML predictions with the new result
        if (result.prediction && result.id) {
          setMlPredictions((prev) => ({
            ...prev,
            [result.id]: {
              equipmentId: result.id,
              equipmentName: result.name,
              ...result.prediction,
            },
          }));
        }

        // Initialize sensor history with uploaded data for the graph
        if (result.sensorData && result.sensorData.length > 0 && result.id) {
          setSensorHistory((prev) => ({
            ...prev,
            [result.id]: result.sensorData,
          }));
        }
      } else {
        // Use regular endpoint (synthetic data)
        await api.post("/api/machines/add/", {
          name: newMachineName,
          type_id: selectedTypeId,
        });
      }

      await fetchSyntheticData();
      fetchAirCompressorPrediction();
      fetchMillingPrediction();
      fetchTurbofanPrediction();

      // Only close if no file was uploaded (so user can see results)
      if (!dataFile) {
        closeAddModal();
      }
    } catch (error) {
      console.error("Failed to add machine", error);
      const detail = error.response?.data?.detail || "Failed to add machine. Please try again.";
      alert(detail);
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [".csv", ".json"];
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!validTypes.includes(ext)) {
        alert("Please upload a CSV or JSON file.");
        e.target.value = "";
        return;
      }
      setDataFile(file);
      setUploadResult(null);
    }
  };

  // ----------------------------
  // Delete Machine Function
  // ----------------------------
  const handleDeleteMachine = async (machineId) => {
    if (!window.confirm("Are you sure you want to remove this machine?")) return;

    try {
      await api.delete(`/api/machines/${machineId}/delete/`);
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
  // Anomaly Detection (using ML training data baselines)
  // ----------------------------

  // ML-derived baseline statistics from training data analysis
  // These represent "healthy" operating ranges from real equipment data
  const mlBaselinesByType = {
    // Air Compressor: from air_compressor.csv analysis
    AC: {
      temperature: { mean: 95, std: 15 },   // healthy range ~80-110°C
      vibration: { mean: 2.0, std: 0.8 },   // healthy range ~1.2-2.8
      pressure: { mean: 1.5, std: 1.5 },    // healthy range ~0-3 bar
    },
    // CNC Milling: from ai4i2020.csv analysis
    CNC: {
      temperature: { mean: 35, std: 2 },    // healthy range ~33-37°C
      vibration: { mean: 1.5, std: 0.5 },   // healthy range ~1.0-2.0
      pressure: { mean: 50, std: 3 },       // healthy range ~47-53
    },
    // Turbofan Engine: from NASA turbofan dataset analysis
    TE: {
      temperature: { mean: 600, std: 25 },  // healthy range ~575-625°C
      vibration: { mean: 1.0, std: 1.0 },   // healthy range ~0-2.0
      pressure: { mean: 30, std: 2.5 },     // healthy range ~27.5-32.5
    },
    // Fallback for unknown types
    default: {
      temperature: { mean: 50, std: 15 },
      vibration: { mean: 2.0, std: 1.0 },
      pressure: { mean: 50, std: 10 },
    },
  };

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

  const performAnomalyDetection = (data, equipmentProfiles) => {
    const detectedAnomalies = [];
    const WARN_Z = 2.5;
    const CRIT_Z = 3.2;

    equipmentProfiles.forEach((eq) => {
      const eqDataAll = data.filter((d) => d.equipmentId === eq.id);
      if (eqDataAll.length < 5) return;

      // Use ML-derived baselines based on machine type
      const machineType = eq.type || 'default';
      const baselines = mlBaselinesByType[machineType] || mlBaselinesByType.default;

      const recent = eqDataAll.slice(-24);

      recent.forEach((reading) => {
        const t = Number(reading.temperature);
        const v = Number(reading.vibration);
        const p = Number(reading.pressure);

        // Calculate Z-scores using ML training data baselines
        const zT = Math.abs(zscore(t, baselines.temperature.mean, baselines.temperature.std));
        const zV = Math.abs(zscore(v, baselines.vibration.mean, baselines.vibration.std));
        const zP = Math.abs(zscore(p, baselines.pressure.mean, baselines.pressure.std));

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
          explanation: `Detected unusual behavior vs ML baseline: ${issues.join(", ")}`,
        });
      });
    });

    const last20 = detectedAnomalies.slice(-20);
    setAnomalies(last20);
    generateAlerts(detectedAnomalies);
  };

  // ----------------------------
  // Research-Backed Cost Model
  // Based on industry data:
  // - Reactive maintenance costs 10x more than preventive (Buildings.com)
  // - Predictive saves 8-12% over preventive, up to 40% over reactive (U.S. DOE)
  // - Each $1 on preventive maintenance saves $5 later (OSHA)
  // - Downtime costs 5-20% of productive capacity (Industry average)
  // ----------------------------
  const maintenanceCostModel = {
    // Air Compressor - Medium complexity industrial equipment
    AC: {
      preventiveRepairCost: 2500,    // Base cost for scheduled maintenance
      emergencyMultiplier: 10,       // Reactive = 10x preventive (industry standard)
      hourlyDowntimeCost: 500,       // Production loss per hour
      avgPreventiveDowntime: 2,      // Hours for planned maintenance
      avgEmergencyDowntime: 8,       // Hours for emergency repair
    },
    // CNC Milling Machine - High precision, complex equipment
    CNC: {
      preventiveRepairCost: 5000,
      emergencyMultiplier: 10,
      hourlyDowntimeCost: 1200,      // Higher due to precision work
      avgPreventiveDowntime: 4,
      avgEmergencyDowntime: 16,
    },
    // Turbofan Engine - Critical, high-value equipment
    TE: {
      preventiveRepairCost: 15000,
      emergencyMultiplier: 10,
      hourlyDowntimeCost: 5000,      // Critical operations
      avgPreventiveDowntime: 8,
      avgEmergencyDowntime: 48,
    },
    // Default fallback
    default: {
      preventiveRepairCost: 3000,
      emergencyMultiplier: 10,
      hourlyDowntimeCost: 800,
      avgPreventiveDowntime: 4,
      avgEmergencyDowntime: 12,
    },
  };

  // Calculate costs based on machine type and risk level
  const mlToPrediction = (ml, machineType = 'default') => {
    const { probFailure, riskLevel } = ml;
    const costs = maintenanceCostModel[machineType] || maintenanceCostModel.default;

    // Days to failure based on risk level and probability
    let daysToFailure;
    if (riskLevel === "critical") {
      daysToFailure = Math.round(5 + (1 - probFailure) * 15);
    } else if (riskLevel === "medium") {
      daysToFailure = Math.round(20 + (1 - probFailure) * 30);
    } else {
      daysToFailure = Math.round(45 + (1 - probFailure) * 45);
    }

    // Calculate preventive (scheduled) maintenance cost
    const preventiveCost = costs.preventiveRepairCost + 
      (costs.hourlyDowntimeCost * costs.avgPreventiveDowntime);

    // Calculate emergency (reactive) maintenance cost
    const emergencyCost = (costs.preventiveRepairCost * costs.emergencyMultiplier) +
      (costs.hourlyDowntimeCost * costs.avgEmergencyDowntime);

    // Estimated cost depends on risk level
    let estimatedCost;
    if (riskLevel === "critical") {
      estimatedCost = Math.round(preventiveCost * 0.3 + emergencyCost * 0.7 * probFailure);
    } else if (riskLevel === "medium") {
      estimatedCost = Math.round(preventiveCost * 0.6 + emergencyCost * 0.4 * probFailure);
    } else {
      estimatedCost = Math.round(preventiveCost);
    }

    // Potential savings = (Emergency cost - Preventive cost) / Emergency cost * 100
    const potentialSavings = Math.round(((emergencyCost - preventiveCost) / emergencyCost) * 100);

    return {
      daysToFailure,
      estimatedCost,
      potentialSavings,
    };
  };

  // ----------------------------
  // Predictions (ML-based)
  // ----------------------------
  const generatePredictions = (_data, equipmentProfiles) => {
    const predictionResults = [];

    equipmentProfiles.forEach((eq) => {
      const ml = mlPredictions[eq.id];

      if (ml) {
        // Pass machine type for accurate cost calculation
        const derived = mlToPrediction(ml, eq.type);

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
      }
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

  // Export machine-specific sensor data
  const exportMachineData = (equipmentId, equipmentName, format) => {
    const history = sensorHistory[equipmentId] || [];
    const dataSource = history.length > 0 ? history : sensorData.filter((d) => d.equipmentId === equipmentId);
    
    if (dataSource.length === 0) {
      alert("No data available to export");
      return;
    }

    // Clean data for export (remove internal fields)
    const cleanData = dataSource.map((d) => ({
      timestamp: d.timestamp,
      temperature: Number(d.temperature).toFixed(2),
      vibration: Number(d.vibration).toFixed(3),
      pressure: Number(d.pressure).toFixed(2),
      power: d.powerConsumption || d.power || 0,
    }));

    const safeName = equipmentName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    
    if (format === "json") {
      const blob = new Blob([JSON.stringify(cleanData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}_sensor_data.json`;
      a.click();
    } else if (format === "csv") {
      const headers = "timestamp,temperature,vibration,pressure,power";
      const rows = cleanData.map((d) => 
        `${d.timestamp},${d.temperature},${d.vibration},${d.pressure},${d.power}`
      );
      const csvContent = [headers, ...rows].join("\n");
      
      const blob = new Blob([csvContent], {
        type: "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}_sensor_data.csv`;
      a.click();
    }
  };

  // Per-machine data points setting
  const [chartPointsConfig, setChartPointsConfig] = useState({});
  const DATA_POINT_OPTIONS = [10, 20, 30, 50];

  const getChartPoints = (machineId) => chartPointsConfig[machineId] || 30;

  const getChartData = (equipmentId, numPoints) => {
    // Use accumulated history if available, fallback to sensorData
    const history = sensorHistory[equipmentId] || [];
    const dataSource = history.length > 0 ? history : sensorData.filter((d) => d.equipmentId === equipmentId);
    const thresholds = getThresholds(equipmentId);
    const pointsToShow = numPoints || getChartPoints(equipmentId);
    
    // Get machine type to determine if pressure is inverted (lower = worse)
    const machine = equipment.find((eq) => eq.id === equipmentId);
    const machineType = machine?.type || 'default';
    // For CNC and TE, lower pressure = worse, so we invert the comparison
    const pressureInverted = machineType === 'CNC' || machineType === 'TE';
    
    return dataSource
      .slice(-pointsToShow)
      .map((d, idx) => {
        const temp = Number(d.temperature);
        const vib = Number(d.vibration);
        const press = Number(d.pressure);
        
        // Determine severity based on thresholds
        // Logic: value < warning = normal, warning <= value < critical = medium, value >= critical = critical
        // For inverted sensors (pressure on CNC/TE): value > warning = normal, warning >= value > critical = medium, value <= critical = critical
        let severity = "normal";
        
        // Check temperature (higher = worse)
        const tempCritical = temp >= thresholds.temperature.critical;
        const tempWarning = temp >= thresholds.temperature.warning && temp < thresholds.temperature.critical;
        
        // Check vibration (higher = worse)
        const vibCritical = vib >= thresholds.vibration.critical;
        const vibWarning = vib >= thresholds.vibration.warning && vib < thresholds.vibration.critical;
        
        // Check pressure - direction depends on machine type
        let pressCritical, pressWarning;
        if (pressureInverted) {
          // Lower pressure = worse (CNC, TE)
          pressCritical = press <= thresholds.pressure.critical;
          pressWarning = press <= thresholds.pressure.warning && press > thresholds.pressure.critical;
        } else {
          // Higher pressure = worse (AC, default)
          pressCritical = press >= thresholds.pressure.critical;
          pressWarning = press >= thresholds.pressure.warning && press < thresholds.pressure.critical;
        }
        
        // Determine overall severity (worst wins)
        if (tempCritical || vibCritical || pressCritical) {
          severity = "critical";
        } else if (tempWarning || vibWarning || pressWarning) {
          severity = "medium";
        }
        
        return {
          time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temperature: temp.toFixed(1),
          vibration: vib.toFixed(2),
          pressure: press.toFixed(1),
          severity,
          idx,
        };
      });
  };

  // Calculate alert regions for chart highlighting (using index-based positioning)
  const getAlertRegions = (chartData) => {
    const regions = [];
    let currentRegion = null;

    chartData.forEach((point, idx) => {
      if (point.severity === "critical" || point.severity === "medium") {
        if (!currentRegion || currentRegion.severity !== point.severity) {
          if (currentRegion) {
            regions.push(currentRegion);
          }
          currentRegion = {
            x1Index: idx,
            x2Index: idx,
            severity: point.severity,
          };
        } else {
          currentRegion.x2Index = idx;
        }
      } else {
        if (currentRegion) {
          regions.push(currentRegion);
          currentRegion = null;
        }
      }
    });

    if (currentRegion) {
      regions.push(currentRegion);
    }

    return regions;
  };

  // ----------------------------
  // On Mount
  // ----------------------------
  useEffect(() => {
    fetchMe();
    fetchSyntheticData();
    fetchAirCompressorPrediction();
    fetchMillingPrediction();
    fetchTurbofanPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------
  // Auto-simulation polling
  // ----------------------------
  useEffect(() => {
    if (!autoSimEnabled || equipment.length === 0) return;

    const interval = setInterval(() => {
      // Fetch new data point for each machine
      fetchNewDataPoint();
    }, AUTO_SIM_INTERVAL);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSimEnabled, equipment]);

  // Fetch a single new data point and append to history
  const fetchNewDataPoint = async () => {
    try {
      const res = await api.get("/api/synthetic/");
      const rows = res.data.sensorData || [];

      // Group latest reading per machine
      const latestByMachine = {};
      rows.forEach((row) => {
        const existing = latestByMachine[row.equipmentId];
        if (!existing || new Date(row.timestamp) > new Date(existing.timestamp)) {
          latestByMachine[row.equipmentId] = row;
        }
      });

      // Append to history
      setSensorHistory((prev) => {
        const next = { ...prev };
        Object.entries(latestByMachine).forEach(([eqId, reading]) => {
          const history = next[eqId] || [];
          // Add new reading with current timestamp
          const newReading = { ...reading, timestamp: new Date().toISOString() };
          const updated = [...history, newReading].slice(-MAX_HISTORY_POINTS);
          next[eqId] = updated;
        });
        return next;
      });

      // Also update predictions periodically
      fetchAirCompressorPrediction();
      fetchMillingPrediction();
      fetchTurbofanPrediction();
    } catch (e) {
      console.error("Auto-sim fetch failed", e);
    }
  };

  // Regenerate predictions when ML data updates
  useEffect(() => {
    if (sensorData.length > 0 && equipment.length > 0) {
      generatePredictions(sensorData, equipment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mlPredictions]);

  const activeAlertsCount = useMemo(
    () => alerts.filter((a) => !a.acknowledged).length,
    [alerts]
  );

  // Theme classes
  const theme = {
    bg: darkMode ? "bg-gray-800" : "bg-gray-50",
    card: darkMode ? "bg-gray-700" : "bg-white",
    text: darkMode ? "text-gray-100" : "text-gray-900",
    textMuted: darkMode ? "text-gray-300" : "text-gray-600",
    border: darkMode ? "border-gray-600" : "border-gray-200",
    input: darkMode ? "bg-gray-600 border-gray-500 text-gray-100" : "bg-white border-gray-300",
    hover: darkMode ? "hover:bg-gray-600" : "hover:bg-gray-50",
  };

  return (
    <div className={`min-h-screen ${theme.bg} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`${theme.card} rounded-lg shadow-md p-6 mb-6 transition-colors duration-200`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className={`text-3xl font-bold ${theme.text}`}>
                SME Predictive Maintenance System
              </h1>
              <p className={`${theme.textMuted} mt-2`}>
                AI-powered equipment monitoring and failure prediction
              </p>

              <div className="mt-2 flex items-center gap-3">
                {me?.username ? (
                  <p className={`text-sm ${theme.textMuted}`}>
                    Logged in as <span className="font-semibold">{me.username}</span>
                  </p>
                ) : (
                  <p className={`text-sm ${theme.textMuted}`}>Logged in</p>
                )}
                <button
                  onClick={onLogout}
                  className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border ${theme.border} ${theme.text} ${theme.hover}`}
                  title="Logout"
                >
                  <LogOut size={16} /> Logout
                </button>

                <button
                  onClick={openChangePasswordModal}
                  className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border ${theme.border} ${theme.text} ${theme.hover}`}
                  title="Change Password"
                >
                  <Lock size={16} /> Password
                </button>
              </div>

              {loadErr && <p className="mt-2 text-sm text-red-600">{loadErr}</p>}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAutoSimEnabled(!autoSimEnabled)}
                className={`px-4 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                  autoSimEnabled 
                    ? "bg-green-600 text-white hover:bg-green-700" 
                    : `${theme.card} ${theme.text} border ${theme.border} ${theme.hover}`
                }`}
                title={autoSimEnabled ? "Auto-simulation ON (10s)" : "Auto-simulation OFF"}
              >
                <Activity size={20} className={autoSimEnabled ? "animate-pulse" : ""} />
                <span className="hidden md:inline">{autoSimEnabled ? "Live" : "Paused"}</span>
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`${theme.card} ${theme.text} px-3 py-3 rounded-lg ${theme.hover} border ${theme.border} transition-colors`}
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
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

        {/* Modal for Adding Machine */}
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
                    Select the machine type for prediction model.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Log File (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-green-500 transition-colors">
                    <input
                      type="file"
                      accept=".csv,.json"
                      onChange={handleFileChange}
                      className="hidden"
                      id="data-file-input"
                    />
                    <label
                      htmlFor="data-file-input"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      {dataFile ? (
                        <>
                          <FileText className="text-green-600" size={32} />
                          <span className="text-sm font-medium text-gray-900">
                            {dataFile.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {(dataFile.size / 1024).toFixed(1)} KB
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="text-gray-400" size={32} />
                          <span className="text-sm text-gray-600">
                            Click to upload CSV or JSON
                          </span>
                          <span className="text-xs text-gray-400">
                            Sensor data log for ML prediction
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                  {dataFile && (
                    <button
                      type="button"
                      onClick={() => setDataFile(null)}
                      className="mt-2 text-xs text-red-600 hover:underline"
                    >
                      Remove file
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Upload sensor data to get real predictions. Without a file, synthetic data will be used.
                  </p>
                </div>

                {uploadResult && (
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <CheckCircle className="text-green-600" size={18} />
                      Machine Added Successfully
                    </h3>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-gray-600">ID:</span> {uploadResult.id}
                      </p>
                      <p>
                        <span className="text-gray-600">Rows Processed:</span>{" "}
                        {uploadResult.dataRowsProcessed}
                      </p>
                      <div className="pt-2 border-t mt-2">
                        <p className="font-medium text-gray-900">Prediction Result:</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              uploadResult.prediction?.riskLevel === "critical"
                                ? "bg-red-100 text-red-800"
                                : uploadResult.prediction?.riskLevel === "medium"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {uploadResult.prediction?.riskLevel?.toUpperCase()}
                          </span>
                          <span className="text-gray-900">
                            {((uploadResult.prediction?.probFailure || 0) * 100).toFixed(1)}% failure probability
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeAddModal}
                      className="mt-3 w-full bg-gray-200 text-gray-800 py-2 rounded-lg font-medium hover:bg-gray-300"
                    >
                      Close
                    </button>
                  </div>
                )}

                {!uploadResult && (
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isAdding}
                      className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                    >
                      {isAdding ? (
                        "Processing..."
                      ) : dataFile ? (
                        
                        <>
                          <Upload size={18} />
                          Add Machine & Analyze Data
                        </>
                      ) : (
                        "Add Machine"
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Modal for Changing Password */}
        {isChangePasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className={`${theme.card} rounded-lg shadow-xl w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200`}>
              <button
                onClick={closeChangePasswordModal}
                className={`absolute top-4 right-4 ${theme.textMuted} hover:${theme.text}`}
              >
                <X size={24} />
              </button>

              <h2 className={`text-xl font-bold ${theme.text} mb-4 flex items-center gap-2`}>
                <Lock className="text-blue-600" /> Change Password
              </h2>

              {changePasswordSuccess && (
                <div className="mb-4 p-3 rounded bg-green-100 text-green-800 text-sm">
                  ✓ {changePasswordSuccess}
                </div>
              )}

              {changePasswordError && (
                <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm space-y-1">
                  {Array.isArray(changePasswordError) ? (
                    changePasswordError.map((msg, idx) => <div key={idx}>{msg}</div>)
                  ) : (
                    changePasswordError.split(", ").map((msg, idx) => <div key={idx}>{msg}</div>)
                  )}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${theme.text} mb-1`}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={`w-full border ${theme.border} rounded-lg px-3 py-2 ${theme.text} bg-transparent focus:ring-2 focus:ring-blue-500 outline-none`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${theme.text} mb-1`}>
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`w-full border ${theme.border} rounded-lg px-3 py-2 ${theme.text} bg-transparent focus:ring-2 focus:ring-blue-500 outline-none`}
                  />
                  <p className={`text-xs ${theme.textMuted} mt-1`}>
                    Min 6 chars, 1 uppercase, 1 lowercase, 1 digit, 1 symbol
                  </p>
                </div>

                <div>
                  <label className={`block text-sm font-medium ${theme.text} mb-1`}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full border ${theme.border} rounded-lg px-3 py-2 ${theme.text} bg-transparent focus:ring-2 focus:ring-blue-500 outline-none`}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                  >
                    {isChangingPassword ? "Updating..." : "Change Password"}
                  </button>
                  <button
                    type="button"
                    onClick={closeChangePasswordModal}
                    className={`flex-1 px-4 py-2 rounded-lg border ${theme.border} ${theme.text} ${theme.hover} font-medium`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className={`${theme.card} rounded-lg shadow-md mb-6 transition-colors duration-200`}>
          <div className={`flex border-b ${theme.border} overflow-x-auto`}>
            {["dashboard", "equipment", "predictions", "alerts"].map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 font-medium capitalize whitespace-nowrap ${
                    activeTab === tab
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : `${theme.textMuted} hover:text-blue-500`
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
              <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme.textMuted} text-sm`}>Total Equipment</p>
                    <p className={`text-3xl font-bold ${theme.text}`}>{equipment.length}</p>
                  </div>
                  <Activity className="text-blue-600" size={32} />
                </div>
              </div>

              <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme.textMuted} text-sm`}>Active Alerts</p>
                    <p className="text-3xl font-bold text-red-600">{activeAlertsCount}</p>
                  </div>
                  <AlertTriangle className="text-red-600" size={32} />
                </div>
              </div>

              <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme.textMuted} text-sm`}>Critical Risks</p>
                    <p className="text-3xl font-bold text-orange-600">
                      {predictions.filter((p) => p.riskLevel === "critical").length}
                    </p>
                  </div>
                  <TrendingUp className="text-orange-600" size={32} />
                </div>
              </div>

              <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme.textMuted} text-sm`}>Anomalies Detected</p>
                    <p className="text-3xl font-bold text-yellow-600">{anomalies.length}</p>
                  </div>
                  <AlertTriangle className="text-yellow-600" size={32} />
                </div>
              </div>
            </div>

            {/* Equipment Status Overview */}
            <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
              <h2 className={`text-xl font-bold ${theme.text} mb-4`}>
                Equipment Health Status
              </h2>

              {equipment.length === 0 ? (
                <div className={`text-center py-12 ${theme.textMuted}`}>
                  <p>No equipment loaded yet.</p>
                  <button onClick={openAddModal} className="text-green-600 font-medium hover:underline mt-2">
                    Add your first machine
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...equipment]
                    .sort((a, b) => b.id - a.id)
                    .map((eq) => {
                      const pred = predictions.find((p) => p.equipmentId === eq.id);
                      const ml = mlPredictions[eq.id];

                      return (
                        <div key={eq.id} className={`border ${theme.border} rounded-lg p-4 hover:shadow-md transition-shadow relative group ${darkMode ? 'bg-gray-600' : ''}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className={`font-semibold ${theme.text}`}>{eq.name}</h3>

                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  ml?.riskLevel === "critical"
                                    ? "bg-red-100 text-red-800"
                                    : ml?.riskLevel === "medium"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {ml?.riskLevel?.toUpperCase() || pred?.riskLevel?.toUpperCase() || eq.health?.toUpperCase() || "LOW"}
                              </span>

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

                          <p className={`text-xs ${theme.textMuted}`}>ID: {eq.id}</p>
                          <p className={`text-xs ${theme.textMuted}`}>Type: {eq.type}</p>
                          <p className={`text-xs ${theme.textMuted}`}>
                            Added: {eq.dateAdded ? formatDate(eq.dateAdded) : "—"}
                          </p>

                          {ml ? (
                            <div className="mt-3 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className={`text-xs ${theme.textMuted}`}>Failure Probability:</span>
                                <span className={`text-sm font-bold ${theme.text}`}>
                                  {(ml.probFailure * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className={`text-xs ${theme.textMuted}`}>Confidence:</span>
                                <span className={`text-sm font-bold ${theme.text}`}>
                                  {(ml.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                              {pred && (
                                <div className={`flex justify-between items-center pt-2 border-t ${theme.border}`}>
                                  <span className={`text-xs ${theme.textMuted}`}>Est. Failure:</span>
                                  <span className="text-sm font-bold text-blue-600">
                                    {pred.daysToFailure} days
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 text-center py-2">
                              <p className={`text-xs ${theme.textMuted}`}>
                                No ML predictions available
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
            {/* Live Status Banner */}
            {autoSimEnabled && (
              <div className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-3 animate-pulse">
                <Radio size={20} className="animate-ping" />
                <span className="font-medium">LIVE DATA STREAMING</span>
                <span className="text-green-100 text-sm">• Updating every 10 seconds</span>
              </div>
            )}

            {equipment.map((eq) => {
              const currentPoints = getChartPoints(eq.id);
              const chartData = getChartData(eq.id, currentPoints);
              const alertRegions = getAlertRegions(chartData);
              const thresholds = getThresholds(eq.id);
              const isSettingsOpen = expandedSettings[eq.id];
              const historyCount = (sensorHistory[eq.id] || []).length;

              return (
                <div key={eq.id} className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className={`text-xl font-bold ${theme.text}`}>
                        {eq.name} <span className={theme.textMuted}>({eq.id})</span>
                      </h2>
                      {autoSimEnabled && (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Live
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Data points selector */}
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${theme.textMuted}`}>Show:</span>
                        <select
                          value={currentPoints}
                          onChange={(e) => setChartPoints(eq.id, parseInt(e.target.value))}
                          className={`text-sm px-2 py-1 rounded border ${theme.input} ${theme.border}`}
                        >
                          {DATA_POINT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt} pts</option>
                          ))}
                        </select>
                      </div>
                      <span className={`text-sm ${theme.textMuted}`}>
                        {historyCount} total
                      </span>
                      <button
                        onClick={() => toggleSettings(eq.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          isSettingsOpen 
                            ? "bg-blue-100 text-blue-600" 
                            : `${theme.hover} ${theme.textMuted}`
                        }`}
                        title="Configure thresholds"
                      >
                        <Settings size={20} />
                      </button>
                      {/* Export dropdown */}
                      <div className="relative group">
                        <button
                          className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${theme.hover} ${theme.textMuted} border ${theme.border}`}
                          title="Export data"
                        >
                          <Download size={16} />
                          Export
                        </button>
                        <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-700 rounded shadow-lg border border-gray-200 dark:border-gray-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          <button
                            onClick={() => exportMachineData(eq.id, eq.name, "json")}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200"
                          >
                            Download JSON
                          </button>
                          <button
                            onClick={() => exportMachineData(eq.id, eq.name, "csv")}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200"
                          >
                            Download CSV
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData} margin={{ bottom: 60 }}>
                      <defs>
                        <linearGradient id={`criticalGradient-${eq.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fecaca" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#fecaca" stopOpacity={0.3} />
                        </linearGradient>
                        <linearGradient id={`warningGradient-${eq.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fed7aa" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#fed7aa" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#4b5563" : "#e5e7eb"} />
                      <XAxis 
                        dataKey="time" 
                        stroke={darkMode ? "#9ca3af" : "#6b7280"} 
                        fontSize={10}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ dy: 10 }}
                      />
                      <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? "#374151" : "#fff",
                          border: darkMode ? "1px solid #4b5563" : "1px solid #e5e7eb",
                          color: darkMode ? "#f3f4f6" : "#111827"
                        }}
                        formatter={(value, name, props) => {
                          const severity = props.payload?.severity;
                          const color = severity === 'critical' ? '#dc2626' : severity === 'medium' ? '#ea580c' : undefined;
                          return [value, name];
                        }}
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]) {
                            const severity = payload[0].payload?.severity;
                            const statusText = severity === 'critical' ? ' ⚠️ CRITICAL' : severity === 'medium' ? ' ⚡ WARNING' : '';
                            return `${label}${statusText}`;
                          }
                          return label;
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="temperature"
                        stroke="#ef4444"
                        name="Temperature"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          if (payload.severity === 'critical') {
                            return <circle cx={cx} cy={cy} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1} />;
                          } else if (payload.severity === 'medium') {
                            return <circle cx={cx} cy={cy} r={3} fill="#ea580c" stroke="#fff" strokeWidth={1} />;
                          }
                          return null;
                        }}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="vibration"
                        stroke="#3b82f6"
                        name="Vibration"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          if (payload.severity === 'critical') {
                            return <circle cx={cx} cy={cy} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1} />;
                          } else if (payload.severity === 'medium') {
                            return <circle cx={cx} cy={cy} r={3} fill="#ea580c" stroke="#fff" strokeWidth={1} />;
                          }
                          return null;
                        }}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="pressure"
                        stroke="#10b981"
                        name="Pressure"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          if (payload.severity === 'critical') {
                            return <circle cx={cx} cy={cy} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1} />;
                          } else if (payload.severity === 'medium') {
                            return <circle cx={cx} cy={cy} r={3} fill="#ea580c" stroke="#fff" strokeWidth={1} />;
                          }
                          return null;
                        }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  
                  {/* Severity Legend */}
                  <div className="flex items-center gap-4 mt-2 justify-center text-xs">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-red-600"></span>
                      <span className={theme.textMuted}>Critical</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                      <span className={theme.textMuted}>Warning</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                      <span className={theme.textMuted}>Normal (no dot)</span>
                    </div>
                  </div>

                  {/* Per-machine Settings Panel */}
                  {isSettingsOpen && (
                    <div className={`mt-4 pt-4 border-t ${theme.border}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <Settings size={18} className={theme.textMuted} />
                        <h3 className={`font-semibold ${theme.text}`}>Threshold Settings</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {["temperature", "vibration", "pressure"].map((sensor) => (
                          <div key={sensor} className={`p-3 rounded-lg border ${theme.border} ${darkMode ? 'bg-gray-600' : 'bg-gray-50'}`}>
                            <h4 className={`font-medium ${theme.text} capitalize mb-2`}>{sensor}</h4>
                            <div className="space-y-2">
                              <div>
                                <label className={`text-xs ${theme.textMuted}`}>Warning</label>
                                <input
                                  type="number"
                                  value={thresholds[sensor]?.warning || 0}
                                  onChange={(e) => updateMachineThreshold(eq.id, sensor, "warning", e.target.value)}
                                  className={`w-full px-2 py-1 text-sm border rounded ${theme.input}`}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${theme.textMuted}`}>Critical</label>
                                <input
                                  type="number"
                                  value={thresholds[sensor]?.critical || 0}
                                  onChange={(e) => updateMachineThreshold(eq.id, sensor, "critical", e.target.value)}
                                  className={`w-full px-2 py-1 text-sm border rounded ${theme.input}`}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
          <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-bold ${theme.text}`}>
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

            <div className={`${darkMode ? "bg-gray-600" : "bg-blue-50"} rounded-lg p-4 mb-4 border ${darkMode ? "border-gray-500" : "border-blue-200"}`}>
              <p className={`text-sm ${darkMode ? "text-gray-200" : "text-blue-800"} font-medium mb-1`}>How costs are calculated</p>
              <p className={`text-xs ${darkMode ? "text-gray-300" : "text-blue-700"}`}>
                <strong>Estimated Maintenance Cost</strong> is calculated based on equipment type, combining repair costs and production downtime losses. 
                <strong> Potential Savings</strong> represents the percentage saved by performing preventive maintenance vs emergency repairs. 
                Industry research shows reactive maintenance costs up to <strong>10x more</strong> than preventive maintenance (U.S. Dept. of Energy), 
                and predictive maintenance can reduce costs by <strong>8-40%</strong> compared to reactive approaches.
              </p>
            </div>

            <div className="space-y-4">
              {predictions
                .slice()
                .sort((a, b) => a.daysToFailure - b.daysToFailure)
                .map((pred, idx) => (
                  <div key={idx} className={`border ${theme.border} rounded-lg p-6 ${darkMode ? 'bg-gray-600' : ''}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className={`text-lg font-semibold ${theme.text}`}>
                          {pred.equipmentName}
                        </h3>
                        <p className={`text-sm ${theme.textMuted}`}>{pred.equipmentId}</p>
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
                        <p className={`text-sm ${theme.textMuted}`}>Est. Time to Failure</p>
                        <p className={`text-2xl font-bold ${theme.text}`}>
                          {pred.daysToFailure} days
                        </p>
                      </div>
                      <div>
                        <p className={`text-sm ${theme.textMuted}`}>Confidence</p>
                        <p className={`text-2xl font-bold ${theme.text}`}>
                          {(pred.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className={`text-sm ${theme.textMuted}`}>Est. Maintenance Cost</p>
                        <p className={`text-2xl font-bold ${theme.text}`}>
                          ${pred.estimatedCost.toFixed(0)}
                        </p>
                      </div>
                      <div>
                        <p className={`text-sm ${theme.textMuted}`}>Potential Savings</p>
                        <p className={`text-2xl font-bold ${theme.text}`}>
                          {pred.potentialSavings}%
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className={`text-sm font-medium ${theme.textMuted} mb-2`}>
                        Sensor Trends:
                      </p>
                      <div className="flex gap-4">
                        <span className={`text-sm ${theme.textMuted}`}>
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
          <div className={`${theme.card} rounded-lg shadow-md p-6 transition-colors duration-200`}>
            <h2 className={`text-xl font-bold ${theme.text} mb-4`}>Active Alerts</h2>
            
            <div className={`${darkMode ? "bg-gray-600" : "bg-blue-50"} rounded-lg p-4 mb-4 border ${darkMode ? "border-gray-500" : "border-blue-200"}`}>
              <p className={`text-sm ${darkMode ? "text-gray-200" : "text-blue-800"} font-medium mb-1`}>How alerts are calculated</p>
              <p className={`text-xs ${darkMode ? "text-gray-300" : "text-blue-700"}`}>
                Alerts use <strong>Z-score analysis</strong> based on ML training data. The Z-score measures how many standard deviations 
                a sensor reading is from the healthy baseline. A Z-score ≥ 2.5 triggers a <span className="text-yellow-600 font-medium">warning</span>, 
                while ≥ 3.2 triggers a <span className="text-red-600 font-medium">critical</span> alert. 
                Baselines are derived from real equipment failure datasets (air compressor, CNC milling, turbofan).
              </p>
            </div>

            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="mx-auto text-green-600 mb-2" size={48} />
                  <p className={theme.textMuted}>No active alerts</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`border ${theme.border} rounded-lg p-4 ${
                      alert.acknowledged ? (darkMode ? "bg-gray-700 opacity-60" : "bg-gray-50 opacity-60") : (darkMode ? "bg-gray-600" : "")
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
                          <span className={`font-semibold ${theme.text}`}>{alert.equipmentName}</span>
                          {alert.acknowledged && (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Acknowledged
                            </span>
                          )}
                        </div>

                        <p className={`text-sm ${theme.textMuted} mb-2`}>
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                        <p className={theme.text}>{alert.message}</p>
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
      </div>
    </div>
  );
};

export default PredictiveMaintenanceSystem;