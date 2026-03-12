/*******************************************************
 * Guitar Practice Logger (Google Sheets + Apps Script)
 * Sheet tab name: "Log"
 * Columns A–H:
 * A Timestamp
 * B Date
 * C Duration_min
 * D Focus
 * E Notes
 * F Source
 * G Raw_Transcript
 * H Parse_Confidence
 *******************************************************/

/**
 * Serves the web app UI (index.html)
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Guitar Practice Logger");
}

/**
 * Appends a practice entry row to the "Log" sheet (A–H).
 */
function appendPracticeRow(entry) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Log");
  if (!sheet) throw new Error('Sheet named "Log" not found.');

  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var dateStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");

  // Defensive defaults
  var duration = (entry && entry.duration_min !== undefined && entry.duration_min !== null) ? entry.duration_min : "";
  var focus    = (entry && entry.focus !== undefined && entry.focus !== null) ? entry.focus : "";
  var notes    = (entry && entry.notes !== undefined && entry.notes !== null) ? entry.notes : "";
  var source   = (entry && entry.source !== undefined && entry.source !== null) ? entry.source : "manual-test";

  var rawTranscript = (entry && entry.raw_transcript) ? entry.raw_transcript : "";
  var confidence    = (entry && entry.parse_confidence) ? entry.parse_confidence : "";

  // A–H
  sheet.appendRow([now, dateStr, duration, focus, notes, source, rawTranscript, confidence]);

  return { ok: true };
}

/**
 * Deterministic confidence scoring for parsing quality.
 * High: duration AND focus present
 * Medium: either duration OR focus present
 * Low: neither present
 */
function computeParseConfidence(parsed) {
  var hasDuration = parsed && parsed.duration_min !== "" && parsed.duration_min !== null && parsed.duration_min !== undefined;
  var hasFocus = parsed && parsed.focus && parsed.focus.toString().trim().length > 0;

  if (hasDuration && hasFocus) return "High";
  if (hasDuration || hasFocus) return "Medium";
  return "Low";
}

/**
 * Parse a dictated practice log into structured fields.
 * Rules-based (non-LLM): duration + focus + notes.
 *
 * Example:
 * "Today I played 20 minutes working on scales and alternate picking. Notes are felt smoother at 80 bpm."
 */
function parsePracticeTranscript(transcript) {
  var raw = (transcript || "").toString().trim();
  if (!raw) return { duration_min: "", focus: "", notes: "" };

  var working = raw;

  // 1) Split out explicit notes: "Notes are ..." or "Notes: ..."
  var notes = "";
  var notesMatch = working.match(/(?:\bnotes\b\s*(?:are|:)\s*)(.+)$/i);
  if (notesMatch && notesMatch[1]) {
    notes = notesMatch[1].trim();
    working = working.replace(notesMatch[0], "").trim();
  }

  // 2) Extract duration in minutes (numeric or simple word numbers)
  var duration_min = "";

  var wordToNum = {
    "zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,
    "eleven":11,"twelve":12,"thirteen":13,"fourteen":14,"fifteen":15,"sixteen":16,"seventeen":17,"eighteen":18,"nineteen":19,
    "twenty":20,"thirty":30,"forty":40,"fifty":50,"sixty":60,"seventy":70,"eighty":80,"ninety":90,
    "hundred":100
  };

  function wordsToNumber(words) {
    var parts = words.toLowerCase().split(/\s+/).filter(Boolean);
    var current = 0;
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (wordToNum[w] === undefined) return null;
      var n = wordToNum[w];
      if (w === "hundred") {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        current += n;
      }
    }
    return current;
  }

  // Numeric minutes: "15 minutes", "15 min", "for 15 mins"
  var m = working.match(/\b(?:for\s*)?(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i);
  if (m && m[0] && m[1]) {
    duration_min = parseInt(m[1], 10);
    working = working.replace(m[0], "").trim();
  } else {
    // Word minutes: "fifteen minutes", "twenty five minutes"
    m = working.match(/\b(?:for\s*)?((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s*(?:min|mins|minute|minutes)\b/i);
    if (m && m[0] && m[1]) {
      var n2 = wordsToNumber(m[1]);
      if (n2 !== null) duration_min = n2;
      working = working.replace(m[0], "").trim();
    }
  }

  // 3) Extract focus
  var focus = "";

  // "working on ___" / "worked on ___"
  var f = working.match(/\bwork(?:ing|ed)?\s+on\s+(.+?)(?:[.!,;]|$)/i);
  if (f && f[1]) {
    focus = f[1].trim();
    working = working.replace(f[0], "").trim();
  } else {
    // "practicing ___" / "practice ___"
    f = working.match(/\bpractic(?:ing|ed|e)\s+(.+?)(?:[.!,;]|$)/i);
    if (f && f[1]) {
      focus = f[1].trim();
      working = working.replace(f[0], "").trim();
    }
  }

  // 4) Remainder becomes notes (only if notes not explicitly set)
  var cleaned = working
    .replace(/\b(today|tonight|this morning|this afternoon)\b/ig, "")
    // Remove boilerplate openers so they don't become notes
    .replace(/\b(i\s+)?(played|play|practiced|practice|working|worked)\b/ig, "")
    .replace(/\b(i\s+was\s+)?working\s+on\b/ig, "")
    .replace(/\bfor\b/ig, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();

  if (!notes) notes = cleaned;

  return {
    duration_min: (duration_min === "" ? "" : duration_min),
    focus: focus,
    notes: notes
  };
}

/**
 * Accepts a raw dictated transcript, parses it, computes confidence,
 * and appends to the sheet with an audit trail (Raw_Transcript + Confidence).
 *
 * Called from index.html via google.script.run.logFromTranscript(text)
 */
function logFromTranscript(transcript) {
  var raw = (transcript || "").toString().trim();
  if (!raw) throw new Error("Transcript is empty.");

  var parsed = parsePracticeTranscript(raw);
  var confidence = computeParseConfidence(parsed);

  var entry = {
    duration_min: parsed.duration_min,
    focus: parsed.focus,
    notes: parsed.notes,
    source: "single-field-voice",
    raw_transcript: raw,
    parse_confidence: confidence
  };

  appendPracticeRow(entry);

  // Return parsed + confidence so the UI can display it
  parsed.parse_confidence = confidence;
  return parsed;
}

/***********************
 * TEST FUNCTIONS
 ***********************/

function testAppend() {
  var sample = {
    duration_min: 20,
    focus: "Major scales, alternate picking",
    notes: "Felt smoother at 80 bpm",
    source: "manual-test",
    raw_transcript: "Manual test entry",
    parse_confidence: "High"
  };
  var result = appendPracticeRow(sample);
  Logger.log(result);
}

function testParse() {
  var examples = [
    "I practiced for 15 minutes today working on blues rhythm. Notes are left hand stayed tense.",
    "Today I played 20 minutes working on scales and alternate picking",
    "Practiced fifteen minutes practicing arpeggios; notes: struggled at 90 bpm",
    "Played 30 min. Working on chord changes. Felt cleaner."
  ];

  examples.forEach(function(t) {
    var parsed = parsePracticeTranscript(t);
    Logger.log("INPUT: " + t);
    Logger.log("PARSED: " + JSON.stringify(parsed));
  });
}

function testLogFromTranscript() {
  var t = "Today I played 20 minutes working on scales and alternate picking. Notes are felt smoother at 80 bpm.";
  var parsed = logFromTranscript(t);
  Logger.log(parsed);
}
