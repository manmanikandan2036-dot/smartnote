// =========================================================
// SmartNote frontend logic
// =========================================================

const state = {
  extractedText: "",
  quizQuestions: [],
};

// ---------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

function showTab(name) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  panels.forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

document.getElementById("go-notes-btn").addEventListener("click", () => {
  showTab("notes");
  generateNotes();
});
document.getElementById("go-quiz-btn").addEventListener("click", () => {
  showTab("quiz");
  generateQuiz();
});

// ---------------------------------------------------------
// Minimal markdown -> HTML (headings, bold, bullet lists, paragraphs)
// ---------------------------------------------------------

function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;

  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const inline = (s) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    if (/^#{1,3}\s+/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#{1,3}\s+/, "");
      html += `<h${Math.min(level + 1, 3)}>${inline(text)}</h${Math.min(level + 1, 3)}>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// ---------------------------------------------------------
// File upload / extraction (shared by upload panel + grade panel)
// ---------------------------------------------------------

async function extractFile(file, handwritten = false) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("handwritten", handwritten ? "true" : "false");
  const res = await fetch("/api/extract", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Extraction failed");
  return data;
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const extractStatus = document.getElementById("extract-status");
const extractedWrap = document.getElementById("extracted-wrap");
const extractedFilename = document.getElementById("extracted-filename");
const extractedCount = document.getElementById("extracted-count");
const extractedTextArea = document.getElementById("extracted-text");

dropzone.addEventListener("click", () => fileInput.click());
["dragenter", "dragover"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) handleUploadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleUploadFile(fileInput.files[0]);
});

const handwrittenToggle = document.getElementById("handwritten-toggle");

async function handleUploadFile(file) {
  const handwritten = handwrittenToggle.checked;
  extractStatus.textContent = handwritten
    ? `Reading handwriting in ${file.name} with AI vision (this can take longer)...`
    : `Reading ${file.name}...`;
  extractStatus.classList.remove("error");
  try {
    const data = await extractFile(file, handwritten);
    state.extractedText = data.text;
    extractedFilename.textContent = data.filename;
    extractedCount.textContent = `${data.char_count.toLocaleString()} characters extracted`;
    extractedTextArea.value = data.text;
    extractedWrap.classList.remove("hidden");
    extractStatus.textContent = "Done — review the extracted text below, then continue.";
  } catch (err) {
    extractStatus.textContent = err.message;
    extractStatus.classList.add("error");
  }
}

extractedTextArea.addEventListener("input", () => {
  state.extractedText = extractedTextArea.value;
});

// ---------------------------------------------------------
// Notes generation
// ---------------------------------------------------------

const notesStatus = document.getElementById("notes-status");
const notesOutput = document.getElementById("notes-output");

async function generateNotes() {
  if (!state.extractedText) {
    notesStatus.textContent = "Upload a file on the Upload tab first.";
    notesStatus.classList.add("error");
    return;
  }
  notesStatus.classList.remove("error");
  notesStatus.textContent = "Summarizing... this can take a few seconds.";
  notesOutput.innerHTML = "";
  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: state.extractedText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to summarize");
    notesOutput.innerHTML = renderMarkdown(data.notes);
    notesStatus.textContent = "";
  } catch (err) {
    notesStatus.textContent = err.message;
    notesStatus.classList.add("error");
  }
}
document.getElementById("summarize-btn").addEventListener("click", generateNotes);

document.getElementById("read-notes-btn").addEventListener("click", () => {
  const text = notesOutput.innerText.trim();
  if (!text) return;
  speak(text);
});

document.getElementById("stop-reading-btn").addEventListener("click", () => {
  stopSpeaking();
});

// ---------------------------------------------------------
// Quiz generation + taking
// ---------------------------------------------------------

const quizStatus = document.getElementById("quiz-status");
const quizForm = document.getElementById("quiz-form");
const quizSubmitBtn = document.getElementById("quiz-submit-btn");
const quizResult = document.getElementById("quiz-result");

async function generateQuiz() {
  if (!state.extractedText) {
    quizStatus.textContent = "Upload a file on the Upload tab first.";
    quizStatus.classList.add("error");
    return;
  }
  const numQuestions = parseInt(document.getElementById("num-questions").value, 10) || 5;
  quizStatus.classList.remove("error");
  quizStatus.textContent = "Generating quiz...";
  quizForm.innerHTML = "";
  quizResult.classList.add("hidden");
  quizSubmitBtn.classList.add("hidden");

  try {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: state.extractedText, num_questions: numQuestions }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate quiz");
    state.quizQuestions = data.questions;
    renderQuiz(data.questions);
    quizStatus.textContent = "";
    quizSubmitBtn.classList.remove("hidden");
  } catch (err) {
    quizStatus.textContent = err.message;
    quizStatus.classList.add("error");
  }
}
document.getElementById("quiz-gen-btn").addEventListener("click", generateQuiz);

function renderQuiz(questions) {
  quizForm.innerHTML = questions.map((q, qi) => `
    <div class="quiz-q" id="quiz-q-${qi}">
      <div class="quiz-q-title"><span class="quiz-q-num">Q${qi + 1}</span>${escapeHtml(q.question)}</div>
      ${q.options.map((opt, oi) => `
        <label class="quiz-opt">
          <input type="radio" name="q${qi}" value="${oi}">
          ${escapeHtml(opt)}
        </label>
      `).join("")}
      <div class="quiz-explain hidden" id="quiz-explain-${qi}"></div>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

quizSubmitBtn.addEventListener("click", () => {
  let score = 0;
  state.quizQuestions.forEach((q, qi) => {
    const selected = quizForm.querySelector(`input[name="q${qi}"]:checked`);
    const qDiv = document.getElementById(`quiz-q-${qi}`);
    const explainDiv = document.getElementById(`quiz-explain-${qi}`);
    const correct = selected && parseInt(selected.value, 10) === q.correct_index;
    if (correct) score++;
    qDiv.classList.add(correct ? "correct" : "wrong");
    explainDiv.classList.remove("hidden");
    explainDiv.textContent = correct
      ? `Correct. ${q.explanation || ""}`
      : `Correct answer: ${q.options[q.correct_index]}. ${q.explanation || ""}`;
  });
  quizResult.classList.remove("hidden");
  quizResult.innerHTML = `<div class="score">${score} / ${state.quizQuestions.length}</div><p>Nice work — review the highlighted answers above.</p>`;
  quizSubmitBtn.classList.add("hidden");
});

// ---------------------------------------------------------
// Grading panel
// ---------------------------------------------------------

function wireMiniDrop(dropId, fileInputId, textareaId, handwrittenCheckboxId) {
  const drop = document.querySelector(`.mini-drop[data-target="${dropId}"]`);
  const input = document.getElementById(fileInputId);
  const textarea = document.getElementById(textareaId);
  const handwrittenBox = document.getElementById(handwrittenCheckboxId);

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    if (!input.files.length) return;
    const handwritten = handwrittenBox && handwrittenBox.checked;
    drop.querySelector("p").textContent = handwritten
      ? `Reading handwriting in ${input.files[0].name}...`
      : `Reading ${input.files[0].name}...`;
    try {
      const data = await extractFile(input.files[0], handwritten);
      textarea.value = data.text;
      drop.querySelector("p").textContent = `Loaded: ${data.filename}`;
    } catch (err) {
      drop.querySelector("p").textContent = err.message;
    }
  });
}
wireMiniDrop("qkey", "qkey-file", "qkey-text", "qkey-handwritten");
wireMiniDrop("ans", "ans-file", "ans-text", "ans-handwritten");

