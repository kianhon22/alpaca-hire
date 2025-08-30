import spacy
from spacy.matcher import PhraseMatcher
from skillNer.general_params import SKILL_DB
from skillNer.skill_extractor_class import SkillExtractor

# Load NLP model once
nlp = spacy.load("en_core_web_lg")
skill_extractor = SkillExtractor(nlp, SKILL_DB, PhraseMatcher)

def extract_skills(text: str):
    """
    Extract skills from given text using SkillNER
    """
    annotations = skill_extractor.annotate(text)

    # annotations['results'] has detailed matches
    # we simplify it to just a list of skill names
    skills = [res['doc_node_value'] for res in annotations['results']['full_matches']]
    skills += [res['doc_node_value'] for res in annotations['results']['ngram_scored']]
    
    # Deduplicate
    return list(set(skills))