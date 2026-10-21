/**
 * Hands-Free Voice & Speech Utility for PivotPath
 * Provides Text-to-Speech announcements and Speech Recognition for hands-free route recovery.
 */

// ── Text-To-Speech (TTS) ──────────────────────────────────────────────────────
let isSpeaking = false;

export function speak(text, onEnd) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Web SpeechSynthesis not supported in this browser environment.");
    return false;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = "en-IN"; // Indian English locale for Pune corridor

    // Try finding an English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onstart = () => {
      isSpeaking = true;
    };
    utterance.onend = () => {
      isSpeaking = false;
      onEnd?.();
    };
    utterance.onerror = (e) => {
      isSpeaking = false;
      console.warn("Speech synthesis error:", e);
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn("Failed to speak text:", err);
    return false;
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
  }
}

// ── Speech Recognition (Voice Commands) ───────────────────────────────────────
const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export function isVoiceSupported() {
  return Boolean(SpeechRecognition);
}

export function startVoiceCommandListener({
  onAccept,
  onReject,
  onListeningStateChange,
  onError,
}) {
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported in this browser.");
    onError?.("Speech recognition not supported in this browser.");
    return () => {};
  }

  let recognition;
  let active = true;

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      onListeningStateChange?.(true);
    };

    recognition.onend = () => {
      if (active) {
        // Restart listener if still active
        try {
          recognition.start();
        } catch {
          onListeningStateChange?.(false);
        }
      } else {
        onListeningStateChange?.(false);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        active = false;
        onListeningStateChange?.(false);
        onError?.("Microphone permission denied.");
      }
    };

    recognition.onresult = (event) => {
      const results = event.results;
      const latest = results[results.length - 1];
      if (latest && latest[0]) {
        const transcript = latest[0].transcript.toLowerCase().trim();
        console.log(`[voice-command] Heard: "${transcript}"`);

        // Check accept commands
        if (
          transcript.includes("accept") ||
          transcript.includes("confirm") ||
          transcript.includes("yes") ||
          transcript.includes("switch") ||
          transcript.includes("okay") ||
          transcript.includes("take route")
        ) {
          active = false;
          recognition.stop();
          onAccept?.(transcript);
        } else if (
          transcript.includes("reject") ||
          transcript.includes("cancel") ||
          transcript.includes("no") ||
          transcript.includes("keep") ||
          transcript.includes("stay")
        ) {
          active = false;
          recognition.stop();
          onReject?.(transcript);
        }
      }
    };

    recognition.start();
  } catch (err) {
    console.warn("Failed to start speech recognition:", err);
    onError?.(err.message);
  }

  return () => {
    active = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    onListeningStateChange?.(false);
  };
}
