'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react'

function Jobs() {

  const [jobs, setJobs] = useState([]); // Store job lists
  const [activeCount, setActiveCount] = useState(0);
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());

  const [searchTerm, setSearchTerm] = useState('') // Search text input

  const router = useRouter();

// Fetch 'jobs' database
  useEffect(() => {
    async function fetchJobs() {
      try {
        const querySnapshot = await getDocs(collection(db, "jobs"));
        let active = 0;
        const allJobs = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          allJobs.push({ id: doc.id, ...data });
          if (data.status === "open") active++;
        });

        setJobs(allJobs);
        setActiveCount(active);

      } catch (error) {
        console.error("Error fetching jobs:", error);
      }
    }

    fetchJobs();
  }, []);

  // Listen to auth and load the current user's applied job ids
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAppliedJobIds(new Set());
        return;
      }
      try {
        const appsSnap = await getDocs(query(collection(db, 'applications'), where('applicantId', '==', user.uid)));
        const ids = new Set(appsSnap.docs.map(d => d.data().jobId));
        setAppliedJobIds(ids);
      } catch (e) {
        console.error('Failed to load applied jobs', e);
      }
    });
    return () => unsub();
  }, []);

  // Filtered jobs (text search)
  const filteredJobs = jobs.filter((job) => {
    const lowerSearch = searchTerm.toLowerCase();
    return (
        job.title.toLowerCase().includes(lowerSearch) ||
        job.description?.toLowerCase().includes(lowerSearch) ||
        job.tags?.some(tag => tag.toLowerCase().includes(lowerSearch))
    );
  });

  
  return (
    <div className="mx-10">
        <div className="flex items-center gap-2 mb-4">
            <h1 className="text-2xl font-bold">Recruiting</h1>
            <Badge variant="outline" className="bg-[#2B99FF] text-white">{activeCount || 0}</Badge>
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

        {filteredJobs
        .filter((job) => job.status === "open")
        .map((job) => (
          <div
            key={job.id}
            className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-lg mt-4"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">{job.title}</h2>
              <p className="text-sm text-gray-500">
                {job.createdAt?.toDate
                  ? job.createdAt.toDate().toLocaleDateString()
                  : new Date(job.createdAt).toLocaleDateString()}
              </p>
            </div>
            <h2 className="text-xs text-gray-600">{job.description}</h2>
            <div className="flex justify-between items-center mt-3">
              <div className='flex flex-wrap gap-2'>
                {job.tags && job.tags.length > 0 ? (
                  job.tags.map((skill, idx) => {
                    const colors = ["#FFAFCC", "#CDB4DB", "#A2D2FF"];
                    const color = colors[idx % colors.length];
                    return (
                        <Badge
                            key={idx}
                            variant="outline"
                            className="text-white border-0"
                            style={{ backgroundColor: color }}
                        >
                            {skill}
                        </Badge>
                    );
                  })
                ) : (
                  <Badge variant="outline" className="bg-gray-200 text-gray-500">
                    No skills listed
                  </Badge>
                )}
              </div>
              {appliedJobIds.has(job.id) ? (
                <Button disabled className="bg-gray-300 text-gray-800 cursor-not-allowed hover:!bg-gray-300">
                  Applied
                </Button>
              ) : (
                <Button className="bg-[#2B99FF] text-white hover:bg-[#1a7bd8] cursor-pointer"
                  onClick={() => router.push(`/jobs/application/${job.id}`)}>
                  Apply
                </Button>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}

export default Jobs