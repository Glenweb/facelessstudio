/**
 * Procedural scene art.
 *
 * Each frame is a parametric colour field evaluated by FFmpeg's `geq` filter:
 * a handful of gaussian colour blobs drawn from the style palette, a soft
 * horizon that gives the frame a ground plane, and a directional light shaft.
 * It is evaluated at low resolution and upscaled, which keeps a 1080p frame
 * under ~300ms, then graded, vignetted and grained with the style's own
 * settings so it sits in the same world as the rest of the video.
 *
 * Everything is derived from `seed`, so regenerating a scene gives a
 * genuinely different composition and re-rendering gives the same one back.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mulberry32 } from "@/lib/providers/llm/text";
import { resolveBinary } from "@/lib/render/binary";
import { styleById } from "@/lib/studio/styles";
import type { ImageProvider, ImageRequest, ImageResult } from "./index";

const run = promisify(execFile);

/** Low-res evaluation grid; the soft look survives upscaling intact. */
const FIELD_W = 512;

/**
 * The field is evaluated in 10-bit. On gradients this gentle, neighbouring
 * pixels differ by well under one 8-bit level, so an 8-bit `geq` quantises
 * them into wide flat bands that the contrast grade then turns into visible
 * contour rings. Two extra bits of headroom removes the banding at source,
 * and the result is dithered back down to 8-bit at the end.
 */
const BIT_SCALE = 1023 / 255;
const BIT_MAX = 1023;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

interface Blob {
  cx: number;
  cy: number;
  sigma: number;
  colour: Rgb;
  /** Relative influence. Light masses outweigh anchors so frames stay lit. */
  gain: number;
}

/** Weight expression for one gaussian blob. */
const blobWeight = (b: Blob): string =>
  `(${b.gain.toFixed(2)}*exp(-(pow(X-${b.cx.toFixed(1)}\\,2)+pow(Y-${b.cy.toFixed(1)}\\,2))/${(2 * b.sigma * b.sigma).toFixed(1)}))`;

function channelExpr(
  blobs: Blob[],
  channel: keyof Rgb,
  horizon: { y: number; softness: number; amount: number },
  shaft: { x: number; slope: number; width: number; amount: number; colour: Rgb },
): string {
  const num = blobs
    .map((b) => `(${b.colour[channel].toFixed(1)}*${blobWeight(b)})`)
    .join("+");
  const den = blobs.map((b) => blobWeight(b)).join("+");

  // Smooth logistic step: full brightness above the horizon, attenuated below.
  const horizonFactor = `(1-${horizon.amount.toFixed(3)}/(1+exp(-(Y-${horizon.y.toFixed(1)})/${horizon.softness.toFixed(2)})))`;

  // A soft diagonal band of light, added on top of the colour field.
  const shaftTerm = `(${(shaft.amount * shaft.colour[channel]).toFixed(2)}*exp(-pow(X-(${shaft.x.toFixed(1)}+(Y*${shaft.slope.toFixed(3)}))\\,2)/${(2 * shaft.width * shaft.width).toFixed(1)}))`;

  const field = `((${num})/(0.0001+${den}))*${horizonFactor}+${shaftTerm}`;
  return `clip(${BIT_SCALE.toFixed(4)}*(${field})\\,0\\,${BIT_MAX})`;
}

export function createLocalImageProvider(): ImageProvider {
  return {
    kind: "local",

    async generate(req: ImageRequest): Promise<ImageResult> {
      const style = styleById(req.styleId);
      const rng = mulberry32(req.seed >>> 0);

      const aspect = req.height / req.width;
      const w = FIELD_W;
      const h = Math.max(96, Math.round(FIELD_W * aspect));

      const palette = style.palette.map(hexToRgb);
      // palette[0] is near-black in every template. Using it as a mass makes
      // the whole frame collapse, so the anchors use the second-darkest tone
      // and blackness is left to the vignette.
      const anchor = palette[1] ?? palette[0]!;
      const mid = palette[Math.min(2, palette.length - 1)]!;
      const light = palette[palette.length - 1]!;
      const accent = palette[Math.min(3, palette.length - 1)]!;

      // A composition is: one dominant light mass, two supporting mid masses,
      // and two dark masses anchoring opposite corners. Positions jitter per
      // seed, so no two scenes frame the same way.
      const blobs: Blob[] = [
        {
          cx: w * (0.18 + rng() * 0.64),
          cy: h * (0.12 + rng() * 0.36),
          sigma: w * (0.19 + rng() * 0.1),
          colour: light,
          gain: 1.7,
        },
        {
          cx: w * (0.06 + rng() * 0.5),
          cy: h * (0.32 + rng() * 0.45),
          sigma: w * (0.22 + rng() * 0.12),
          colour: accent,
          gain: 1.25,
        },
        {
          cx: w * (0.42 + rng() * 0.52),
          cy: h * (0.38 + rng() * 0.5),
          sigma: w * (0.2 + rng() * 0.12),
          colour: mid,
          gain: 1.1,
        },
        {
          cx: w * (rng() * 0.28),
          cy: h * (0.72 + rng() * 0.3),
          sigma: w * 0.26,
          colour: anchor,
          gain: 0.8,
        },
        {
          cx: w * (0.76 + rng() * 0.3),
          cy: h * (rng() * 0.22),
          sigma: w * 0.24,
          colour: anchor,
          gain: 0.8,
        },
      ];

      const horizon = {
        y: h * (0.54 + rng() * 0.26),
        softness: h * (0.05 + rng() * 0.09),
        amount: 0.16 + rng() * 0.2,
      };

      const shaft = {
        x: w * (0.1 + rng() * 0.8),
        slope: (rng() - 0.5) * 1.3,
        width: w * (0.035 + rng() * 0.07),
        amount: 0.18 + rng() * 0.3,
        colour: light,
      };

      const r = channelExpr(blobs, "r", horizon, shaft);
      const g = channelExpr(blobs, "g", horizon, shaft);
      const b = channelExpr(blobs, "b", horizon, shaft);

      const { contrast, saturation, brightness, vignette, grain } = style.grade;

      const vf = [
        // 10-bit all the way through evaluation, upscaling and grading.
        "format=gbrp10le",
        `geq=r='${r}':g='${g}':b='${b}'`,
        `scale=${req.width}:${req.height}:flags=bicubic`,
        `gblur=sigma=${(req.width / 360).toFixed(2)}`,
        // A small positive exposure offset keeps the darker templates from
        // reading as black once the vignette lands on top.
        `eq=contrast=${contrast}:saturation=${saturation}:brightness=${(brightness + 0.035).toFixed(3)}`,
        `vignette=PI/${(5.0 - vignette).toFixed(2)}`,
        // Dither on the way back down to 8-bit, then film grain on top.
        "format=rgb24",
        `noise=alls=${Math.max(3, Math.round(grain))}:allf=t+u`,
        "format=rgb24",
      ]
        .filter(Boolean)
        .join(",");

      const dir = await mkdtemp(join(tmpdir(), "fvs-img-"));
      const out = join(dir, "frame.png");
      try {
        await run(
          await resolveBinary("ffmpeg"),
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=black:s=${w}x${h}:d=1`,
            "-vf",
            vf,
            "-frames:v",
            "1",
            "-update",
            "1",
            out,
          ],
          { maxBuffer: 1024 * 1024 * 8 },
        );
        return { png: await readFile(out), provider: "local:procedural" };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