const gradeStatus = document.getElementById("grade-status");
const gradeOutput = document.getElementById("grade-output");

document.getElementById("grade-btn").addEventListener("click", async () => {
  const questionsText = document.getElementById("qkey-text").value.trim();
  const answerText = document.getElementById("ans-text").value.trim();
  const maxMarks = parseInt(document.getElementById("max-marks").value, 10) || 5;

  if (!questionsText || !answerText) {
    gradeStatus.textContent = "Provide both the question paper and the student's answers.";
    gradeStatus.classList.add("error");
    return;
  }
  gradeStatus.classList.remove("error");
  gradeStatus.textContent = "Grading... this can take a few seconds.";
  gradeOutput.innerHTML = "";

  try {
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions_text: questionsText,
        answer_text: answerText,
        max_marks_per_question: maxMarks,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to grade");
    renderGrade(data);
    gradeStatus.textContent = "";
  } catch (err) {
    gradeStatus.textContent = err.message;
    gradeStatus.classList.add("error");
  }
});

function renderGrade(data) {
  const cards = (data.results || []).map(r => `
    <div class="grade-card">
      <div class="q-head">
        <span>Q${r.question_number}. ${escapeHtml(r.question || "")}</span>
        <span class="marks">${r.marks_awarded} / ${r.max_marks}</span>
      </div>
      <p>${escapeHtml(r.feedback || "")}</p>
    </div>
  `).join("");

  gradeOutput.innerHTML = cards + `
    <div class="grade-total">
      Total: ${data.total_awarded} / ${data.total_possible}
    </div>
    <p style="color:var(--text-fainter); font-size:13.5px;">${escapeHtml(data.overall_feedback || "")}</p>
  `;
}

// ---------------------------------------------------------
// Chatbot panel
// ---------------------------------------------------------

state.chatHistory = []; // [{role: 'user'|'assistant', content: '...'}]

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatStatus = document.getElementById("chat-status");
const chatUseContext = document.getElementById("chat-use-context");

