'use client'
import React from 'react'
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, LoaderCircle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select'

function JobApplication() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Job Application Form details
  const [nationality, setNationality] = useState("")
  const [countryCode, setCountryCode] = useState("+60")
  const [phone, setPhone] = useState("")
  const [yearOfExperience, setYearOfExperience] = useState("")
  const [portfolioLink, setPortfolioLink] = useState("")
  const [linkedinLink, setLinkedinLink] = useState("")

  // Country list
  const countries = [
    { code: "MY", name: "Malaysia", dial: "+60" },
    { code: "SG", name: "Singapore", dial: "+65" },
    { code: "US", name: "United States", dial: "+1" },
    { code: "IN", name: "India", dial: "+91" },
    { code: "CN", name: "China", dial: "+86" },
    // ... you can expand full country list
  ]

  // Fetch Job
  useEffect(() => {
    async function fetchJob() {
      if (!id) return;
      const docRef = doc(db, 'jobs', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        setJob({ id: snapshot.id, ...snapshot.data() });
      }
    }
    fetchJob();
  }, [id]);

  // Fetch User Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
        }
      }
    });
    return () => unsubscribe();
  }, []);

  if (!job) return <p className="p-6">Loading job details...</p>;

  const handleFileChange = (event) => {
    setSupportDoc(event.target.files[0]); // Set the actual file
  };

  const onSubmit=async(e)=>{
    e.preventDefault()
    setLoading(true)
  }

  return (
    <div className="mx-10" >
      <Button 
        variant="outline" 
        onClick={() => router.back()} 
        className="flex items-center gap-1 bg-gray-100 cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </Button>
      <div className="mt-6 flex justify-between items-center mx-10">
        <h1 className="text-2xl font-bold mb-2">{job.title}</h1>
        <p className="text-sm text-gray-500 mb-4">
          {job.createdAt?.toDate
            ? job.createdAt.toDate().toLocaleDateString()
            : new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className='mx-10'>
        <p className="mb-4">{job.description}</p>
        <div className='flex flex-wrap gap-2'>
          {job.tags && job.tags.length > 0 ? (
            job.tags.map((skill, idx) => {
              const colors = ["#FFAFCC", "#CDB4DB", "#A2D2FF"];
              const color = colors[idx % colors.length];
              return (
                  <Badge
                      key={idx}
                      variant="outline"
                      className="text-white border-0 text-sm"
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
        <Separator className={"my-8"}></Separator>
        <div className='mx-20'>
          <h1 className="text-xl text-center underline font-bold mb-2">Job Application Form</h1>
          <h1 className='text-gray-600 text-sm mb-3 italic'>Please review your information below. Your profile details are pre-filled, 
          complete the remaining required fields before submitting your application.</h1>
          
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <div>
                <label className="text-black font-bold">Full Name </label>
                <Input 
                  value={userData?.name || ""} 
                  disabled 
                  className="bg-gray-100 cursor-not-allowed" 
                />
              </div>
              <div className='my-2'>
                <label className="text-black font-bold">Email </label>
                <Input 
                  type="email" 
                  value={userData?.email || ""} 
                  disabled 
                  className="bg-gray-100 cursor-not-allowed" 
                />
              </div>
              <div>
                <label className="text-black font-bold">Nationality <span className="text-red-500">*</span></label>
                <Select value={nationality} onValueChange={(val) => setNationality(val)} required>
                  <SelectTrigger className="w-full bg-gray-100 border-2">
                    <SelectValue placeholder="Select your nationality" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='my-4'>
                <label className="text-black font-bold">Phone <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={(val) => setCountryCode(val)} required>
                    <SelectTrigger className="w-60 bg-gray-100 border-2">
                      <SelectValue placeholder="+60" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.dial}>{c.name} ({c.dial})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-gray-100 border-2"
                    placeholder="e.g. 123456789"
                    required
                  />
                </div>
              </div>
              <div className='my-4'>
                  <label className="text-black font-bold">Year of Experience <span className="text-red-500">*</span></label>
                  <Input className="bg-gray-100 p-2 rounded-md border-2" required
                  onChange={(event)=>setYearOfExperience(event.target.value)}/>
              </div>
              <div className='my-4'>
                  <label className="text-black font-bold">Portfolio/ Github Link </label>
                  <Input className="bg-gray-100 p-2 rounded-md border-2"
                  onChange={(event)=>setPortfolioLink(event.target.value)}/>
              </div>
              <div className='my-4'>
                  <label className="text-black font-bold">LinkedIn Link </label>
                  <Input className="bg-gray-100 p-2 rounded-md border-2"
                  onChange={(event)=>setLinkedinLink(event.target.value)}/>
              </div>
              <div>
                <label className="text-black font-bold">Supporting Document <span className="text-red-500">*</span></label>
                <div className='text-xs mt-1 italic'>e.g. Resume, CV, Cover Letter, ..</div>
                <div className='text-xs mt-1 italic'>** PDF format ONLY</div>
                <div className="grid w-full max-w-sm items-center gap-1.5 my-2">
                  <Input id="supportDoc" type="file" accept="application/pdf" className="bg-gray-100 p-2 rounded-md border-2" required
                  onChange={handleFileChange}/>
                </div>
              </div>
            </div>
            <div className='flex gap-5 justify-center'>
            <Button type="submit" disabled={loading} className={`text-white bg-[#2B99FF] hover:bg-[#1a7bd8] cursor-pointer`}>
              {loading?
              <>
              <LoaderCircle className='animate-spin'/>Submiting job application..
              </>:'Submit Application'
              }
            </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default JobApplication