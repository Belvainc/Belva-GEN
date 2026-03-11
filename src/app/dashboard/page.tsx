import type { ReactNode } from "react";

export default function DashboardOverviewPage(): ReactNode {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Agent Overview
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Agent status cards will be rendered here */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Active Agents
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            —
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Tasks In Progress
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            —
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Pending Approvals
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            —
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Completed Today
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            —
          </p>
        </div>
      </div>
    </div>
  );
}
