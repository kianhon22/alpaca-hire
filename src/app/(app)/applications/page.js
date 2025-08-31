"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, doc, updateDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);

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
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        setUsers(usersSnap.docs.map((d)=>({ id: d.id, ...d.data() })));
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
    const deptById = new Map(departments.map((d)=>[d.id, d.name]));
    const jobIdToDeptName = new Map(jobs.map((j) => [j.id, deptById.get(j.departmentId) || j.department || "-"]));
    const userNameById = new Map(users.map((u)=>[u.id, u.name || u.email]));

    let list = apps.filter((a) => {
      if (jobId !== "all" && a.jobId !== jobId) return false;
      if (dept !== "all" && jobIdToDeptName.get(a.jobId) !== dept) return false;
      if (!term) return true;
      return [
        userNameById.get(a.applicantId),
        a.applicantName,
        a.applicantEmail,
        a.status,
        a.linkedinLink,
        a.portfolioLink,
      ]
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
  }, [apps, filters, jobs, departments, users]);

  // Modal state for details and scheduling
  const [detail, setDetail] = useState(null); // selected app row
  const [schedule, setSchedule] = useState({ open: false, app: null, date: "", time: "" });

  const renderActions = (a) => {
    const s = (a.status || "pending").toLowerCase();
    const actions = [];
    if (s === "pending" || s === "reviewing") {
      actions.push(
        <Button key="schedule" size="sm" className="bg-[#2b99ff]" onClick={(e)=>{ e.stopPropagation(); setSchedule({ open: true, app: a, date: "", time: "" }); }}>Schedule</Button>
      );
      actions.push(
        <Button key="reject" size="sm" variant="outline" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "rejected"); }}>Reject</Button>
      );
    } else if (s === "scheduled") {
      actions.push(
        <Button key="reschedule" size="sm" className="bg-[#2b99ff]" onClick={(e)=>{ e.stopPropagation(); setSchedule({ open: true, app: a, date: "", time: "" }); }}>Reschedule</Button>
      );
      actions.push(
        <Button key="cancel" size="sm" variant="outline" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "reviewing"); }}>Cancel</Button>
      );
    } else if (s === "hired") {
      actions.push(<span key="hired" className="text-xs text-green-600">Hired</span>);
    } else if (s === "rejected") {
      actions.push(<span key="rejected" className="text-xs text-gray-500">Rejected</span>);
    }
    return <div className="flex items-center gap-2">{actions}</div>;
  };

  const updateStatus = async (appId, status) => {
    try {
      await updateDoc(doc(db, "applications", appId), { status, updatedAt: new Date() });
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const sendEmailNotification = async ({ applicantEmail, managerEmail, hrEmail, subject, text }) => {
    try {
      const url = process.env.NEXT_PUBLIC_EMAIL_WEBHOOK;
      if (!url) return; // optional
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantEmail, managerEmail, hrEmail, subject, text }),
      });
    } catch (e) {
      console.warn("Email webhook not configured or failed", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl text-[#2b99ff]">
        <h1 className="text-3xl font-bold">Applications</h1>
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
        <table className="min-w-[1100px] w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border">Applicant</th>
              <th className="text-left p-2 border">Job Title</th>
              <th className="text-left p-2 border">Department</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Match%</th>
              <th className="text-left p-2 border">Links</th>
              <th className="text-left p-2 border">Date</th>
              <th className="text-left p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const job = jobs.find((j) => j.id === a.jobId);
              const deptName = departments.find((d)=>d.id===job?.departmentId)?.name || job?.department || "-";
              const applicantDisplay =
                users.find(u=>u.id===a.applicantId)?.name || a.applicantName || a.name || a.applicantId;
              const match = Number(a.matchPercent || a.match || 0);
              const createdAt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              return (
                <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>setDetail(a)}>
                  <td className="p-2 border">
                    <div className="font-medium">{applicantDisplay}</div>
                    <div className="text-xs text-gray-500">{a.applicantEmail || a.email || users.find(u=>u.id===a.applicantId)?.email || ""}</div>
                  </td>
                  <td className="p-2 border">{job?.title || a.jobTitle || a.jobId}</td>
                  <td className="p-2 border">{deptName}</td>
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
                    <div className="flex flex-col gap-1 text-xs" onClick={(e)=>e.stopPropagation()}>
                      {a.linkedinLink && <a href={a.linkedinLink} target="_blank" className="text-[#2b99ff] underline">LinkedIn</a>}
                      {a.portfolioLink && <a href={a.portfolioLink} target="_blank" className="text-[#2b99ff] underline">Portfolio</a>}
                      {a.supportDoc && <a href={a.supportDoc} target="_blank" className="text-[#2b99ff] underline">Resume</a>}
                    </div>
                  </td>
                  <td className="p-2 border">{createdAt?.toLocaleDateString?.() || '-'}</td>
                  <td className="p-2 border" onClick={(e)=>e.stopPropagation()}>{renderActions(a)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Details modal */}
      <Dialog open={!!detail} onOpenChange={(o)=>!o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Applicant details</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{detail.applicantName || detail.name || detail.applicantId}</div>
              <div className="text-gray-600">{detail.applicantEmail || detail.email}</div>
              <div className="text-gray-600 capitalize">Status: {detail.status}</div>
              <div className="text-gray-600">Phone: {detail.phone || "-"}</div>
              <div className="text-gray-600">Nationality: {detail.nationality || "-"}</div>
              <div className="text-gray-600">Experience: {detail.yearOfExperience || detail.numOfYearExperience || "-"}</div>
              <div className="text-gray-600">Job Id: {detail.jobId}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule modal */}
      <Dialog open={schedule.open} onOpenChange={(o)=>!o && setSchedule({ open:false, app:null, date:"", time:"" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="date" value={schedule.date} onChange={(e)=>setSchedule(s=>({ ...s, date: e.target.value }))} />
            <Input type="time" value={schedule.time} onChange={(e)=>setSchedule(s=>({ ...s, time: e.target.value }))} />
            <Button
              className="bg-[#2b99ff]"
              onClick={async ()=>{
                try {
                  if (!schedule.app) return;
                  const when = new Date(`${schedule.date}T${schedule.time}:00`);
                  await addDoc(collection(db, "interviews"), {
                    applicationId: schedule.app.id,
                    jobId: schedule.app.jobId,
                    applicantId: schedule.app.applicantId,
                    when: Timestamp.fromDate(when),
                    createdAt: new Date(),
                  });
                  await updateStatus(schedule.app.id, "scheduled");
                  // Optional webhook email
                  const job = jobs.find(j=>j.id===schedule.app.jobId);
                  const dept = departments.find(d=>d.id===job?.departmentId);
                  const manager = dept ? users.find(u=>u.id===dept.managerId) : null;
                  await sendEmailNotification({
                    applicantEmail: schedule.app.applicantEmail || users.find(u=>u.id===schedule.app.applicantId)?.email,
                    managerEmail: manager?.email,
                    hrEmail: process.env.NEXT_PUBLIC_HR_EMAIL,
                    subject: `Interview scheduled for ${when.toLocaleString()}`,
                    text: `Interview scheduled for ${when.toLocaleString()} for job ${job?.title || schedule.app.jobId}.`,
                  });
                } finally {
                  setSchedule({ open:false, app:null, date:"", time:"" });
                }
              }}
            >Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

