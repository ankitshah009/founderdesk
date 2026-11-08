import { Plus } from "lucide-react";

const FAQ: Array<[string, string]> = [
  ["What does it cost?", "Your first article is free once you confirm your email. After that it is $9 per article. Images are an add-on: 10 image credits for $5, added from your review page."],
  [
    "Will it sound like me?",
    "Brand Voice learns from your blog, newsletter and posts: sentence rhythm, signature phrases, contractions, first-person use and reading level. Every draft gets a voice match score, and Memory keeps the edits you make so the next draft starts closer.",
  ],
  [
    "What happens when my notes and a source disagree?",
    "The fact-checker quotes the source passage and asks you one question by email. Your answer goes into the draft. If you do not reply within 30 minutes, the order continues safely.",
  ],
  [
    "What exactly am I approving?",
    "The exact text of one version, bound to its SHA-256 content hash and its destination. If a word changes after that, it becomes a new version, goes back through fact-check, and needs your approval again.",
  ],
  [
    "Where can it publish?",
    "A verified web article is included. WordPress, Ghost and Webflow work once you connect your site. X, LinkedIn and Instagram go through accounts you connect with OAuth. The newsletter is written for you to send. Each version is approved on its own, and social posts are read back by ID before they count as published.",
  ],
  [
    "Do scheduled agents publish on their own?",
    "No. Custom agents like a weekly columnist draft on a schedule, and connected accounts post automatically only after you approve. Nothing goes live without your approval.",
  ],
  [
    "What is the Studio?",
    "Your workspace at /studio. It holds your Brand Voice, Knowledge Base, style guide, personas, custom agents, calendar, Idea Lab and insights, and every agent on the desk reads from it.",
  ],
  [
    "Will private details stay private?",
    "Boundaries in your brief are enforced by the fact-checker. In the example on this page, a named pilot customer was replaced with “a pilot customer” because the brief asked for names to stay private.",
  ],
];

export function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {FAQ.map(([q, a]) => (
        <details key={q} className="lv-faq group">
          <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-left text-[15px] text-fg transition-colors hover:text-fg-2 md:text-base">
            {q}
            <Plus className="lv-faq-icon size-4 shrink-0 text-muted" aria-hidden />
          </summary>
          <p className="lv-faq-body max-w-2xl pb-6 text-[15px] leading-relaxed text-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}
