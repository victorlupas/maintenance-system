import React, { useEffect, useState } from "react";
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
} from "lucide-react";

import { api } from "../apiClient";

const PredictiveMaintenanceSystem = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sensorData, setSensorData] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [user, setUser] = useState(null);

  const [thresholds, setThresholds] = useState({
    temperature: { warning: 75, critical: 85 },
    vibration: { warning: 3.5, critical: 4.5 },
    pressure: { warning: 95, critical: 110 },
  });

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    window.location.href = "/login";
  };

  const fetchUser = async () => {
    try {
      const res = await api.get("/api/auth/me/");
      setUser(res.data);
    } catch (err) {
      logout();
    }
  };

  // Generate synthetic sensor data
  const generateSyntheticData = () => {
    setIsProcessing(true);

    const equipmentProfiles = [
      { id: "PUMP-001", name: "Hydraulic Pump A", type: "pump", health: "good" },
      { id: "MOTOR-002", name: "Conveyor Motor B", type: "motor", health: "warning" },
      { id: "COMP-003", name: "Air Compressor C", type: "compressor", health: "good" },
      { id: "BEAR-004", name: "Bearing Assembly D", type: "bearing", health: "critical" },
      { id: "VALVE-005", name: "Control Valve E", type: "valve", health: "good" },
    ];

    setEquipment(equipmentProfiles);

    const data = [];
    const now = Date.now();

    equipmentProfiles.forEach((eq) => {
      for (let i = 0; i < 100; i++) {
        const timestamp = now - (100 - i) * 3600000; // hourly data for last 100 hours
        const baseTemp = eq.health === "critical" ? 80 : eq.health === "warning" ? 70 : 65;
        const baseVib = eq.health === "critical" ? 4.0 : eq.health === "warning" ? 3.2 : 2.5;
        const basePres = eq.health === "critical" ? 105 : eq.health === "warning" ? 90 : 80;

        const anomalyFactor =
          eq.health === "critical" && i > 80 ? 1.15 : eq.health === "warning" && i > 90 ? 1.08 : 1;

        data.push({
          equipmentId: eq.id,
          equipmentName: eq.name,
          timestamp: new Date(timestamp).toISOString(),
          temperature: baseTemp + (Math.random() * 10 - 5) * anomalyFactor,
          vibration: baseVib + (Math.random() * 0.8 - 0.4) * anomalyFactor,
          pressure: basePres + (Math.random() * 15 - 7.5) * anomalyFactor,
          powerConsumption: 100 + Math.random() * 20,
        });
      }
    });

    setSensorData(data);
    performAnomalyDetection(data, equipmentProfiles);
    generatePredictions(data, equipmentProfiles);

    setTimeout(() => setIsProcessing(false), 700);
  };

  const performAnomalyDetection = (data, equipmentProfiles) => {
    const detected = [];

    equipmentProfiles.forEach((eq) => {
      const eqData = data.filter((d) => d.equipmentId === eq.id).slice(-24);

      eqData.forEach((reading) => {
        let anomalyScore = 0;
        const issues = [];

        if (reading.temperature > thresholds.temperature.critical) {
          anomalyScore += 0.4;
          issues.push("Critical temperature detected");
        } else if (reading.temperature > thresholds.temperature.warning) {
          anomalyScore += 0.2;
          issues.push("High temperature warning");
        }

        if (reading.vibration > thresholds.vibration.critical) {
          anomalyScore += 0.35;
          issues.push("Excessive vibration detected");
        } else if (reading.vibration > thresholds.vibration.warning) {
          anomalyScore += 0.15;
          issues.push("Elevated vibration levels");
        }

        if (reading.pressure > thresholds.pressure.critical) {
          anomalyScore += 0.25;
          issues.push("Pressure exceeds safe limits");
        } else if (reading.pressure > thresholds.pressure.warning) {
          anomalyScore += 0.1;
          issues.push("Pressure above normal range");
        }

        if (anomalyScore > 0.3) {
          detected.push({
            equipmentId: eq.id,
            equipmentName: eq.name,
            timestamp: reading.timestamp,
            anomalyScore: Math.min(anomalyScore, 1),
            severity: anomalyScore > 0.6 ? "critical" : "warning",
            issues,
            explanation: `Detected ${issues.length} anomalous pattern(s): ${issues.join(", ")}`,
          });
        }
      });
    });

    setAnomalies(detected.slice(-20));
    generateAlerts(detected);
  };

  const calculateTrend = (values) => {
    if (values.length < 2) return 0;
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  };

  const generatePredictions = (data, equipmentProfiles) => {
    const results = [];

    equipmentProfiles.forEach((eq) => {
      const eqData = data.filter((d) => d.equipmentId === eq.id).slice(-48);

      const tempTrend = calculateTrend(eqData.map((d) => d.temperature));
      const vibTrend = calculateTrend(eqData.map((d) => d.vibration));
      const presTrend = calculateTrend(eqData.map((d) => d.pressure));

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

      results.push({
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
          temperature: tempTrend > 0.1 ? "increasing" : tempTrend < -0.1 ? "decreasing" : "stable",
          vibration: vibTrend > 0.05 ? "increasing" : vibTrend < -0.05 ? "decreasing" : "stable",
          pressure: presTrend > 0.2 ? "increasing" : presTrend < -0.2 ? "decreasing" : "stable",
        },
        estimatedCost:
          riskLevel === "critical"
            ? 5000 + Math.random() * 3000
            : riskLevel === "medium"
            ? 2000 + Math.random() * 2000
            : 500 + Math.random() * 1000,
      });
    });

    setPredictions(results);
  };

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
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  };

  const exportData = (type) => {
    let data;
    let filename;

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

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
        temperature: Number(d.temperature.toFixed(1)),
        vibration: Number(d.vibration.toFixed(2)),
        pressure: Number(d.pressure.toFixed(1)),
      }));
  };

  useEffect(() => {
    fetchUser();
    generateSyntheticData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SME Predictive Maintenance System</h1>
              <p className="text-gray-600 mt-2">AI-powered equipment monitoring and failure prediction</p>
              {user && (
                <p className="text-sm text-gray-700 mt-2">
                  Logged in as <strong>{user.username}</strong>
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={generateSyntheticData}
                disabled={isProcessing}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                <Activity size={20} />
                {isProcessing ? "Processing..." : "Refresh Data"}
              </button>

              <button
                onClick={logout}
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b">
            {["dashboard", "equipment", "anomalies", "predictions", "alerts", "settings"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium capitalize ${
                  activeTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard */}
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
                    <p className="text-3xl font-bold text-red-600">
                      {alerts.filter((a) => !a.acknowledged).length}
                    </p>
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
              <h2 className="text-xl font-bold text-gray-900 mb-4">Equipment Health Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {equipment.map((eq) => {
                  const pred = predictions.find((p) => p.equipmentId === eq.id);
                  return (
                    <div key={eq.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{eq.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            pred?.riskLevel === "critical"
                              ? "bg-red-100 text-red-800"
                              : pred?.riskLevel === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {pred?.riskLevel || "good"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">ID: {eq.id}</p>
                      {pred && <p className="text-sm text-gray-700">Est. failure: {pred.daysToFailure} days</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Equipment */}
        {activeTab === "equipment" && (
          <div className="space-y-6">
            {equipment.map((eq) => {
              const chartData = getChartData(eq.id);
              return (
                <div key={eq.id} className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    {eq.name} ({eq.id})
                  </h2>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="temperature" stroke="#ef4444" name="Temperature (°C)" />
                      <Line type="monotone" dataKey="vibration" stroke="#3b82f6" name="Vibration (mm/s)" />
                      <Line type="monotone" dataKey="pressure" stroke="#10b981" name="Pressure (PSI)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}

        {/* Anomalies */}
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
              {anomalies.map((anomaly, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            anomaly.severity === "critical"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {anomaly.severity.toUpperCase()}
                        </span>
                        <span className="font-semibold">{anomaly.equipmentName}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{new Date(anomaly.timestamp).toLocaleString()}</p>
                      <p className="text-gray-700">{anomaly.explanation}</p>
                      <div className="mt-2">
                        <span className="text-sm font-medium">Anomaly Score: </span>
                        <span className="text-sm">{(anomaly.anomalyScore * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {anomalies.length === 0 && <p className="text-gray-600">No anomalies detected.</p>}
            </div>
          </div>
        )}

        {/* Predictions */}
        {activeTab === "predictions" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Failure Predictions & Recommendations</h2>
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
                        <h3 className="text-lg font-semibold text-gray-900">{pred.equipmentName}</h3>
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
                        <p className="text-2xl font-bold text-gray-900">{pred.daysToFailure} days</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Confidence</p>
                        <p className="text-2xl font-bold text-gray-900">{(pred.confidence * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Est. Maintenance Cost</p>
                        <p className="text-2xl font-bold text-gray-900">${pred.estimatedCost.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Potential Savings</p>
                        <p className="text-2xl font-bold text-green-600">30%</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded p-4">
                      <div className="flex items-start gap-2">
                        <Calendar className="text-blue-600 mt-1" size={20} />
                        <div>
                          <p className="font-medium text-blue-900">Recommended Action:</p>
                          <p className="text-blue-800">{pred.recommendedAction}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

              {predictions.length === 0 && <p className="text-gray-600">No predictions available.</p>}
            </div>
          </div>
        )}

        {/* Alerts */}
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
                    className={`border rounded-lg p-4 ${alert.acknowledged ? "bg-gray-50 opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              alert.severity === "critical" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold">{alert.equipmentName}</span>
                          {alert.acknowledged && (
                            <span className="text-xs text-green-600 font-medium">✓ Acknowledged</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{new Date(alert.timestamp).toLocaleString()}</p>
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

        {/* Settings */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Threshold Configuration</h2>

            <div className="space-y-6">
              {Object.entries(thresholds).map(([sensor, values]) => (
                <div key={sensor} className="border rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4 capitalize">{sensor}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Warning Threshold</label>
                      <input
                        type="number"
                        value={values.warning}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            [sensor]: { ...prev[sensor], warning: parseFloat(e.target.value) },
                          }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Critical Threshold</label>
                      <input
                        type="number"
                        value={values.critical}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            [sensor]: { ...prev[sensor], critical: parseFloat(e.target.value) },
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
              <button onClick={generateSyntheticData} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
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
