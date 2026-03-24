"use client";

import { useState } from "react";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-gray-500">
          Configure your Ravenhill instance
        </p>
      </div>

      <div className="space-y-8">
        {/* Connection */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Connection</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                API Server URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
              />
              <p className="text-[10px] text-gray-600 mt-1">
                The FastAPI backend URL. Default: http://localhost:8000
              </p>
            </div>
          </div>
        </section>

        {/* Agent Behavior */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Agent Behavior</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">
                  Require approval for document sharing
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Human-in-the-loop for all cross-department file shares
                </div>
              </div>
              <button
                onClick={() => setApprovalRequired(!approvalRequired)}
                className={`w-10 h-6 rounded-full transition relative ${
                  approvalRequired ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${
                    approvalRequired ? "left-5" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">Notifications</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Show notifications when agents complete actions
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-10 h-6 rounded-full transition relative ${
                  notificationsEnabled ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${
                    notificationsEnabled ? "left-5" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Integrations</h2>
          <div className="space-y-3">
            {[
              { name: "Slack", status: "Not connected" },
              { name: "Microsoft Teams", status: "Not connected" },
              { name: "Gmail", status: "Not connected" },
              { name: "Google Calendar", status: "Not connected" },
            ].map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <div className="text-sm text-gray-200">
                    {integration.name}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {integration.status}
                  </div>
                </div>
                <button className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800/30 px-3 py-1.5 rounded-lg hover:border-blue-700 transition">
                  Connect
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          <Save className="w-4 h-4" />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
