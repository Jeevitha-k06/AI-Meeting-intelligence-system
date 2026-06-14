# AI Meeting Intelligence System

An AI-powered meeting intelligence and collaboration platform that transforms meeting transcripts into actionable business insights using Natural Language Processing (NLP) and Machine Learning.

---

## Overview

Meetings often contain critical decisions, action items, risks, discussions, and insights that become difficult to track manually.

AI Meeting Intelligence System automatically analyses meeting transcripts and converts them into structured information that teams can use to improve collaboration, decision-making, and project execution.

The platform combines NLP, Machine Learning, clustering algorithms, sentiment analysis, and collaborative workspace features to provide both meeting intelligence and team collaboration capabilities.

---

## Key Features

### Meeting Summarisation

Generates concise summaries of long meeting discussions, allowing stakeholders to quickly understand the key outcomes of a meeting.

### Action Item Extraction

Automatically identifies tasks, responsibilities, and follow-up actions discussed during meetings.

### Decision Detection

Detects important decisions made during meetings and presents them separately for easy tracking.

### Topic Discovery & Clustering

Groups related discussion points into meaningful topic clusters to help users understand major themes discussed during the meeting.

### Sentiment Analysis

Analyses the overall sentiment of meeting discussions and provides insights into participant tone and engagement.

### Risk Analysis

Identifies potential risks, blockers, concerns, and project issues mentioned during meetings.

### Trend Analysis

Tracks recurring topics and discussion patterns across meetings.

### Team Collaboration

Provides a collaborative workspace where team members can:

* Review meeting insights
* Track action items
* Monitor decisions
* Follow project discussions
* Improve team alignment

---

## Machine Learning Pipeline

The platform uses multiple NLP and Machine Learning techniques to analyse meeting transcripts.

### 1. Text Preprocessing

Raw meeting transcripts are cleaned and normalised before analysis.

Processing includes:

* Text cleaning
* Stopword removal
* Tokenization
* Normalization

### 2. Embedding Generation

Sentence Transformer embeddings convert meeting text into semantic vector representations.

This enables the system to understand contextual similarity between discussions.

### 3. Topic Clustering

TF-IDF vectorisation extracts important terms from discussions.

HDBSCAN clustering groups semantically related discussions into topic clusters without requiring a predefined number of clusters.

### 4. Sentiment Analysis

Meeting content is analysed to determine overall emotional tone and engagement levels.

### 5. Risk Detection

Discussion content is evaluated to identify potential project risks and concerns.

### 6. Insight Generation

Results from all analysis modules are combined into actionable meeting intelligence.

---

## Technical Architecture

Meeting Transcript

↓

Preprocessing

↓

Machine Learning Pipeline

├── Summarization

├── Action Extraction

├── Decision Detection

├── Topic Clustering (TF-IDF + HDBSCAN)

├── Sentiment Analysis

└── Risk Analysis

↓

Backend API

↓

Frontend Dashboard

↓

Collaboration Workspace

---

## Technology Stack

### Frontend

* React
* Tailwind CSS
* JavaScript

### Backend

* FastAPI
* Python

### Machine Learning

* Sentence Transformers
* Scikit-learn
* TF-IDF Vectorisation
* HDBSCAN
* NLP Processing

### Database

* Supabase

---

## Project Structure

backend/
Business logic and APIs

frontend/
User interface and dashboard

ml_workspace/
Machine learning and NLP pipeline

sample_meetings/
Sample meeting transcripts

supabase_schema.sql
Database schema

---

## Future Improvements

* Real-time meeting processing
* Live meeting transcription integration
* Advanced LLM summarisation
* Meeting trend forecasting
* Speaker-level analytics
* Productivity scoring
* Team performance insights

---

## Author

Jeevitha Kumarswamy

