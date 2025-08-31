from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from OCR import extract_text_from_pdf
from NER import extract_skills
from score import calculate_applicant_score
import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)

db = firestore.client()

app = FastAPI()

# Allow your Next.js frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # ⚠️ later restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/apply")
async def apply(
    application_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Full pipeline: OCR -> NER -> Scoring
    """
    # Step 1: Load application document
    app_doc = db.collection("applications").document(application_id).get()
    if not app_doc.exists:
        return {"error": "Application not found"}
    app_data = app_doc.to_dict()

    # Load job posting
    job_doc = db.collection("jobs").document(app_data["jobId"]).get()
    if not job_doc.exists:
        return {"error": "Job not found"}
    job_data = job_doc.to_dict()

    # Step 2: OCR
    file_bytes = await file.read()
    resume_text = extract_text_from_pdf(file_bytes)

    # Step 3: NER
    applicant_skills = extract_skills(resume_text)

    # Step 4: Scoring
    applicant = {
        "skills": applicant_skills,
        "extracted_text": resume_text,
        "yearOfExperience": app_data.get("yearOfExperience", 0),
    }

    job = {
        "tags": job_data.get("tags", []),
        "description": job_data.get("description", ""),
        "numOfYearExperience": job_data.get("numOfYearExperience", 0),
    }

    final_score = calculate_applicant_score(job, applicant)

    return {
        "application_id": application_id,
        "skills_extracted": applicant_skills,
        "skill_score": final_score["skill_score"],
        "resume_score": final_score["resume_relevance"],
        "experience_score": final_score["experience_match"],
        "final_score": final_score["final_score"],
        "matched_skills": final_score["matched_skills"]
    }
