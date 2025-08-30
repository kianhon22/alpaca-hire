"use client";

import { useMemo } from "react";

// Temporary read-only page to display proposed collections and fields
export default function FirestorePlanPage() {
  const schema = useMemo(() => ([
    {
      name: "users",
      docId: "{auth.uid}",
      fields: [
        ["uid", "string"],
        ["email", "string"],
        ["role", "'employee' | 'departmentManager' | 'companyHR'"],
        ["createdAt", "timestamp"],
        ["lastLogin", "timestamp"],
      ],
    },
    {
      name: "jobs",
      docId: "auto-id",
      fields: [
        ["title", "string"],
        ["department", "string"],
        ["location", "string"],
        ["status", "'open' | 'closed'"],
        ["createdAt", "timestamp"],
        ["tags", "string[]  // e.g., skills"],
        ["hiringManagerId", "string (users.uid)"],
      ],
    },
    {
      name: "candidates",
      docId: "auto-id",
      fields: [
        ["name", "string"],
        ["email", "string"],
        ["phone", "string"],
        ["resumeUrl", "string"],
        ["skills", "string[]"],
        ["tags", "string[]"],
        ["jobId", "string (jobs.id)"],
        ["status", "'new'|'screening'|'interview'|'offer'|'hired'|'rejected'"],
        ["createdAt", "timestamp"],
        ["matchScore", "number 0..100"],
      ],
      subcollections: [
        {
          name: "notes",
          fields: [
            ["authorId", "string (users.uid)"],
            ["text", "string"],
            ["createdAt", "timestamp"],
          ],
        },
        {
          name: "events",
          fields: [
            ["type", "'email' | 'status_change' | 'schedule'"],
            ["payload", "map"],
            ["createdAt", "timestamp"],
          ],
        },
      ],
    },
    {
      name: "applications",
      docId: "auto-id",
      fields: [
        ["candidateId", "string (candidates.id)"],
        ["jobId", "string (jobs.id)"],
        ["stage", "'applied'|'screen'|'interview'|'offer'|'hired'|'rejected'"],
        ["createdAt", "timestamp"],
      ],
    },
    {
      name: "onboarding",
      docId: "auto-id",
      fields: [
        ["userId", "string (users.uid)"],
        ["jobId", "string (jobs.id)"],
        ["status", "'in_progress'|'completed'"],
        ["createdAt", "timestamp"],
        ["completedTasks", "string[]"],
      ],
      subcollections: [
        {
          name: "tasks",
          fields: [
            ["title", "string"],
            ["type", "'document'|'video'|'form'|'checklist'"],
            ["url", "string"],
            ["required", "boolean"],
            ["order", "number"],
          ],
        },
      ],
    },
  ]), []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Firestore data model (temporary)</h1>
      <p className="text-gray-600">High-level overview of collections, fields, and suggested subcollections.</p>
      <div className="space-y-4">
        {schema.map((col) => (
          <div key={col.name} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">/{col.name}</h2>
              <span className="text-xs text-gray-500">docId: {col.docId}</span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Fields</div>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {col.fields.map(([f,t]) => (
                  <li key={f} className="text-sm text-gray-700"><span className="font-mono">{f}</span>: <span className="text-gray-500">{t}</span></li>
                ))}
              </ul>
            </div>
            {col.subcollections && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-1">Subcollections</div>
                {col.subcollections.map((sub) => (
                  <div key={sub.name} className="border rounded-md p-3 mb-2">
                    <div className="font-medium">/{col.name}/{{docId}}/{sub.name}</div>
                    <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {sub.fields.map(([f,t]) => (
                        <li key={f} className="text-sm text-gray-700"><span className="font-mono">{f}</span>: <span className="text-gray-500">{t}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


