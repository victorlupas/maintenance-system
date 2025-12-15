import React, { useState } from "react";
import { api } from "../apiClient";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await api.post("/api/auth/register/", { username, email, password });

      // optional: auto-login right after register
      const loginRes = await api.post("/api/auth/login/", { username, password });
      localStorage.setItem("access", loginRes.data.access);
      localStorage.setItem("refresh", loginRes.data.refresh);

      window.location.href = "/";
    } catch (err) {
      const msg = err?.response?.data?.detail || "Signup failed";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form onSubmit={onSubmit} className="bg-white shadow-md rounded-lg p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Create account</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}

        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input
          className="w-full border rounded px-3 py-2 mb-3"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
        <input
          className="w-full border rounded px-3 py-2 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700">
          Sign up
        </button>

        <p className="text-sm text-gray-600 mt-3">
          Already have an account?{" "}
          <a className="text-blue-600 hover:underline" href="/login">
            Login
          </a>
        </p>
      </form>
    </div>
  );
}
