'use client'
import React from 'react'
import { useParams, useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ChevronLeft, LoaderCircle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

function JobApplication() {
  const { id } = useParams();
  const router = useRouter();

  const [job, setJob] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  // Job Application Form details
  const [nationality, setNationality] = useState("")
  const [countryCode, setCountryCode] = useState("+60")
  const [phone, setPhone] = useState("")
  const [yearOfExperience, setYearOfExperience] = useState("")
  const [portfolioLink, setPortfolioLink] = useState("")
  const [linkedinLink, setLinkedinLink] = useState("")
  const [supportDoc, setSupportDoc] = useState(null)

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
    
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Please login first");
        return;
      }

      let fileUrl = "";
      let fileBlob = null;

      if (supportDoc) {
        // Upload PDF file to storage/applications/{uid}/{filename}
        const storageRef = ref(storage, `applications/${user.uid}/${supportDoc.name}`);
        await uploadBytes(storageRef, supportDoc);
        fileUrl = await getDownloadURL(storageRef);

        fileBlob = supportDoc;
      }

      // Save application data to Firestore
      const appRef = await addDoc(collection(db, "applications"), {
        applicantId: user.uid,
        jobId: id,
        nationality,
        phone: `${countryCode}${phone}`,
        yearOfExperience,
        portfolioLink,
        linkedinLink,
        supportDoc: fileUrl,
        status: "review",
        createdAt: serverTimestamp()
      });

      // Call backend API for OCR + NER + scoring
      const formData = new FormData();
      formData.append("application_id", appRef.id);
      if (fileBlob) {
        formData.append("file", fileBlob);
      }

      const response = await fetch("http://127.0.0.1:8000/apply", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Backend scoring failed");
      }

      const result = await response.json();
      // Transform matched skills to array of objects
      const matchedSkills = result.matched_skills.map(([jobSkill, applicantSkill]) => ({
        jobSkill,
        applicantSkill
      }));

      // Save backend results into 'screening' collection
      await addDoc(collection(db, "screening"), {
        applicationId: appRef.id,
        skillsExtracted: result.skills_extracted,
        matchedSkills: matchedSkills,
        scoreBreakdown: {
          skillMatch: result.skill_score,
          resumeRelevance: result.resume_score,
          experienceMatch: result.experience_score,
        },
        finalScore: result.final_score,
        createdAt: serverTimestamp(),
      });

      setShowDialog(true);
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("Something went wrong. Please try again.");
    }

    setLoading(false);
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

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Application Submitted 🎉</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-gray-600">Your job application has been submitted successfully.</p>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => {
                setShowDialog(false)
                router.push("/applicantDashboard")
              }}
            >
              Go to Dashboard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

export default JobApplication