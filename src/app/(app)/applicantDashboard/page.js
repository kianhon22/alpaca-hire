'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import React, { useState, useEffect } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { Award, Check, FileClock, FileText, MessagesSquare, UserRoundPen, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Input } from '@/components/ui/input'

function ApplicantDashboard() {

    const [applications, setApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [sortOrder, setSortOrder] = useState("desc")
    const [openDialogAppId, setOpenDialogAppId] = useState(null)
  
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
            // Get applications of this user
            const q = query(
                collection(db, "applications"),
                where("applicantId", "==", user.uid)
            )
            const querySnapshot = await getDocs(q)

            const apps = []
            for (const docSnap of querySnapshot.docs) {
                const appData = docSnap.data()

                // fetch job details from jobs collection
                const jobRef = doc(db, "jobs", appData.jobId)
                const jobSnap = await getDoc(jobRef)

                if (jobSnap.exists()) {
                apps.push({
                    id: docSnap.id,
                    ...appData,
                    job: { id: jobSnap.id, ...jobSnap.data() }
                })
                }
            }

            setApplications(apps)
            } catch (error) {
            console.error("Error fetching applications:", error)
            }
        } else {
            setApplications([])
        }
        setLoading(false)
        })

        return () => unsubscribe()
    }, [])

    // Stage order
    const stages = [
        { key: "applied", label: "Applied", icon: FileText },
        { key: "reviewing", label: "Reviewing", icon: UserRoundPen },
        { key: "scheduled", label: "Interview", icon: MessagesSquare },
        { key: "processing", label: "Processing", icon:  FileClock},
        { key: "result", label: "Result", icon: Award },
    ]

    const getStageDisplay = (app) => {
        if (app.status === "accepted") return { label: "Accepted", Icon: Check }
        if (app.status === "rejected") return { label: "Rejected", Icon: X }
        return { label: "Result", Icon: Award }
    }

    const getStageIndex = (status) => {
        const index = stages.findIndex((s) => s.key === status)
        return index === -1 ? 0 : index
    }

    // Helper function to check if a stage/connector should be active
    const isStageActive = (idx, currentStage, status) => {
        // For accepted/rejected, all stages and connectors should be active
        if (status === "accepted" || status === "rejected") {
            return true
        }
        // Otherwise, use normal logic
        return idx <= currentStage
    }

    // Filtering + Sorting
    const filteredApps = applications
        .filter((app) => {
        const matchesSearch =
            app.job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.job.description.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesStatus =
            statusFilter === "all" ? true : app.status === statusFilter

        return matchesSearch && matchesStatus
        })
        .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA
        })
  
    return (
    <div className="mx-10">
        <div className="flex items-center gap-2 mb-4">
            <h1 className="text-2xl font-bold">Your Applications</h1>
            <Badge variant="outline" className="bg-[#2B99FF] text-white">{loading ? "..." : applications.length}</Badge>
        </div>

        <div className="flex flex-col gap-4 my-5">
            <div className='flex flex-col md:flex-row gap-4'>
            <Input
                placeholder='Search jobs...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='bg-gray-100'
            />

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] bg-gray-100">
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="reviewing">Reviewing</SelectItem>
                    <SelectItem value="scheduled">Interview</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="result">Result</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
                </Select>

                {/* Sort Order */}
                <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-[180px] bg-gray-100">
                    <SelectValue placeholder="Sort by date" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="asc">Oldest First</SelectItem>
                    <SelectItem value="desc">Newest First</SelectItem>
                </SelectContent>
            </Select>

            </div>
        </div>

        {!loading && filteredApps.length === 0 && (
            <p className="text-gray-500">You haven't applied to any jobs yet or no matching job application found.</p>
        )}

        {filteredApps.map((app) => {
            const currentStage = getStageIndex(app.status) // get the index based on app.status

            return (
                <div
                key={app.id}
                className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg mt-4"
                >
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">{app.job.title}</h2>
                    <p className="text-sm text-gray-500">
                    {app.createdAt?.toDate
                        ? app.createdAt.toDate().toLocaleDateString()
                        : new Date(app.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <p className="text-sm text-gray-600">{app.job.description}</p>

                <div className="flex justify-between items-center mt-6 relative mx-50">
                    {stages.map((stage, idx) => {
                        let Icon = stage.icon
                        let label = stage.label

                        // Override final stage if needed
                        if (stage.key === "result") {
                            const finalStage = getStageDisplay(app)
                            Icon = finalStage.Icon
                            label = finalStage.label
                        }

                        const isActive = isStageActive(idx, currentStage, app.status)

                        // Determine colors based on final status for the result stage
                        let stageColors = {
                            active: "bg-blue-500 border-blue-500 text-white",
                            inactive: "bg-white border-gray-300 text-gray-400",
                            textActive: "text-blue-600 font-medium",
                            textInactive: "text-gray-400",
                            connector: "bg-blue-500"
                        }
                        
                        if (stage.key === "result" && (app.status === "accepted" || app.status === "rejected")) {
                            if (app.status === "accepted") {
                                stageColors = {
                                    active: "bg-green-500 border-green-500 text-white",
                                    inactive: "bg-white border-gray-300 text-gray-400",
                                    textActive: "text-green-600 font-medium",
                                    textInactive: "text-gray-400",
                                    connector: "bg-blue-500"
                                }
                            } else if (app.status === "rejected") {
                                stageColors = {
                                    active: "bg-red-500 border-red-500 text-white",
                                    inactive: "bg-white border-gray-300 text-gray-400",
                                    textActive: "text-red-600 font-medium",
                                    textInactive: "text-gray-400",
                                    connector: "bg-blue-500"
                                }
                            }
                        }

                        const isScheduledStage = stage.key === "scheduled"
                        
                        return (
                            <div key={stage.key} className="flex flex-col items-center text-xs w-1/4 relative z-10 pb-4">
                                <div
                                    onClick={() => isScheduledStage && setOpenDialogAppId(app.id)}
                                    className={`flex items-center justify-center w-8 h-8 rounded-full border ${isActive ? stageColors.active : stageColors.inactive} ${isScheduledStage ? "cursor-pointer hover:scale-110 hover:shadow-lg transition-transform duration-200" : ""}`}
                                >
                                    <Icon size={16} />
                                </div>
                                <span className={`mt-2 ${isActive ? stageColors.textActive : stageColors.textInactive}`}>
                                    {label}
                                </span>

                                {idx !== 0 && (
                                    <div className={`absolute bottom-0 -left-1/2 w-full h-1 z-10 ${isStageActive(idx, currentStage, app.status) ? (stage.key === "result" && (app.status === "accepted" || app.status === "rejected") ? stageColors.connector : "bg-blue-500") : "bg-gray-300"}`} />
                                )}
                            </div>
                        )
                    })}
                </div>
                <Dialog open={openDialogAppId === app.id} onOpenChange={() => setOpenDialogAppId(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Interview Schedule</DialogTitle>
                            <DialogDescription>
                                {/* Display interview details here */}
                                Scheduled on: {app.interviewDate || "TBD"} <br/>
                                Mode: {app.interviewMode || "TBD"}
                            </DialogDescription>
                        </DialogHeader>
                        <Button onClick={() => setOpenDialogAppId(null)}>Close</Button>
                    </DialogContent>
                </Dialog>
            </div>
            )
        })}
    </div>
  )
}

export default ApplicantDashboard