function appendChatMessage(role, htmlContent) {
  const wrap = document.createElement("div");
  wrap.className = `chat-msg ${role === "user" ? "user" : "bot"}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = htmlContent;
  wrap.appendChild(bubble);
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

async function sendChatMessage(text) {
  if (!text.trim()) return;

  appendChatMessage("user", escapeHtml(text));
  state.chatHistory.push({ role: "user", content: text });
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatStatus.classList.remove("error");
  chatStatus.textContent = "";

  const typingBubble = appendChatMessage("bot", "Thinking...");
  typingBubble.classList.add("typing");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.chatHistory,
        context: chatUseContext.checked ? state.extractedText : "",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Chat failed");

    typingBubble.classList.remove("typing");
    typingBubble.innerHTML = renderMarkdown(data.reply);
    state.chatHistory.push({ role: "assistant", content: data.reply });
  } catch (err) {
    typingBubble.remove();
    chatStatus.textContent = err.message;
    chatStatus.classList.add("error");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendChatMessage(chatInput.value);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage(chatInput.value);
  }
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
});

// ---------------------------------------------------------
// Voice assistant (Web Speech API — speech-to-text + text-to-speech)
// ---------------------------------------------------------

const micBtn = document.getElementById("mic-btn");
const micLabel = document.getElementById("mic-label");
const voiceTranscript = document.getElementById("voice-transcript");

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

// Web Speech API requires a secure context (https://, or http://localhost).
// On any other http:// origin the browser silently refuses to start it,
// which is the single most common reason "the mic button does nothing".
const secureContextOk = window.isSecureContext !== false;

function voiceUnavailableReason() {
  if (!SpeechRecognitionCtor) {
    return "Voice recognition isn't supported in this browser — try Chrome or Edge.";
  }
  if (!secureContextOk) {
    return "Voice recognition needs HTTPS (or localhost). Open this app via http://localhost:5000, not an IP address.";
  }
  return null;
}

if (SpeechRecognitionCtor) {
  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add("listening");
    micLabel.textContent = "Listening...";
    voiceTranscript.textContent = "";
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
    micLabel.textContent = "Voice assistant";
  };
  recognition.onerror = (event) => {
    const messages = {
      "not-allowed": "Microphone access was blocked. Allow it in your browser's site settings and try again.",
      "no-speech": "Didn't hear anything — try again.",
      "audio-capture": "No microphone found. Check it's connected and not in use elsewhere.",
      "network": "Network error during speech recognition — try again.",
    };
    voiceTranscript.textContent = messages[event.error] || `Voice error: ${event.error}. Try again.`;
  };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    voiceTranscript.textContent = `"${transcript}"`;
    handleVoiceCommand(transcript.toLowerCase());
  };
} else {
  micBtn.title = "Voice recognition isn't supported in this browser";
}

micBtn.addEventListener("click", () => {
  const reason = voiceUnavailableReason();
  if (reason) {
    voiceTranscript.textContent = reason;
    return;
  }
  if (listening) {
    recognition.stop();
    return;
  }
  // Starting the mic always interrupts any notes currently being read aloud,
  // so a new voice command isn't fighting with playback for attention.
  stopSpeaking();
  try {
    recognition.start();
  } catch (err) {
    // Fires if start() is called while an existing session is still tearing down.
    voiceTranscript.textContent = "Voice assistant is still resetting — try again in a second.";
  }
});

const stopReadingBtn = document.getElementById("stop-reading-btn");

function setSpeakingUI(isSpeaking) {
  stopReadingBtn.classList.toggle("hidden", !isSpeaking);
  micBtn.classList.toggle("speaking", isSpeaking);
}

function speak(text) {
  if (!window.speechSynthesis) return;
  // Cancel anything already playing/queued before starting new speech,
  // and before starting a fresh mic listen — otherwise old audio and new
  // audio can overlap or block each other.
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.onstart = () => setSpeakingUI(true);
  utterance.onend = () => setSpeakingUI(false);
  utterance.onerror = () => setSpeakingUI(false);
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  setSpeakingUI(false);
}

function handleVoiceCommand(command) {
  if (command.includes("summarize") || command.includes("notes")) {
    showTab("notes");
    speak("Generating your notes now.");
    generateNotes();
  } else if (command.includes("quiz")) {
    showTab("quiz");
    speak("Generating a quiz now.");
    generateQuiz();
  } else if (command.includes("grade") || command.includes("mark")) {
    showTab("grade");
    speak("Opening the grading panel.");
  } else if (command.includes("chat") || command.includes("ask")) {
    showTab("chat");
    speak("Opening the chatbot.");
  } else if (command.includes("upload")) {
    showTab("upload");
    speak("Opening the upload panel.");
  } else if (command.includes("read")) {
    const text = notesOutput.innerText.trim();
    if (text) {
      speak(text);
    } else {
      speak("There are no notes yet. Generate notes first.");
    }
  } else if (command.includes("stop")) {
    stopSpeaking();
  } else {
    speak("I can summarize, generate a quiz, grade a sheet, open the chatbot, or read your notes aloud. Try one of those.");
  }
}
