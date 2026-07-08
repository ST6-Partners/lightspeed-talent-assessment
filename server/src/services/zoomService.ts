// ============================================================
// ZOOM SERVICE — Webhook receiver + transcript puller
//
// Flow:
//   1. Zoom sends POST /api/webhooks/zoom when a recording is ready
//   2. We verify the payload with ZOOM_WEBHOOK_SECRET_TOKEN
//   3. We download the transcript (.vtt) from Zoom's API
//   4. We match the meeting to a candidate via meeting ID stored
//      in candidates.zoomMeetingId (or fall back to topic search)
//   5. We store the raw transcript on the candidate record and
//      trigger processInterviewFeedback automatically
//
// Required env vars:
//   ZOOM_WEBHOOK_SECRET_TOKEN  — from Zoom App → Feature → Event Subscriptions
//   ZOOM_ACCOUNT_ID            — from Zoom App → App Credentials
//   ZOOM_CLIENT_ID             — from Zoom App → App Credentials
//   ZOOM_CLIENT_SECRET         — from Zoom App → App Credentials
// ============================================================

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { candidates, candidateStageHistory } from '../db/schema/hiring.js';
import { processInterviewFeedback } from './interviewFeedback.js';

// ── Types ──────────────────────────────────────────────────

export interface ZoomWebhookPayload {
  event: string;
  payload: {
    account_id: string;
    object: {
      id: string;           // meeting UUID
      uuid: string;
      host_id: string;
      topic: string;        // meeting title — we store candidate name here
      start_time: string;
      duration: number;
      recording_files: ZoomRecordingFile[];
    };
  };
  download_token?: string;
}

interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_type: string;  // 'audio_transcript' | 'shared_screen_with_speaker_view' | etc.
  file_type: string;       // 'TRANSCRIPT' | 'MP4' | 'M4A' | etc.
  file_extension: string;  // 'VTT' | 'MP4' | etc.
  download_url: string;
  status: string;          // 'completed'
  recording_start: string;
  recording_end: string;
}

// ── Signature verification ─────────────────────────────────

/**
 * Verifies Zoom's webhook signature.
 * Zoom sends: x-zm-request-timestamp and x-zm-signature headers.
 * Expected format: v0=<hmac-sha256(v0:{timestamp}:{body})>
 */
export function verifyZoomWebhook(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string,
): boolean {
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(message).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Zoom OAuth token (Server-to-Server) ───────────────────

let _zoomToken: string | null = null;
let _zoomTokenExpiry = 0;

async function getZoomAccessToken(): Promise<string> {
  if (_zoomToken && Date.now() < _zoomTokenExpiry - 30_000) return _zoomToken;

  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom OAuth credentials not configured (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET)');
  }

  const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!res.ok) throw new Error(`Zoom token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };

  _zoomToken = data.access_token;
  _zoomTokenExpiry = Date.now() + data.expires_in * 1000;
  return _zoomToken;
}

// ── Transcript download ────────────────────────────────────

async function downloadTranscript(downloadUrl: string, downloadToken?: string): Promise<string> {
  const token = downloadToken ?? await getZoomAccessToken();
  const res = await fetch(`${downloadUrl}?access_token=${token}`);
  if (!res.ok) throw new Error(`Transcript download failed: ${res.status}`);
  const vtt = await res.text();
  return parseVtt(vtt);
}

/**
 * Strips WebVTT timing markers and returns plain text dialogue.
 * Input:  WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSpeaker: Hello\n\n...
 * Output: Speaker: Hello\nSpeaker: How are you\n...
 */
function parseVtt(vtt: string): string {
  const lines = vtt.split('\n');
  const dialogue: string[] = [];
  let skip = true; // skip header

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { skip = false; continue; }
    if (trimmed === 'WEBVTT') continue;
    if (/^\d+$/.test(trimmed)) { skip = true; continue; }       // cue number
    if (/-->/.test(trimmed)) { skip = false; continue; }         // timing line
    if (!skip && trimmed) dialogue.push(trimmed);
  }

  return dialogue.join('\n');
}

// ── Candidate matching ─────────────────────────────────────

/**
 * Find a candidate by Zoom meeting ID, or fall back to topic string search.
 * Topic is typically set to "Interview - {FirstName} {LastName}" when scheduling.
 */
async function findCandidateByMeeting(meetingId: string, topic: string): Promise<typeof candidates.$inferSelect | null> {
  // Primary: match by stored meeting ID
  const byId = await db.query.candidates.findFirst({
    where: eq((candidates as any).zoomMeetingId, meetingId),
  });
  if (byId) return byId;

  // Fallback: parse "Interview - Jade Friedman" → search by name
  const nameMatch = topic.match(/interview[\s\-–:]+(.+)/i);
  if (!nameMatch) return null;

  const parts = nameMatch[1].trim().split(/\s+/);
  if (parts.length < 2) return null;

  const [firstName, ...rest] = parts;
  const lastName = rest.join(' ');

  const byName = await db.query.candidates.findFirst({
    where: eq(candidates.firstName, firstName),
  });

  // Weak match — confirm last name
  if (byName && byName.lastName.toLowerCase() === lastName.toLowerCase()) return byName;
  return null;
}

// ── Main handler ───────────────────────────────────────────

export async function handleZoomRecordingReady(payload: ZoomWebhookPayload): Promise<void> {
  const obj = payload.payload.object;
  console.log(`[Zoom] Recording ready: meeting=${obj.id} topic="${obj.topic}"`);

  // Find transcript file
  const transcriptFile = obj.recording_files.find(
    (f) => f.file_type === 'TRANSCRIPT' || f.file_extension === 'VTT'
  );

  if (!transcriptFile) {
    console.warn('[Zoom] No transcript file in recording payload — skipping');
    return;
  }

  // Match to candidate
  const candidate = await findCandidateByMeeting(obj.id, obj.topic);
  if (!candidate) {
    console.warn(`[Zoom] No candidate matched meeting ${obj.id} / topic "${obj.topic}"`);
    return;
  }

  console.log(`[Zoom] Matched to candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.id})`);

  // Download + parse transcript
  const transcript = await downloadTranscript(transcriptFile.download_url, payload.download_token);

  // Store transcript on candidate
  await db.update(candidates)
    .set({ interviewTranscript: transcript, updatedAt: new Date() })
    .where(eq(candidates.id, candidate.id));

  // Advance stage to Interviewed if still at Interview Scheduled
  if (candidate.currentStage === 'Interview Scheduled') {
    await db.update(candidates)
      .set({ currentStage: 'Interviewed', updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id));

    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id,
      fromStage: 'Interview Scheduled',
      toStage: 'Interviewed',
      changedBy: null,
      reason: 'Zoom recording received — auto-advanced',
    });

    console.log(`[Zoom] Advanced ${candidate.firstName} ${candidate.lastName} → Interviewed`);
  }

  // Trigger AI feedback (non-blocking — errors logged, don't fail the webhook)
  runAiFeedback(candidate, transcript).catch((err) => {
    console.error(`[Zoom] AI feedback failed for ${candidate.id}:`, err);
  });
}

async function runAiFeedback(
  candidate: typeof candidates.$inferSelect,
  transcript: string,
): Promise<void> {
  console.log(`[Zoom] Running AI feedback for ${candidate.firstName} ${candidate.lastName}`);
  // Delegates to the shared pipeline (analysis + store + HR/interviewer emails).
  await processInterviewFeedback({ candidateId: candidate.id, transcript, sendEmails: true });
  console.log(`[Zoom] AI feedback complete for ${candidate.firstName} ${candidate.lastName}`);
}
