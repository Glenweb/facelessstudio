/**
 * Anthropic Claude provider.
 *
 * Structured output is obtained by defining a single tool and forcing its use
 * (`tool_choice: { type: "tool" }`). Claude then returns a schema-shaped
 * `tool_use` block, which removes the whole class of "model wrapped the JSON
 * in prose" parsing failures.
 *
 * Scene *grouping* is intentionally not delegated to the model — see
 * `planScenes`. The model writes prose and art direction; the planner owns
 * timing, because timing depends on the selected voice's speaking rate.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { styleById } from "@/lib/studio/styles";
import type { SceneDraft, ScriptDraft } from "@/lib/studio/types";
import type { BreakdownRequest, LlmProvider, ScriptRequest } from "./index";
import { secondsForWords, wordsForSeconds } from "./index";
import { planScenes } from "./local";
import { countWords, keyPhrases, splitSentences, titleCase } from "./text";

const SCRIPT_TOOL: Anthropic.Tool = {
  name: "deliver_script",
  description: "Return the finished faceless-video script and its YouTube metadata.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Working title, under 70 characters." },
      hook: {
        type: "string",
        description: "The first spoken line. Must earn the next three seconds on its own.",
      },
      body: {
        type: "string",
        description:
          "The full narration after the hook, one beat per line, newline separated. Spoken words only — no scene directions, no speaker labels, no stage notes.",
      },
      call_to_action: { type: "string", description: "Final spoken line. One sentence." },
      seo_title: { type: "string", description: "YouTube title, under 95 characters." },
      seo_description: {
        type: "string",
        description: "YouTube description, 2–4 sentences, no hashtags.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "8–12 lower-case YouTube tags.",
      },
    },
    required: ["title", "hook", "body", "call_to_action", "seo_title", "seo_description", "tags"],
  },
};

const VISUALS_TOOL: Anthropic.Tool = {
  name: "deliver_visuals",
  description: "Return one image-generation prompt per scene, in order.",
  input_schema: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            visual_prompt: {
              type: "string",
              description:
                "A single concrete image description for this scene. Describe subject, composition and light. No text or words in the image.",
            },
            on_screen_text: {
              type: "string",
              description: "Optional 2–5 word title card. Empty string for none.",
            },
          },
          required: ["index", "visual_prompt", "on_screen_text"],
        },
      },
    },
    required: ["scenes"],
  },
};

function toolInput<T>(message: Anthropic.Message, toolName: string): T {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === toolName) return block.input as T;
  }
  throw new Error(`Claude did not call ${toolName}. Stop reason: ${message.stop_reason}`);
}

export function createAnthropicProvider(): LlmProvider {
  const client = new Anthropic({ apiKey: env.anthropicKey });

  return {
    kind: "anthropic",

    async generateScript(req: ScriptRequest): Promise<ScriptDraft> {
      const style = styleById(req.styleId);

      // A pasted script is the customer's own writing. We derive metadata from
      // it and leave the words untouched.
      if (req.sourceType === "script") {
        const body = req.input.trim();
        const sentences = splitSentences(body);
        const words = countWords(body);
        const message = await client.messages.create({
          model: env.anthropicModel,
          max_tokens: 1200,
          system:
            "You write YouTube metadata for faceless videos. You are given a finished script. Do not rewrite it. Return metadata only, and reuse the script's own wording for the hook.",
          tools: [SCRIPT_TOOL],
          tool_choice: { type: "tool", name: SCRIPT_TOOL.name },
          messages: [
            {
              role: "user",
              content: `Style: ${style.name} (${style.niche}).\n\nFinished script:\n\n${body}\n\nReturn metadata. For "body", return the script back exactly as given.`,
            },
          ],
        });
        const out = toolInput<ScriptToolOutput>(message, SCRIPT_TOOL.name);
        return {
          title: out.title || titleCase(sentences[0]?.slice(0, 60) ?? "Untitled"),
          hook: out.hook || sentences[0] || "",
          // Trust our copy of the input over the model's echo of it.
          body,
          callToAction: out.call_to_action ?? "",
          seoTitle: out.seo_title ?? out.title,
          seoDescription: out.seo_description ?? "",
          tags: out.tags ?? keyPhrases(body, 10),
          wordCount: words,
          estimatedSeconds: secondsForWords(words, req.wpm),
        };
      }

      const targetWords = wordsForSeconds(req.targetSeconds, req.wpm);
      const message = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 4000,
        system: [
          "You write narration for faceless videos — voiceover over generated visuals, no presenter on camera.",
          "Rules you never break:",
          "1. Spoken words only. No scene directions, no camera notes, no speaker labels, no markdown, no emoji.",
          "2. Open with a hook that earns the next three seconds without over-promising.",
          "3. One idea per line. Lines are beats, and each becomes one scene.",
          "4. Never invent statistics, dates, quotes or named sources. If a specific figure would strengthen a line, write the line so it works without one.",
          "5. Vary sentence length. Short sentences land; long ones carry. Never write two long sentences in a row.",
          "6. Write for the ear. If a line is hard to say out loud, rewrite it.",
        ].join("\n"),
        tools: [SCRIPT_TOOL],
        tool_choice: { type: "tool", name: SCRIPT_TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              `Topic: ${req.input}`,
              req.audience ? `Audience: ${req.audience}` : "",
              ``,
              `Style: ${style.name} — ${style.niche}.`,
              `Voice direction: ${style.narrationDirection}`,
              ``,
              `Length: about ${targetWords} words, which runs ~${req.targetSeconds}s at ${req.wpm} words per minute. Hitting the word count matters more than hitting a sentence count.`,
              `Write roughly ${Math.max(3, Math.round(req.targetSeconds / style.secondsPerScene))} beats in the body, one per line.`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      });

      const out = toolInput<ScriptToolOutput>(message, SCRIPT_TOOL.name);
      const body = (out.body ?? "").trim();
      const words = countWords(`${body} ${out.call_to_action ?? ""}`);

      return {
        title: out.title ?? titleCase(req.input.slice(0, 60)),
        hook: out.hook ?? "",
        body,
        callToAction: out.call_to_action ?? "",
        seoTitle: out.seo_title ?? out.title ?? "",
        seoDescription: out.seo_description ?? "",
        tags: out.tags ?? [],
        wordCount: words,
        estimatedSeconds: secondsForWords(words, req.wpm),
      };
    },

    async breakdownScenes(req: BreakdownRequest): Promise<SceneDraft[]> {
      // Group first so scene boundaries follow voice pacing, then ask Claude
      // to art-direct the groups it has actually been given.
      const planned = planScenes(req);
      if (planned.length === 0) return planned;

      const style = styleById(req.styleId);
      try {
        const message = await client.messages.create({
          model: env.anthropicModel,
          max_tokens: 4000,
          system: [
            "You art-direct faceless videos. For each scene you receive narration; return one image-generation prompt for it.",
            "Rules:",
            "1. Describe one concrete image: subject, composition, light. Never abstract concepts alone.",
            "2. No text, words, letters, logos or watermarks in the image.",
            "3. No recognisable real people and no faces looking at camera.",
            "4. Keep visual continuity across consecutive scenes — same world, same light, same era.",
            "5. Do not repeat the house art direction; it is appended automatically.",
          ].join("\n"),
          tools: [VISUALS_TOOL],
          tool_choice: { type: "tool", name: VISUALS_TOOL.name },
          messages: [
            {
              role: "user",
              content: [
                `Style: ${style.name} — ${style.niche}.`,
                `House art direction (appended automatically, do not repeat): ${style.artDirection}`,
                ``,
                `Scenes:`,
                ...planned.map((s) => `${s.index}: ${s.narration}`),
              ].join("\n"),
            },
          ],
        });

        const out = toolInput<VisualsToolOutput>(message, VISUALS_TOOL.name);
        const byIndex = new Map(out.scenes.map((s) => [s.index, s]));

        return planned.map((scene) => {
          const directed = byIndex.get(scene.index);
          if (!directed) return scene;
          const onScreen = directed.on_screen_text?.trim();
          return {
            ...scene,
            visualPrompt: `${directed.visual_prompt.trim()} ${style.artDirection}`,
            onScreenText: onScreen && onScreen.length > 0 ? onScreen : scene.onScreenText,
          };
        });
      } catch (err) {
        // Art direction is an enhancement, not a dependency. The planner's own
        // keyword-derived prompts are serviceable, so degrade rather than fail
        // the whole project.
        console.warn("[llm] art direction failed, using planner prompts:", err);
        return planned;
      }
    },
  };
}

interface ScriptToolOutput {
  title: string;
  hook: string;
  body: string;
  call_to_action: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
}

interface VisualsToolOutput {
  scenes: { index: number; visual_prompt: string; on_screen_text: string }[];
}
