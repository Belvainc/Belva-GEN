"use client";

import type { ReactNode } from "react";
import { useState } from "react";

interface ApprovalItem {
  id: string;
  ticketRef: string;
  planSummary: string;
  riskLevel: "low" | "medium" | "high";
  agentAssignments: string[];
  filesToChange: string[];
  createdAt: string;
}

export default function ApprovalsPage(): ReactNode {
  const [approvals] = useState<ApprovalItem[]>([]);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Pending Approvals
      </h2>

      {approvals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            No pending approvals
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {approval.ticketRef}
                  </h3>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      approval.riskLevel === "high"
                        ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                        : approval.riskLevel === "medium"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                          : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    }`}
                  >
                    {approval.riskLevel} risk
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    aria-label={`Approve plan for ${approval.ticketRef}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
                    aria-label={`Request changes for ${approval.ticketRef}`}
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    aria-label={`Reject plan for ${approval.ticketRef}`}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {approval.planSummary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
