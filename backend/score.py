from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("all-MiniLM-L6-v2")

# 1. Skill Match Score (focus on job requirements)
def skill_match_score(job_skills, applicant_skills, threshold=0.6):
    if not job_skills:
        return 1.0

    # Normalize
    job_skills = [s.strip().lower() for s in job_skills if s]
    applicant_skills = [s.strip().lower() for s in applicant_skills if s]

    matched = 0
    for js in job_skills:
        emb_js = model.encode(js, convert_to_tensor=True)
        emb_as = model.encode(applicant_skills, convert_to_tensor=True)
        sims = util.cos_sim(emb_js, emb_as)[0]  # similarity with all applicant skills
        if float(sims.max()) >= threshold:
            matched += 1

    return matched / len(job_skills)

# 2. Resume Relevance (semantic similarity)
def resume_relevance(job_desc, resume_text):
    if not job_desc or not resume_text:
        return 0.0

    emb_job = model.encode(job_desc, convert_to_tensor=True)
    emb_resume = model.encode(resume_text, convert_to_tensor=True)
    return float(util.cos_sim(emb_job, emb_resume).item())

# 3. Experience Match
def experience_match(required, actual):
    try:
        required = float(required or 0)
        actual = float(actual or 0)
    except ValueError:
        return 0.0

    if required == 0:
        return 1.0
    return min(actual / required, 1.0)

# Final Score (50% skill match, 40% similarity, 10% year of experience)
def calculate_applicant_score(job, applicant):
    skill_score = skill_match_score(job.get("tags", []), applicant.get("skills", []))

    sim_score = resume_relevance(job.get("description", ""), applicant.get("extracted_text", ""))
    exp_score = experience_match(job.get("numOfYearExperience"), applicant.get("yearOfExperience"))

    final_score = (
        (skill_score * 0.6) +
        (sim_score * 0.3) +
        (exp_score * 0.1)
    ) * 100

    return {
        "skill_score": round(skill_score * 100, 2),
        "resume_relevance": round(sim_score * 100, 2),
        "experience_match": round(exp_score * 100, 2),
        "final_score": round(final_score, 2)
    }
