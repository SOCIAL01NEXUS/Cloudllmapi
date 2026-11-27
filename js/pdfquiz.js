/* ==========================================================================
   Study Buddy — PDF → questions (admin only)
   1. The PDF is read IN THE BROWSER with pdf.js (loaded from jsDelivr when needed).
   2. The text is sent to the secure "pdf-to-quiz" backend function, which asks Gemini
      to turn it into 4-option MCQs. (The Gemini key never reaches the browser.)
   3. Scanned PDFs with no text are sent as the file itself (up to ~6 MB).
   The admin always reviews the questions before anything is published.
   ========================================================================== */

import { supabase } from './supabase.js';

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/`;
export const MAX_FILE_MB = 15;
export const MAX_RAW_MB = 6;
const MAX_CHARS = 70000;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${PDFJS_BASE}pdf.min.js`;
    s.onload = () => {
      if (!window.pdfjsLib) { reject(new Error('pdf.js did not start.')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load the PDF reader.'));
    document.head.append(s);
  });
}

/** Reads all text from the PDF. Returns '' when the PDF has no text layer (scanned). */
export async function extractText(file, onProgress = () => {}) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages && out.length < MAX_CHARS; p += 1) {
    onProgress(`Reading page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    let lastY = null;
    for (const it of content.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) { out += `${line.trim()}\n`; line = ''; }
      line += `${it.str} `;
      lastY = y;
    }
    out += `${line.trim()}\n\n`;
  }
  return out.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS);
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

export function checkFile(file) {
  if (!file) return 'Choose a PDF file first.';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Only PDF files are supported.';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `That PDF is bigger than ${MAX_FILE_MB} MB. Split it into smaller parts.`;
  return '';
}

/** Returns an array of { topic, question_text, options[4], correct_index, explanation }. */
export async function pdfToQuestions({ file, kind, subject, count }, onProgress = () => {}) {
  const bad = checkFile(file);
  if (bad) throw new Error(bad);

  let text = '';
  try { text = await extractText(file, onProgress); } catch { text = ''; }

  const body = { kind, subject, count };
  if (text.length >= 80) {
    body.text = text;
  } else {
    if (file.size > MAX_RAW_MB * 1024 * 1024) {
      throw new Error(`This PDF looks scanned (no text) and is bigger than ${MAX_RAW_MB} MB. Use a smaller or text-based PDF.`);
    }
    onProgress('No text found — sending the PDF as a file…');
    body.pdf_base64 = await toBase64(file);
  }

  onProgress('Making questions with AI… this can take up to a minute.');
  const { data, error } = await supabase.functions.invoke('pdf-to-quiz', { body });
  if (error) {
    let msg = error.message || 'The PDF function failed.';
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  if (!Array.isArray(data?.questions) || !data.questions.length) throw new Error('No questions were produced.');
  return data.questions;
}
