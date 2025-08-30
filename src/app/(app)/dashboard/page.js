"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getCountFromServer, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Simple badge component
function KpiCard({ label, value, delta, children }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-3xl font-semibold text-gray-900">{value}</div>
        {typeof delta === "number" && (
          <span className={[
            "text-xs px-2 py-0.5 rounded-full",
            delta >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
          ].join(" ")}>{delta >= 0 ? `+${delta}%` : `${delta}%`}</span>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const now = new Date();
  const [filters, setFilters] = useState({
    jobId: "all",
    year: String(now.getFullYear()), // e.g., "2025" or "all"
    month: "all", // 1-12 or 'all'
    department: "all", // department name from jobs or configured departments
  });

  const [stats, setStats] = useState({
    totalJobs: 0,
    openJobs: 0,
    applicants: 0,
    interviews: 0,
    offers: 0,
    hires: 0,
    onboardingInProgress: 0,
    onboardingCompleted: 0,
  });

  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]); // from configuration if present

  // Live jobs list for filters
  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJobs(rows);
    });
    return () => unsub();
  }, []);

  // Load departments if configured
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const snap = await getDocs(collection(db, "departments"));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDepartments(rows);
      } catch (e) {
        // collection may not exist yet; ignore
      }
    };
    loadDepts();
  }, []);

  // Compute KPIs via aggregate counts based on filter
  useEffect(() => {
    const load = async () => {
      // Build time range based on year/month filters
      const y = filters.year === "all" ? undefined : Number(filters.year);
      const m = filters.month === "all" ? undefined : Number(filters.month) - 1; // JS month 0-11
      let startTime = 0;
      let endTime = Number.MAX_SAFE_INTEGER;
      if (y !== undefined && m === undefined) {
        startTime = new Date(y, 0, 1).getTime();
        endTime = new Date(y + 1, 0, 1).getTime();
      } else if (y !== undefined && m !== undefined) {
        startTime = new Date(y, m, 1).getTime();
        endTime = new Date(y, m + 1, 1).getTime();
      }

      // jobs
      const jobsBase = collection(db, "jobs");
      const jobConds = [];
      if (filters.department !== "all") jobConds.push(where("departmentId", "==", filters.department));
      if (startTime) jobConds.push(where("createdAt", ">=", new Date(startTime)));
      if (endTime !== Number.MAX_SAFE_INTEGER) jobConds.push(where("createdAt", "<", new Date(endTime)));
      const jobsQuery = jobConds.length ? query(jobsBase, ...jobConds) : jobsBase;
      const jobsCount = await getCountFromServer(jobsQuery);
      const openJobsCount = await getCountFromServer(query(jobsQuery, where("status", "==", "open")));

      // applications
      const appsBase = collection(db, "applications");
      // Department filter for applications:
      // derive jobIds for selected department (or keep all)
      let jobIds = [];
      if (filters.department !== "all") {
        const deptJobsSnap = await getDocs(query(collection(db, "jobs"), where("departmentId", "==", filters.department)));
        jobIds = deptJobsSnap.docs.map((d) => d.id);
      }

      const timeConds = [];
      if (startTime) timeConds.push(where("createdAt", ">=", new Date(startTime)));
      if (endTime !== Number.MAX_SAFE_INTEGER) timeConds.push(where("createdAt", "<", new Date(endTime)));

      // Helper to aggregate counts optionally chunking jobIds for 'in' queries (max 10)
      const chunks = (arr, size) => {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const sumCounts = async (qBase, extraWhere = []) => {
        if (filters.jobId !== "all") {
          const qy = query(qBase, where("jobId", "==", filters.jobId), ...timeConds, ...extraWhere);
          const c = await getCountFromServer(qy);
          return c.data().count;
        }
        if (filters.department !== "all") {
          let total = 0;
          for (const part of chunks(jobIds, 10)) {
            if (part.length === 0) continue;
            const qy = query(qBase, where("jobId", "in", part), ...timeConds, ...extraWhere);
            const c = await getCountFromServer(qy);
            total += c.data().count;
          }
          return total;
        }
        const qy = timeConds.length ? query(qBase, ...timeConds, ...extraWhere) : qBase;
        const c = await getCountFromServer(qy);
        return c.data().count;
      };

      const applicantsCount = await sumCounts(appsBase);
      const interviewsCount = await sumCounts(appsBase, [where("status", "==", "interview")]);
      const offersCount = await sumCounts(appsBase, [where("status", "==", "offer")]);
      const hiresCount = await sumCounts(appsBase, [where("status", "==", "hired")]);

      // onboarding
      // Use users.status as a proxy for onboarding
      const usersBase = collection(db, "users");
      const userConds = [];
      if (startTime) userConds.push(where("createdAt", ">=", new Date(startTime)));
      if (endTime !== Number.MAX_SAFE_INTEGER) userConds.push(where("createdAt", "<", new Date(endTime)));
      if (filters.department !== "all") {
        userConds.push(where("departmentId", "==", filters.department));
      }
      const usersInProgress = await getCountFromServer(query(usersBase, ...userConds, where("status", "in", ["pending", "in_progress"])));
      const usersCompleted = await getCountFromServer(query(usersBase, ...userConds, where("status", "in", ["completed", "active"])));

      setStats({
        totalJobs: jobsCount.data().count,
        openJobs: openJobsCount.data().count,
        applicants: applicantsCount.data().count,
        interviews: interviewsCount,
        offers: offersCount,
        hires: hiresCount,
        onboardingInProgress: usersInProgress.data().count,
        onboardingCompleted: usersCompleted.data().count,
      });
    };
    load();
  }, [filters, departments]);

  const jobOptions = useMemo(() => [{ id: "all", title: "All jobs" }, ...jobs], [jobs]);
  const yearOptions = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    jobs.forEach((j) => { if (j.createdAt?.toDate) years.add(j.createdAt.toDate().getFullYear()); });
    return ["all", ...Array.from(years).sort((a,b)=>b-a).map(String)];
  }, [jobs]);
  const deptOptions = useMemo(() => {
    if (departments.length) return ["all", ...departments.map((d) => d.id)];
    const uniques = Array.from(new Set(jobs.map((j) => j.departmentId).filter(Boolean)));
    return ["all", ...uniques];
  }, [departments, jobs]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl text-[#2b99ff]">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      {/* filters */}
      <div className="flex items-center flex-wrap gap-3">
        <select
          value={filters.department}
          onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
          className="border rounded-md px-3 py-2 bg-white"
        >
          {deptOptions.map((d) => (
            <option key={d} value={d}>{d === "all" ? "All departments" : (departments.find(x=>x.id===d)?.name || d)}</option>
          ))}
        </select>
        <select
          value={filters.year}
          onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
          className="border rounded-md px-3 py-2 bg-white"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y === "all" ? "All years" : y}</option>
          ))}
        </select>
        <select
          value={filters.month}
          onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
          className="border rounded-md px-3 py-2 bg-white"
        >
          <option value="all">All months</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
            <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString(undefined, { month: 'long' })}</option>
          ))}
        </select>
        <select
          value={filters.jobId}
          onChange={(e) => setFilters((f) => ({ ...f, jobId: e.target.value }))}
          className="border rounded-md px-3 py-2 bg-white"
        >
          {jobOptions.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Total Jobs</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.totalJobs}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Open Jobs</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.openJobs}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Applicants</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.applicants}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Interviews</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.interviews}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Offers</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.offers}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Hires</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.hires}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Onboarding - In Progress</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.onboardingInProgress}</div>
        </div>
        <div className="border-t-4 border-[#2b99ff] rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Onboarding - Completed</div>
          <div className="text-3xl font-semibold text-gray-900 mt-2">{stats.onboardingCompleted}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Pipeline overview</h3>
            <span className="text-xs text-gray-500">by stage</span>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {["Applied", "Screen", "Interview", "Offer", "Hired"].map((stage, idx) => (
              <div key={stage} className="p-3 rounded-lg border bg-gray-50">
                <div className="text-sm text-gray-500">{stage}</div>
                <div className="text-xl font-semibold mt-1">{
                  [stats.applicants, Math.max(0, stats.applicants - 5), stats.interviews, stats.offers, stats.hires][idx]
                }</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold">Onboarding completion</h3>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span>Completed</span>
              <span>{stats.onboardingCompleted}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded mt-1">
              <div
                className="h-2 rounded"
                style={{ backgroundColor: '#2b99ff', width: `${stats.onboardingCompleted + stats.onboardingInProgress === 0 ? 0 : Math.round((stats.onboardingCompleted / (stats.onboardingCompleted + stats.onboardingInProgress)) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm mt-3">
              <span>In progress</span>
              <span>{stats.onboardingInProgress}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
