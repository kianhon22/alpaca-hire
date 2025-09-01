"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, doc, updateDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, } from "@/components/ui/chart"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react";
import React from "react";
import CircularProgress from "@/components/ui/CircularProgress";
import { useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow } from "lucide-react";
import ResetFiltersButton from "@/components/ui/reset-filter-button";

export default function ApplicationsPage() {

  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get("jobId") || searchParams.get("job") || "all";

  const [filters, setFilters] = useState({
    department: "all",
    jobId: jobIdFromUrl,     // ⬅️ preselect from URL
    matchOrder: "desc",
    q: "",
  });

  const [apps, setApps] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [screeningData, setScreeningData] = useState(null);

  const initialFilters = useMemo(
    () => ({ department: "all", jobId: "all", matchOrder: "desc", q: "" }),
    []
  );

  const handleResetFilters = () => {
    setFilters(initialFilters);
  };
  
  const matchOrderLabel = filters.matchOrder === "desc" ? "Highest match first" : "Lowest match first";

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

      // fetch applications
      const appsSnap = await getDocs(
        query(collection(db, "applications"), orderBy("createdAt", "desc"))
      );
      let rows = appsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // fetch screening data
      const screeningSnap = await getDocs(collection(db, "screening"));
      const screeningByAppId = new Map(
        screeningSnap.docs.map((d) => {
          const data = d.data();
          return [data.applicationId, data];
        })
      );

      // merge finalScore into apps
      rows = rows.map((app) => {
        const screen = screeningByAppId.get(app.id);
        return {
          ...app,
          matchPercent: screen?.finalScore ?? app.matchPercent ?? 0,
        };
      });

      setApps(rows);
    };
    load();
  }, []);

  useEffect(() => {
    const jid = searchParams.get("jobId") || searchParams.get("job") || "all";
    setFilters(f => (f.jobId === jid ? f : { ...f, jobId: jid }));
  }, [searchParams]);

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
    if (s === "pending") {
      actions.push(
        <Button key="accept" size="sm" className="bg-green-500" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "reviewing"); }}>Accept</Button>
      );
      actions.push(
        <Button key="reject" size="sm" variant="destructive" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "rejected"); }}>Reject</Button>
      );
    } else if (s === "reviewing") {
      actions.push(
        <Button key="schedule" size="sm" className="bg-[#2b99ff]" onClick={(e)=>{ e.stopPropagation(); setSchedule({ open: true, app: a, date: "", time: "" }); }}>Schedule</Button>
      );
      actions.push(
        <Button key="reject" size="sm" variant="destructive" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "rejected"); }}>Reject</Button>
      );
    } else if (s === "scheduled") {
      actions.push(
        <Button key="reschedule" size="sm" className="bg-[#2b99ff]" onClick={(e)=>{ e.stopPropagation(); setSchedule({ open: true, app: a, date: "", time: "" }); }}>Reschedule</Button>
      );
      actions.push(
        <Button key="set-pending" size="sm" variant="outline" className="bg-gray-100" onClick={(e)=>{ e.stopPropagation(); updateStatus(a.id, "pending"); }}>Set Pending</Button>
      );
    } else if (s === "hired") {
      actions.push(<span key="hired" className="text-xs text-green-600">Hired</span>);
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

  useEffect(() => {
    if (!detail) return;

    const loadScreening = async () => {
      try {
        const q = query(
          collection(db, "screening"),
          orderBy("createdAt", "desc") // optional, if you have multiple
        );
        const snap = await getDocs(q);
        const screening = snap.docs
          .map(d => d.data())
          .find(s => s.applicationId === detail.id);

        const job = jobs.find(j => j.id === detail.jobId);
        const totalJobSkills = job?.tags?.length || 0;

        setScreeningData(screening ? { ...screening, totalJobSkills } : null);
      } catch (e) {
        console.error("Failed to load screening data", e);
        setScreeningData(null);
      }
    };

    loadScreening();
  }, [detail]);

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
        <Select
          value={filters.matchOrder}
          onValueChange={(v) => setFilters((f) => ({ ...f, matchOrder: v }))}
        >
          <SelectTrigger className="w-[220px]">
            <div className="flex items-center gap-2 truncate">
              <ArrowDownWideNarrow className="h-4 w-4 text-gray-500" />
              <span className="truncate">{matchOrderLabel}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Highest match first</SelectItem>
            <SelectItem value="asc">Lowest match first</SelectItem>
          </SelectContent>
        </Select>
        <ResetFiltersButton
          onReset={handleResetFilters}
          currentFilters={filters}
          initialFilters={initialFilters}
          clearKeys={["jobId", "job", "department", "q", "matchOrder"]}  // remove these from URL if present
          iconOnly
          color="#000"
          className="-ml-1"   // tweak spacing if needed
        />
      </div>

      <div className="overflow-auto">
        <table className="min-w-[1100px] w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border">Applicant</th>
              <th className="text-left p-2 border">Job Title</th>
              <th className="text-left p-2 border">Department</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Match (%)</th>
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
              const status = (a.status || "pending").toLowerCase();
              const statusClass =
               status === "accepted" ? "bg-green-200 text-green-700" :
                status === "scheduled" ? "bg-blue-100 text-blue-700" :
                status === "reviewing" ? "bg-yellow-100 text-yellow-800" :
                status === "rejected" ? "bg-red-100 text-red-700" :
                status === "recruited" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";
              return (
                <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={()=>setDetail(a)}>
                  <td className="p-2 border">
                    <div className="font-medium">{applicantDisplay}</div>
                    <div className="text-xs text-gray-500">{a.applicantEmail || a.email || users.find(u=>u.id===a.applicantId)?.email || ""}</div>
                  </td>
                  <td className="p-2 border">{job?.title || a.jobTitle || a.jobId}</td>
                  <td className="p-2 border">{deptName}</td>
                  <td className="p-2 border capitalize">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded text-xs w-fit ${statusClass}`}>{status}</span>
                      {status === "scheduled" && a.interviewUrl && (
                        <a
                          href={a.interviewUrl}
                          target="_blank"
                          className="text-[#2b99ff] underline text-xs w-fit"
                          onClick={(e)=>e.stopPropagation()}
                        >
                          Interview Link
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-2 border">
                    <div className="flex justify-center">
                      <CircularProgress percentage={match} size={40} strokeWidth={4} />
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

      {/* Score Report details */}
      <Dialog open={!!detail} onOpenChange={(o)=>!o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={"font-bold"}>Candidate Report</DialogTitle>
          </DialogHeader>
          {screeningData && (
            <div className="space-y-4">
              {/* Radar Chart for Final Score Breakdown */}
              <Card>
                <CardHeader className="items-center">
                  <CardTitle>Score Breakdown</CardTitle>
                  <CardDescription className={"text-xs italic"}>
                    Breakdown of the applicant's skill match, resume relevance, and experience match.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  {/* Radar Chart */}
                  <ChartContainer
                    config={{
                      Skill: { label: "Skill Match", color: "var(--chart-1)" },
                      Resume: { label: "Resume Relevance", color: "var(--chart-2)" },
                      Experience: { label: "Experience Match", color: "var(--chart-3)" },
                    }}
                    className="mx-auto aspect-square max-h-[250px]"
                  >
                    <RadarChart
                      outerRadius={80}
                      width={250}
                      height={250}
                      data={[
                        { name: "Experience", value: screeningData.scoreBreakdown.experienceMatch },
                        { name: "Resume", value: screeningData.scoreBreakdown.resumeRelevance },
                        { name: "Skill", value: screeningData.scoreBreakdown.skillMatch },
                      ]}
                    >
                      <PolarGrid gridType="circle" />
                      <PolarAngleAxis dataKey="name" />
                      <Radar
                        dataKey="value"
                        fill="#2B99FF"
                        fillOpacity={0.6}
                        dot={{ r: 4, fillOpacity: 1 }}
                      />
                    </RadarChart>
                  </ChartContainer>
                  {/* Score Breakdown Table */}
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {[
                      { label: "Skill Match (60%)", value: screeningData.scoreBreakdown.skillMatch, color: "#CDB4DB" },
                      { label: "Resume Relevance (30%)", value: screeningData.scoreBreakdown.resumeRelevance, color: "#A2D2FF" },
                      { label: "Experience Match (10%)", value: screeningData.scoreBreakdown.experienceMatch, color: "#FFAFCC" },
                      { label: "Total Score", value: screeningData.finalScore, color: "#2B99FF" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="w-36 font-medium">
                          {item.label}
                          {item.label === "Total Score" && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="text-gray-600 w-4 h-4 cursor-pointer" />
                                </TooltipTrigger>
                                <TooltipContent className="bg-black text-white text-xs">
                                  Total score = 60% Skill Match + 30% Resume Relevance + 10% Experience Match
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </span>

                        {/* Percentage bar flex */}
                        <div className="flex-1 h-2 bg-gray-200 rounded relative">
                          <div
                            className="h-2 rounded"
                            style={{ width: `${item.value ?? 0}%`, backgroundColor: item.color }}
                          />
                          <span className="absolute right-0 text-xs text-gray-700 ml-1">{Math.round(item.value)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="items-center">
                  <CardTitle>Skills Breakdown</CardTitle>
                  <CardDescription className={"text-xs italic"}>
                    Breakdown of the applicant's skills.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  {/* Matched Skills */}
                  <h1 className="mb-2 font-semibold text-xs">Matched Skills (
                  {screeningData?.matchedSkills?.length ?? 0}/
                  {screeningData?.totalJobSkills ?? screeningData?.matchedSkills?.length ?? 0}
                  ): </h1>
                  <div className="grid grid-cols-2 gap-2 text-xs text-center mx-10">
                    <div className="font-semibold">Required Skill</div>
                    <div className="font-semibold">Applicant Skill</div>
                    {screeningData?.matchedSkills?.map((pair, idx) => (
                      <React.Fragment key={idx}>
                        <div className="px-2 py-1 font-medium rounded-full text-black bg-gray-200">{pair.jobSkill}</div>
                        <div className="px-2 py-1 font-medium rounded-full text-white bg-[#2B99FF]">{pair.applicantSkill}</div>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Applicant Skills */}
                  <h1 className="mb-2 mt-4 font-semibold text-xs">Applicant's skills: </h1>
                  <div className="flex flex-wrap gap-2">
                    {screeningData?.skillsExtracted?.map((skill, index) => {
                      const colors = ["#CDB4DB", "#FFC8DD", "#BDE0FE"];
                      const color = colors[index % colors.length];
                      return (
                        <span
                          key={skill}
                          className="px-2 py-1 rounded-full text-black text-xs font-medium"
                          style={{ backgroundColor: color }}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
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
          <div className="space-y-3 text-sm">
            <p>Select an external scheduler and paste its invite link (Teams/Meet/Zoom/etc.). We’ll store it and update the application status.</p>
            <Input placeholder="Paste invite URL" value={schedule.time} onChange={(e)=>setSchedule(s=>({ ...s, time: e.target.value }))} />
            <Button
              className="bg-[#2b99ff]"
              onClick={async ()=>{
                try {
                  if (!schedule.app) return;
                  const inviteUrl = schedule.time?.trim();
                  const docRef = await addDoc(collection(db, "interviews"), {
                    applicationId: schedule.app.id,
                    jobId: schedule.app.jobId,
                    applicantId: schedule.app.applicantId,
                    inviteUrl: inviteUrl || null,
                    createdAt: new Date(),
                  });
                  // Also store the interviewUrl on the application doc for quick rendering
                  await updateDoc(doc(db, "applications", schedule.app.id), { status: "scheduled", interviewUrl: inviteUrl || null });
                  setApps(prev => prev.map(a => a.id === schedule.app.id ? { ...a, status: "scheduled", interviewUrl: inviteUrl || null } : a));
                  // Optional webhook email
                  const job = jobs.find(j=>j.id===schedule.app.jobId);
                  const dept = departments.find(d=>d.id===job?.departmentId);
                  const manager = dept ? users.find(u=>u.id===dept.managerId) : null;
                  await sendEmailNotification({
                    applicantEmail: schedule.app.applicantEmail || users.find(u=>u.id===schedule.app.applicantId)?.email,
                    managerEmail: manager?.email,
                    hrEmail: process.env.NEXT_PUBLIC_HR_EMAIL,
                    subject: `Interview scheduled for ${job?.title || schedule.app.jobId}`,
                    text: `Link: ${inviteUrl || "(provided externally)"}`,
                  });
                } finally {
                  setSchedule({ open:false, app:null, date:"", time:"" });
                }
              }}
            >Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

