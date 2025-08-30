"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [filters, setFilters] = useState({
    department: "all",
    jobId: "all",
    matchOrder: "desc", // desc | asc
    q: "",
  });

  useEffect(() => {
    const load = async () => {
      const jobsSnap = await getDocs(collection(db, "jobs"));
      const jobsList = jobsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJobs(jobsList);
      try {
        const deptSnap = await getDocs(collection(db, "departments"));
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {}

      // base applications query (we keep it client-side filtered for simplicity)
      const appsSnap = await getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc")));
      const rows = appsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setApps(rows);
    };
    load();
  }, []);

  const deptOptions = useMemo(() => {
    if (departments.length) return ["all", ...departments.map((d) => d.name)];
    const uniques = Array.from(new Set(jobs.map((j) => j.department).filter(Boolean)));
    return ["all", ...uniques];
  }, [departments, jobs]);

  const jobOptions = useMemo(() => [
    { id: "all", title: "All job titles" },
    ...jobs
  ], [jobs]);

  const filtered = useMemo(() => {
    const term = filters.q.trim().toLowerCase();
    const jobId = filters.jobId;
    const dept = filters.department;
    const jobIdToDept = new Map(jobs.map((j) => [j.id, j.department]));

    let list = apps.filter((a) => {
      if (jobId !== "all" && a.jobId !== jobId) return false;
      if (dept !== "all" && jobIdToDept.get(a.jobId) !== dept) return false;
      if (!term) return true;
      return [a.applicantName, a.applicantEmail, a.status, a.linkedinLink, a.portfolioLink]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    list.sort((a, b) => {
      const av = Number(a.matchPercent || a.match || 0);
      const bv = Number(b.matchPercent || b.match || 0);
      return filters.matchOrder === "desc" ? bv - av : av - bv;
    });

    return list;
  }, [apps, filters, jobs]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-[#2b99ff] to-[#7fc4ff] text-white p-6">
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="opacity-90">Review applicants and prioritize by match</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search name/email/link/status"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          className="w-72"
        />
        <Select value={filters.department} onValueChange={(v) => setFilters((f) => ({ ...f, department: v }))}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {deptOptions.map((d) => (
              <SelectItem key={d} value={d}>{d === "all" ? "All departments" : d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.jobId} onValueChange={(v) => setFilters((f) => ({ ...f, jobId: v }))}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Job title" />
          </SelectTrigger>
          <SelectContent>
            {jobOptions.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.matchOrder} onValueChange={(v) => setFilters((f) => ({ ...f, matchOrder: v }))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Match%: High → Low</SelectItem>
            <SelectItem value="asc">Match%: Low → High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[900px] w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border">Applicant</th>
              <th className="text-left p-2 border">Job Title</th>
              <th className="text-left p-2 border">Department</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Match%</th>
              <th className="text-left p-2 border">Links</th>
              <th className="text-left p-2 border">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const job = jobs.find((j) => j.id === a.jobId);
              const dept = job?.department || "-";
              const match = Number(a.matchPercent || a.match || 0);
              const createdAt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="p-2 border">
                    <div className="font-medium">{a.applicantName || a.name || a.applicantId}</div>
                    <div className="text-xs text-gray-500">{a.applicantEmail || a.email || ""}</div>
                  </td>
                  <td className="p-2 border">{job?.title || a.jobTitle || a.jobId}</td>
                  <td className="p-2 border">{dept}</td>
                  <td className="p-2 border capitalize">{a.status || "applied"}</td>
                  <td className="p-2 border">
                    <div className="w-36">
                      <div className="text-xs mb-1">{match}%</div>
                      <div className="h-2 bg-gray-200 rounded">
                        <div className="h-2 rounded" style={{ width: `${match}%`, backgroundColor: '#2b99ff' }} />
                      </div>
                    </div>
                  </td>
                  <td className="p-2 border">
                    <div className="flex flex-col gap-1 text-xs">
                      {a.linkedinLink && <a href={a.linkedinLink} target="_blank" className="text-[#2b99ff] underline">LinkedIn</a>}
                      {a.portfolioLink && <a href={a.portfolioLink} target="_blank" className="text-[#2b99ff] underline">Portfolio</a>}
                      {a.supportDoc && <a href={a.supportDoc} target="_blank" className="text-[#2b99ff] underline">Resume</a>}
                    </div>
                  </td>
                  <td className="p-2 border">{createdAt?.toLocaleDateString?.() || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

