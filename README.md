<div align="center"><img src="public/alpaca-hire-logo-readme.png" alt="AlpacaHire Logo" height="70px"/></div> 

# AlpacaHire – Talent Acquisition & Onboarding Platform

A modern web app for recruiters, hiring managers, and applicants to manage recruitment pipelines, applications, and onboarding with various functionalities to simplify resume screening, automates onboarding steps, and equips new hires to be productive.


## Team Members

- Tan Kian Hon (Full-Stack Developer)
- Yeoh Huey Jing (Full-Stack Developer)
- Teng Eileen (AI Engineer)
- Ooi Pei Yin (Business Analyst)


## Problem Statement

- Lack of exclusive hiring platform, often juggle multiple tools to track recruitment
- Inefficient resume screening & candidate matching 
- Low productivity of new hires


## Solution Overview

- Recruitment & Application Dashboards
  - Track KPIs in real-time - positions, applications, and recruitment
  - Centralised candidate view with instant status updates
  - Automated notifications for new applications
- AI-Driven Candidate Screening
  - Smart OCR & NER processing extracts key skills automatically
  - Intelligent skill matching ranks candidate by job fit
  - Comprehensive scoring based on skills, experience, and relevance
- Job Management Portal
  - Easy job posting and interview scheduling for recruiters
  - Dedicated applicant interface for job browsing and applications
  - Real-time status tracking keeps everyone informed
- Smart Onboarding Portal
  - Structured task management with deadline tracking
  - Progress monitoring for HR, managers, and new hires
  - Automated task creation reduces onboarding time by 60%


## Technology Stack

- Frontend
  - ReactJs
  - NextJs
  - Tailwind CSS
- Backend
  - Firebase Cloud Functions
  - Firebase Authentication
  - FastAPI
  - Resend (email provider)
  - SkillNER (extract key words)
  - PDFPlumber (extract text)
- Database
  - Firebase Firestore


## Setup Instructions

### 1) Prerequisites

- Node.js
- Firebase project (Firestore, Storage, Functions enabled)
- Python
- Resend account + API key

### 2) Install dependencies

```bash
npm install
```

### 3) Configure environment (web app)

Run this command and insert your own credentials:
```bash
cp .env.example .env
```

### 4) Firebase cloud functions

Install functions dependencies:
```bash
cd functions
npm install
```

Run this command and insert your own credentials:

```bash
cp .env.example .env
```

Deploy functions:
```bash
firebase deploy --only functions
```

### 5) Run the web app

```bash
cd ..
npm run dev
```

### 6) Run python backend

Install python dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Create `.env.local` and insert your credential:

```
GOOGLE_APPLICATION_CREDENTIALS=XXX-firebase-adminsdk-XXX.json
```

Download the Firebase AdminSDK json file from firebase and insert in the root of /backend.

Run the python backend server:

```bash
uvicorn backend.main:app --reload --port 8000
```

**Refer to the terminal prompt to install any dependencies if unable to run.
<br><br>

## Reflection: Challenges & Learnings

- Learned integrating with various third-party platforms and providers
- Collaboration with others to turn idea into practical solution in a short amount of time
- Utilized AI tools to automate resume screening process
- Researched for knowledge in different job domains
- Understood the obstacles faced by SMEs in talent acquisition and onboarding process


## Extra Notes
- Email sending is server-side via Firebase Cloud Functions with Resend email provider.
- Application status changes are detected by a Firestore trigger, emails and notifications are created and sent automatically to the applicant.
- Cloud function is scheduled to run every 30 min to check new applications and send notifications to notify HR and managers to review them.
- This is an internal website, so it should not have account registration feature. We would expect the technical team to create the credentials for HR, hiring managers, and employees. As of now, we provide the credentials below for you to test out the website.
  - hr&#8203;@usm.com
  - employee&#8203;@usm.com
  - applicant&#8203;@usm.com
  - passwords are the same for each role (alpacahire)
