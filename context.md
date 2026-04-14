# Project Documentation: EuraAI
**Status:** MVP Development Phase
**Goal:** A web-based, iPad-optimized Socratic Math Tutoring application.

---

## 1. Project Philosophy: The "Socratic" Approach

The core value proposition is **guidance over answers**.

- The app should never provide the final solution to a mathematical problem.
- It must identify the specific point of logical failure in a student's handwritten work.
- It should respond with a "nudge" or a leading question that helps the student self-correct.

## 2. Technical Stack

- **Frontend:** React (Vite) + Tailwind CSS.
- **Whiteboard Engine:** `tldraw` SDK (Infinite canvas, optimized for Apple Pencil/Touch).
- **Backend:** FastAPI (Python).
- **OCR Engine:** Pix2Text (P2T) for converting handwritten images to LaTeX.
- **Reasoning Engine:** OpenAI API (GPT-4o) and Claude 3.5 Sonnet.
- **Rendering:** KaTeX for displaying math hints in the UI.

## 3. The Core MVP Loop (Data Flow)

1. **Input:** User draws math on the `tldraw` whiteboard on an iPad.
2. **Capture:** A "Check Work" button captures the canvas as an image blob.
3. **Ingestion:** FastAPI receives the image and sends it to the P2T API.
4. **Transcription:** P2T returns a LaTeX string representing the user's math.
5. **Logic Analysis:** The LaTeX string is sent to the LLM with a "Socratic Tutor" system prompt.
6. **Verification:** The LLM identifies the first incorrect step and generates a hint.
7. **Feedback:** The frontend displays the hint as a non-intrusive UI callout.

## 4. Systems Design & Future Roadmap

Based on the initial architectural vision, the project will scale toward:

- **RAG Integration:** Moving from general LLM knowledge to textbook-specific context using a **Vector Database** (e.g., Pinecone/ChromaDB).
- **Cleaning Pipeline:** A system to normalize and index public textbook APIs (e.g., Anna's Archive).
- **Symbolic Verification:** Integrating `SymPy` or WolframAlpha to provide a "hard" mathematical check to back up the LLM's "soft" reasoning.
- **Asynchronous Tasks:** Using AWS SQS for long-running OCR and reasoning pipelines.

## 5. Development Constraints & Notes

- **Platform:** Web-app (PWA) instead of native mobile to allow for rapid iteration and full-stack flexibility.
- **iPad Optimization:** Must use `touch-action: none` and PWA manifest settings to ensure a full-screen, "native-feel" experience with Apple Pencil support.
- **Environment:** The project is located at `...\code\stealth\EuraAI`.
- **Binary Path:** Local tools are installed in `C:\Users\Ryan Li\.local\bin` (ensure this is in the system PATH for CLI access).

## 6. Prompting Guidelines for Claude

When asking Claude for code or architecture help:

- **Context:** Remind Claude that the backend is **FastAPI** and the frontend is **React**.
- **Math Logic:** Ensure any code generated for "grading" math uses the "Socratic" constraint—hints only, no answers.
- **Library Preferences:** Prefer `tldraw` for canvas logic and `P2T` for OCR integration.
