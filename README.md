# Guitar Practice Logger

A free, serverless web app that lets a user dictate a single sentence describing
guitar practice, then logs structured data to Google Sheets using a
deterministic (non-LLM) rules engine.

## User Flow

- Open the web app in Safari on iPhone
- Use iOS keyboard dictation to speak one sentence
- Submit
- A new row appears in Google Sheets

Example input:

> “Today I played 20 minutes working on scales and alternate picking. Notes are felt smoother at 80 bpm.”

## Architecture (High Level)
iPhone Safari (keyboard dictation)
            |
            v
Web UI (index.html)
            |
            v
Google Apps Script Backend (Code.js)

parsePracticeTranscript()
computeParseConfidence()
            |
            v
Google Sheets (Log tab)

## Google Sheet Schema

Sheet name: `Log`

Columns:

- Timestamp
- Date
- Duration_min
- Focus
- Notes
- Source
- Raw_Transcript
- Parse_Confidence

## Why This Is Interesting

The backend uses deterministic rules (regex + heuristics), not an LLM, to:

- Extract structured fields from free text
- Preserve the original transcript for auditability
- Assign a confidence level to the parse

### Healthcare Parallel

This mirrors a non-LLM clinical triage pattern:

free-text intake → rules-based classification → structured registry + confidence