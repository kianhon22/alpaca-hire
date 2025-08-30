'use client'
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { collection, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
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
  const [jobs, setJobs] = useState([]); // Store job lists
  const [activeCount, setActiveCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobDepartment, setJobDepartment] = useState("");
  const [jobManager, setJobManager] = useState("");
  const [numOfOpenPosition, setNumOfOpenPosition] = useState(1);
  const [numOfYearExperience, setNumOfYearExperience] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");

  const [managers, setManagers] = useState([]); // Store manager lists

  const [openDropdownJobId, setOpenDropdownJobId] = useState(null);
  
  // Fetch 'jobs' database
  useEffect(() => {
    async function fetchJobs() {
      try {
        const querySnapshot = await getDocs(collection(db, "jobs"));
        let active = 0;
        let closed = 0;
        const allJobs = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          allJobs.push({ id: doc.id, ...data });
          if (data.status === "open") active++;
          if (data.status === "closed") closed++;
        });

        setJobs(allJobs);
        setActiveCount(active);
        setClosedCount(closed);

      } catch (error) {
        console.error("Error fetching jobs:", error);
      }
    }

    fetchJobs();
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
      await addDoc(collection(db, "jobs"), {
        title: jobTitle,
        description: jobDescription,
        department: jobDepartment,
        managerId: jobManager,
        status: "open", // default status
        createdAt: serverTimestamp(),
        tags: requiredSkills ? requiredSkills.split(",").map(skill => skill.trim()) : [],
        numOfOpenPosition: numOfOpenPosition || 1,
        numOfYearExperience: numOfYearExperience || "",
      });

      console.log("Job posted successfully!");

      setJobFormOpen(false);
      setJobTitle("");
      setJobDescription("");
      setJobDepartment("");
      setJobManager("");
      setNumOfOpenPosition("");
      setNumOfYearExperience("");
      setRequiredSkills("");
    } catch (error) {
      console.error("Error adding job:", error);
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="mx-10">
      {/* <SidebarTrigger /> */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Recruitment</h1>
        <Button onClick={()=>setJobFormOpen(true)}>+ New Job</Button>
      </div>

      <Tabs defaultValue="active" className="mt-5">
        <TabsList>
          <TabsTrigger value="active" className={"px-5 hover: cursor-pointer"}>Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="closed" className={"px-5 hover: cursor-pointer"}>Closed ({closedCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="space-y-4 mt-2">
          {jobs
            .filter((job) => job.status === "open")
            .map((job) => (
              <div
                key={job.id}
                className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold">{job.title}</h2>
                  <p className="text-sm text-gray-500">
                    {job.createdAt?.toDate
                      ? job.createdAt.toDate().toLocaleDateString()
                      : new Date(job.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <h2 className="text-xs text-gray-600">{job.department}</h2>
                <div className="flex justify-between items-center mt-3">
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant="outline" className="bg-[#2B99FF] text-white">
                    {job.applicantsCount || 0} applicants
                    </Badge>
                    <Badge variant="outline" className="bg-[#FFAFCC] text-white">
                    {job.recruitedCount || 0}/{job.numOfOpenPosition || 1} recruited
                    </Badge>
                  </div>
                  <DropdownMenu open={openDropdownJobId === job.id} onOpenChange={(open) => setOpenDropdownJobId(open ? job.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem><Pencil />Edit</DropdownMenuItem>
                        <DropdownMenuItem><UserRoundCheck />Close Position</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600"><Trash className="text-red-600" />Delete</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </TabsContent>
        <TabsContent value="closed" className="space-y-4 mt-2">
          {jobs
            .filter((job) => job.status === "closed")
            .map((job) => (
              <div
                key={job.id}
                className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold">{job.title}</h2>
                  <p className="text-sm text-gray-500">
                    {job.createdAt?.toDate
                      ? job.createdAt.toDate().toLocaleDateString()
                      : new Date(job.createdAt).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex justify-between items-center mt-3">
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant="outline" className="bg-[#2B99FF] text-white">
                    {job.applicantsCount || 0} applicants
                    </Badge>
                    <Badge variant="outline" className="bg-[#FFAFCC] text-white">
                    {job.recruitedCount || 0}/{job.numOfOpenPosition || 1} recruited
                    </Badge>
                  </div>
                  <DropdownMenu open={openDropdownJobId === job.id} onOpenChange={(open) => setOpenDropdownJobId(open ? job.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem><Pencil />Edit</DropdownMenuItem>
                        <DropdownMenuItem><UserRoundSearch />Open Position</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600"><Trash className="text-red-600" />Delete</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
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
                  <Input className="bg-gray-100 p-2 rounded-md border-2" placeholder="e.g. Engineering" required
                  onChange={(event)=>setJobDepartment(event.target.value)}/>
                </div>
                <div className='my-2'>
                  <label className="text-black text-sm font-bold">Manager <span className="text-red-500">*</span></label>
                    <Select value={jobManager} onValueChange={(value) => setJobManager(value)} required>
                        <SelectTrigger className="w-[200px] bg-gray-100 p-2 rounded-md border-2">
                            <SelectValue placeholder="Select Manager" />
                        </SelectTrigger>
                        <SelectContent>
                            {managers.map((manager) => (
                              <SelectItem key={manager.id} value={manager.id}>
                                {manager.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className='my-2 flex justify-between gap-1'>
                  <div className='flex-1'>
                    <label className="text-black text-sm font-bold">Number of Open Position <span className="text-red-500">*</span></label>
                    <Input className="bg-gray-100 p-2 rounded-md border-2" placeholder="Default: 1" required
                    onChange={(event)=>setNumOfOpenPosition(event.target.value)}/>
                  </div>
                  <div className='flex-1'>
                    <label className="text-black text-sm font-bold">Preferred Year of Experience</label>
                    <Input className="bg-gray-100 p-2 rounded-md border-2" placeholder=""
                    onChange={(event)=>setNumOfYearExperience(event.target.value)}/>
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
    </div>
  );
}
