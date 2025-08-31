'use client'
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { collection, getDocs, query, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoaderCircle, MoreHorizontal, Pencil, Trash, UserRoundCheck, UserRoundSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TalentPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]); // Store job lists
  const [departments, setDepartments] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobDepartment, setJobDepartment] = useState("");
  // managerId will be derived from selected department
  const [numOfOpenPosition, setNumOfOpenPosition] = useState(1);
  const [numOfYearExperience, setNumOfYearExperience] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");

  const [managers, setManagers] = useState([]); // Store manager lists (still used to display names if needed)

  const [openDropdownJobId, setOpenDropdownJobId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ id: "", title: "", description: "", departmentId: "", numOfOpenPosition: 1, numOfYearExperience: 1, tagsText: "" });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc"); // desc = newest first

  const recomputeCounts = (arr) => {
    let active = 0; let closed = 0;
    for (const j of arr) j.status === "open" ? active++ : j.status === "closed" ? closed++ : null;
    setActiveCount(active); setClosedCount(closed);
  };

  const updateJobStatus = async (jobId, status) => {
    try {
      await updateDoc(doc(db, "jobs", jobId), { status, updatedAt: new Date() });
      setJobs(prev => { const next = prev.map(j => j.id === jobId ? { ...j, status } : j); recomputeCounts(next); return next; });
    } catch (e) {
      console.error("Failed to update job status", e);
    }
  };

  const deleteJob = async (jobId) => {
    try {
      await updateDoc(doc(db, "jobs", jobId), { status: "deleted", updatedAt: new Date() });
      setJobs(prev => { const next = prev.filter(j => j.id !== jobId); recomputeCounts(next); return next; });
    } catch (e) {
      console.error("Failed to delete job", e);
    }
  };
  
  // Fetch 'jobs' database
  useEffect(() => {
    async function fetchJobs() {
      try {
        const querySnapshot = await getDocs(collection(db, "jobs"));
        let active = 0;
        let closed = 0;
        const allJobs = [];

        for (const docSnap of querySnapshot.docs) {
          const jobData = { id: docSnap.id, ...docSnap.data() };
          if (jobData.status === "open") active++;
          if (jobData.status === "closed") closed++;

          // Count applications for this job
          const appsSnap = await getDocs(
            query(collection(db, "applications"), where("jobId", "==", docSnap.id))
          );
          const applications = appsSnap.docs.map(d => d.data());

          jobData.applicantsCount = applications.length;
          jobData.recruitedCount = applications.filter(a => a.status === "accepted").length;

          allJobs.push(jobData);
        }

        setJobs(allJobs);
        setActiveCount(active);
        setClosedCount(closed);

      } catch (error) {
        console.error("Error fetching jobs:", error);
      }
    }

    fetchJobs();
  }, []);

  // Fetch departments
  useEffect(() => {
    async function fetchDepts() {
      try {
        const snap = await getDocs(collection(db, "departments"));
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error fetching departments:", e);
      }
    }
    fetchDepts();
  }, []);

  // Filter & fetch manager frm 'users' database
  useEffect(() => {
    async function fetchManagers() {
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "departmentManager")
        );
        const querySnapshot = await getDocs(q);
        const allManagers = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          allManagers.push({ id: doc.id, ...data });
        });
        setManagers(allManagers);
      } catch (error) {
        console.error("Error fetching managers:", error);
      }
    }

    fetchManagers();
  }, []);

  // Store New Job
  const onSubmit=async(e)=>{
    e.preventDefault()
    setLoading(true)
    
    console.log(jobTitle, jobDescription, jobDepartment, jobManager, numOfOpenPosition, numOfYearExperience, requiredSkills)
    console.log(requiredSkills.split(",").map(skill => skill.trim()))
    try {
      const dept = departments.find(d => d.id === jobDepartment);
      await addDoc(collection(db, "jobs"), {
        title: jobTitle,
        description: jobDescription,
        departmentId: jobDepartment || null,
        managerId: dept?.managerId || null,
        status: "open", // default status
        createdAt: serverTimestamp(),
        tags: requiredSkills ? requiredSkills.split(",").map(skill => skill.trim()) : [],
        numOfOpenPosition: Number(numOfOpenPosition) || 1,
        numOfYearExperience: Number(numOfYearExperience) || 1,
      });

      console.log("Job posted successfully!");

      setJobFormOpen(false);
      setJobTitle("");
      setJobDescription("");
      setJobDepartment("");
      // manager auto-assigned from department
      setNumOfOpenPosition("");
      setNumOfYearExperience("");
      setRequiredSkills("");
    } catch (error) {
      console.error("Error adding job:", error);
    } finally {
      setLoading(false)
    }
  }

  // Filtering & sorting
  const filteredJobs = jobs
    .filter((job) => {
      // search filter
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        job.title?.toLowerCase().includes(term) ||
        job.description?.toLowerCase().includes(term) ||
        job.tags?.some((tag) => tag.toLowerCase().includes(term));

      // department filter
      const matchesDept =
        selectedDept === "all" || job.departmentId === selectedDept;

      return matchesSearch && matchesDept;
    })
    .sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      const aDate = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const bDate = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return sortOrder === "desc" ? bDate - aDate : aDate - bDate;
    });
  
  return (
    <div className="space-y-6">
      {/* <SidebarTrigger /> */}
      <div className="flex items-center justify-between mb-4 rounded-xl text-[#2b99ff]">
        <h1 className="text-3xl font-bold">Recruitment</h1>
        <Button onClick={()=>setJobFormOpen(true)}>+ New Job</Button>
      </div>

      {/* Filters UI */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Input
          placeholder="Search jobs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />

        <Select value={selectedDept} onValueChange={setSelectedDept}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Sort by Date Posted" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest First</SelectItem>
            <SelectItem value="asc">Oldest First</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Tabs defaultValue="active" className="mt-5">
        <TabsList>
          <TabsTrigger value="active" className={"px-5 hover: cursor-pointer"}>Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="closed" className={"px-5 hover: cursor-pointer"}>Closed ({closedCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredJobs
              .filter((job) => job.status === "open")
              .map((job) => (
                <div key={job.id} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">{job.title}</h2>
                    {/* <p className="text-sm text-gray-500">
                      {job.createdAt?.toDate
                        ? job.createdAt.toDate().toLocaleDateString()
                        : new Date(job.createdAt).toLocaleDateString()}
                    </p> */}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{departments.find(d=>d.id===job.departmentId)?.name || "-"}</div>
                  <div className="flex justify-between items-center mt-3">
                    <div className='flex flex-wrap gap-2'>
                      <button className="bg-[#2B99FF] text-white rounded-md px-3 py-1 text-sm cursor-pointer" onClick={(e)=>{ e.stopPropagation(); router.push(`/applications?jobId=${job.id}`) }}>{job.applicantsCount || 0} applicants</button>
                      <Badge variant="outline" className="bg-[#FFAFCC] text-white">{job.recruitedCount || 0}/{job.numOfOpenPosition || 1} recruited</Badge>
                    </div>
                    <DropdownMenu open={openDropdownJobId === job.id} onOpenChange={(open) => setOpenDropdownJobId(open ? job.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => {
                            setEdit({
                              id: job.id,
                              title: job.title || "",
                              description: job.description || "",
                              departmentId: job.departmentId || "",
                              numOfOpenPosition: job.numOfOpenPosition || 1,
                              numOfYearExperience: job.numOfYearExperience || 1,
                              tagsText: (job.tags || []).join(", "),
                            });
                            setEditOpen(true);
                          }}><Pencil />Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => updateJobStatus(job.id, "closed")}><UserRoundCheck />Close Position</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onSelect={() => deleteJob(job.id)}><Trash className="text-red-600" />Delete</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="closed" className="mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {jobs
              .filter((job) => job.status === "closed")
              .map((job) => (
                <div key={job.id} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">{job.title}</h2>
                    <p className="text-sm text-gray-500">
                      {job.createdAt?.toDate
                        ? job.createdAt.toDate().toLocaleDateString()
                        : new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{departments.find(d=>d.id===job.departmentId)?.name || "-"}</div>
                  <div className="flex justify-between items-center mt-3">
                    <div className='flex flex-wrap gap-2'>
                      <button className="bg-[#2B99FF] text-white rounded-md px-3 py-1 text-sm cursor-pointer" onClick={(e)=>{ e.stopPropagation(); router.push(`/applications?jobId=${job.id}`) }}>{job.applicantsCount || 0} applicants</button>
                      <Badge variant="outline" className="bg-[#FFAFCC] text-white">{job.recruitedCount || 0}/{job.numOfOpenPosition || 1} recruited</Badge>
                    </div>
                    <DropdownMenu open={openDropdownJobId === job.id} onOpenChange={(open) => setOpenDropdownJobId(open ? job.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => {
                            setEdit({
                              id: job.id,
                              title: job.title || "",
                              description: job.description || "",
                              departmentId: job.departmentId || "",
                              numOfOpenPosition: job.numOfOpenPosition || 1,
                              numOfYearExperience: job.numOfYearExperience || 1,
                              tagsText: (job.tags || []).join(", "),
                            });
                            setEditOpen(true);
                          }}><Pencil />Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => updateJobStatus(job.id, "open")}><UserRoundSearch />Open Position</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onSelect={() => deleteJob(job.id)}><Trash className="text-red-600" />Delete</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={jobFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className='text-xl font-bold'>New Job Position Details</DialogTitle>
            <DialogDescription className='text-xs italic'>
              Enter the required information to publish a job position for recruitment.
            </DialogDescription>
          </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <div>
                  <label className="text-black text-sm font-bold">Job Title <span className="text-red-500">*</span></label>
                  <Input className="bg-gray-100 p-2 rounded-md border-2" placeholder="e.g. Full Stack Developer" required
                  onChange={(event)=>setJobTitle(event.target.value)}/>
                </div>
                <div className='my-2'>
                  <label className="text-black text-sm font-bold">Job Description <span className="text-red-500">*</span></label>
                  <Textarea className="bg-gray-100 p-2 rounded-md border-2" placeholder="e.g. Manage frontend and backend development" required
                  onChange={(event)=>setJobDescription(event.target.value)}/>
                </div>
                <div>
                  <label className="text-black text-sm font-bold">Department <span className="text-red-500">*</span></label>
                  <Select value={jobDepartment} onValueChange={(v)=>setJobDepartment(v)} required>
                    <SelectTrigger className="w-[240px] bg-gray-100 p-2 rounded-md border-2">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d)=>(
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Manager auto-derived from department; no manual field */}
                <div className='my-2 flex justify-between gap-1'>
                  <div className='flex-1'>
                    <label className="text-black text-sm font-bold">Number of Open Position <span className="text-red-500">*</span></label>
                    <Input type="number" min="1" defaultValue={1} className="bg-gray-100 p-2 rounded-md border-2" required
                    onChange={(event)=>setNumOfOpenPosition(event.target.value)} />
                  </div>
                  <div className='flex-1'>
                    <label className="text-black text-sm font-bold">Preferred Year of Experience</label>
                    <Input type="number" min="1" defaultValue={1} className="bg-gray-100 p-2 rounded-md border-2"
                    onChange={(event)=>setNumOfYearExperience(event.target.value)} />
                  </div>
              </div>
              <div>
                <label className="text-black text-sm font-bold">Required Skills </label>
                <div className='text-xs my-1 italic text-gray-600'>** Separate each skill(s) with comma (,)</div>
                <Textarea className="bg-gray-100 p-2 rounded-md border-2" placeholder="e.g. React, Angular, NextJs"
                  onChange={(event)=>setRequiredSkills(event.target.value)}/>
              </div>
            </div>
              <div className='flex gap-5 justify-center'>
              <Button type="submit" disabled={loading} className={`bg-[#2B99FF] hover:bg-blue-950`}>
                {loading?
                <>
                <LoaderCircle className='animate-spin'/>Posting new job..
                </>:'Post'
                }
              </Button>
              <Button type="button" variant="outline" onClick={()=>setJobFormOpen(false)}>Cancel</Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>
      {/* Edit Job Dialog */}
      <Dialog open={editOpen} onOpenChange={(o)=>!o && setEditOpen(false)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className='text-xl font-bold'>Edit Job</DialogTitle>
            <DialogDescription className='text-xs italic'>Update job details; manager is derived from department.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e)=>{
              e.preventDefault();
              try {
                const dept = departments.find(d=>d.id===edit.departmentId);
                await updateDoc(doc(db, "jobs", edit.id), {
                  title: edit.title,
                  description: edit.description,
                  departmentId: edit.departmentId || null,
                  managerId: dept?.managerId || null,
                  numOfOpenPosition: Number(edit.numOfOpenPosition) || 1,
                  numOfYearExperience: Number(edit.numOfYearExperience) || 1,
                  tags: edit.tagsText ? edit.tagsText.split(",").map(s=>s.trim()).filter(Boolean) : [],
                  updatedAt: new Date(),
                });
                setJobs(prev => prev.map(j => j.id === edit.id ? {
                  ...j,
                  title: edit.title,
                  description: edit.description,
                  departmentId: edit.departmentId,
                  managerId: dept?.managerId || null,
                  numOfOpenPosition: Number(edit.numOfOpenPosition) || 1,
                  numOfYearExperience: Number(edit.numOfYearExperience) || 1,
                  tags: edit.tagsText ? edit.tagsText.split(",").map(s=>s.trim()).filter(Boolean) : [],
                } : j));
                setEditOpen(false);
              } catch (e) {
                console.error("Failed to update job", e);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-black text-sm font-bold">Job Title</label>
              <Input className="bg-gray-100 p-2 rounded-md border-2" value={edit.title} onChange={(e)=>setEdit(s=>({...s, title: e.target.value}))} required />
            </div>
            <div>
              <label className="text-black text-sm font-bold">Job Description</label>
              <Textarea className="bg-gray-100 p-2 rounded-md border-2" value={edit.description} onChange={(e)=>setEdit(s=>({...s, description: e.target.value}))} required />
            </div>
            <div>
              <label className="text-black text-sm font-bold">Department</label>
              <Select value={edit.departmentId} onValueChange={(v)=>setEdit(s=>({...s, departmentId: v}))}>
                <SelectTrigger className="w-[240px] bg-gray-100 p-2 rounded-md border-2">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d)=>(
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='my-2 flex justify-between gap-1'>
              <div className='flex-1'>
                <label className="text-black text-sm font-bold">Number of Open Position</label>
                <Input type="number" min="1" className="bg-gray-100 p-2 rounded-md border-2" value={edit.numOfOpenPosition} onChange={(e)=>setEdit(s=>({...s, numOfOpenPosition: e.target.value}))} required />
              </div>
              <div className='flex-1'>
                <label className="text-black text-sm font-bold">Preferred Year of Experience</label>
                <Input type="number" min="1" className="bg-gray-100 p-2 rounded-md border-2" value={edit.numOfYearExperience} onChange={(e)=>setEdit(s=>({...s, numOfYearExperience: e.target.value}))} required />
              </div>
            </div>
            <div>
              <label className="text-black text-sm font-bold">Required Skills</label>
              <Textarea className="bg-gray-100 p-2 rounded-md border-2" value={edit.tagsText} onChange={(e)=>setEdit(s=>({...s, tagsText: e.target.value}))} />
            </div>
            <div className='flex gap-5 justify-center'>
              <Button type="submit" className={`bg-[#2B99FF] hover:bg-blue-950`}>Save</Button>
              <Button type="button" variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
