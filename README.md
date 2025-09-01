# AlpacaHire – Talent Acquisition & Onboarding Platform

A modern web app for recruiters, hiring managers, and applicants to manage recruitment pipelines, applications, and onboarding with various functionalities to simplify resume screening, automates onboarding steps, and equips new hires to be productive.


## Team Members

- Tan Kian Hon (Full-Stack Developer)
- Yeoh Huey Jing (Full-Stack Developer)
- Teng Eileen (AI Engineer)
- Ooi Pei Yin (Business Analyst)


## Problem Statement

- Lack of exclusive hiring platform, often juggle multiple tools to track recruitment
- Inefficient Resume Screening & Candidate Matching 
- Low Productivity of New Hires


## Solution Overview

- Recruiter dashboard with filterable KPIs
- AI-driven candidate screening to extract keywords from resume
- Talent management hub to rank applicants with the matching score
- Strealined onboarding process for new hires
- Automated notifications and email

## Technology Stack

- Frontend
  - ReactJs
  - NextJs
  - Tailwind CSS
- Backend
  - Firebase Cloud Functions
  - Firebase Authentication
  - Resend (email provided)
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

### 3) Configure environment (Web App)

Run this command and insert your own credentials:
```bash
cp .env.example .env
```

### 4) Firebase Cloud Functions

Install functions dependencies:
```bash
cd functions
npm install
```

Run this command and insert your own credentials:

```bash
cp .env.example .env
```

Deploy Functions:
```bash
firebase deploy --only functions
```

### 5) Run the web app

```bash
cd ..
npm run dev
```

### 6) Python backend

Install Python dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Create `.env.local` and insert your credential:

```
GOOGLE_APPLICATION_CREDENTIALS=XXX-firebase-adminsdk-XXX.json
```

Download the Firebase AdminSDK json file from firebase and insert in the root of /backend.

Run the Python backend server:

```bash
uvicorn backend.main:app --reload --port 8000
```

**Note: Refer to the terminal prompt to install any dependencies if unable to run.

## Operational Notes

- Email sending is server-side via Firebase Cloud Functions with Resend email provider.
- Application status changes are detected by a Firestore trigger, emails and notifications are created and sent automatically to the applicant.
- Cloud function is scheduled to run every 30 minutes to check new applications and send notifications to notify HR and manager to review them.


## Reflection: Challenges & Learnings

- Learned how to extract text from PDF
- Difficult to