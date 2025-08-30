'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import React, { useState, useEffect } from 'react'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { Award, FileText, MessagesSquare, UserRoundPen } from 'lucide-react'
import { Input } from '@/components/ui/input'

function ApplicantDashboard() {

    const [applications, setApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
  
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
        { key: "review", label: "Review", icon: UserRoundPen },
        { key: "iv", label: "Interview", icon: MessagesSquare },
        { key: "result", label: "Result", icon: Award },
    ]

    const getStageIndex = (status) => {
        const index = stages.findIndex((s) => s.key === status)
        return index === -1 ? 0 : index
    }

    const filteredApps = applications.filter(
        (app) =>
        app.job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.job.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  
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
                        const Icon = stage.icon
                        const isActive = idx <= currentStage

                        return (
                        <div
                            key={stage.key}
                            className="flex flex-col items-center text-xs w-1/4 relative z-10 pb-4"
                        >
                            <div
                            className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                                isActive
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-white border-gray-300 text-gray-400"
                            }`}
                            >
                            <Icon size={16} />
                            </div>
                            <span
                            className={`mt-2 ${
                                isActive ? "text-blue-600 font-medium" : "text-gray-400"
                            }`}
                            >
                            {stage.label}
                            </span>

                            {/* Connector line BELOW text */}
                            {idx !== 0 && (
                            <div
                                className={`absolute bottom-0 -left-1/2 w-full h-1 z-10 ${
                                idx <= currentStage ? "bg-blue-500" : "bg-gray-300"
                                }`}
                            />
                            )}
                        </div>
                        )
                    })}
                </div>
            </div>
            )
        })}
    </div>
  )
}

export default ApplicantDashboard