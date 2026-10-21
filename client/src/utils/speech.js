/**
 * Speech & Audio Utility for PivotPath
 * Provides Text-to-Speech announcements for route recovery alerts.
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
