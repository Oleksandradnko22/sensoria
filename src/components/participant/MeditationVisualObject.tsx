import type { MeditationVisualFamily } from "../../lib/meditationVisualFamily";
import { tintWithNavy } from "../../lib/meditationPalette";

// The meditation's own atmospheric identity object — now a small
// FAMILY SYSTEM, not one fixed shape (2026-09-25, per Sasha's explicit
// spec section 11: "Create a reusable visual system where different
// meditation themes can have different visual objects... without
// requiring a new component architecture for every meditation"). Same
// underlying building block throughout — layered blurred organic
// blobs, irregular asymmetric border-radius, never circles, never an
// icon/emoji/waveform — but GROUNDING/SLEEP/SELF-SUPPORT/FOCUS/CALM
// each arrange and animate that block differently (see the per-family
// `configs` below), so the object itself becomes a felt emotional
// signal for the kind of practice this is, not just a color swap.
// `family` comes from lib/meditationVisualFamily.ts, derived from the
// meditation's own real tags — nothing new to author, nothing fake.
export default function MeditationVisualObject({
  family,
  pc1,
  pc2,
  pc3,
}: {
  family: MeditationVisualFamily;
  pc1: string;
  pc2: string;
  pc3: string;
}) {
  if (family === "sleep") {
    // SLEEP — slow dark-blue floating forms, per Sasha's explicit spec.
    // Colors mixed toward navy (tintWithNavy) instead of the usual
    // white-lifted pastel, and the shapes drift vertically/slowly past
    // each other like something floating rather than breathing in
    // place — a felt sense of night, not daytime softness.
    const d1 = tintWithNavy(pc1, 0.45);
    const d2 = tintWithNavy(pc3, 0.55);
    const d3 = tintWithNavy(pc2, 0.35);
    return (
      <div className="relative w-full max-w-[440px] aspect-square mx-auto overflow-hidden rounded-[40%]">
        <div className="absolute inset-0 rounded-[40%]" style={{ background: tintWithNavy(pc2, 0.8) }} />
        <div
          className="absolute w-[70%] h-[70%] left-[10%] top-[5%] rounded-[55%_45%_60%_40%/50%_60%_40%_50%] blur-[36px] opacity-80"
          style={{ background: `radial-gradient(circle at 40% 30%, ${d1}, transparent 72%)`, animation: "sensoria-drift-vertical 16s ease-in-out infinite" }}
        />
        <div
          className="absolute w-[55%] h-[55%] left-[30%] top-[35%] rounded-[45%_55%_35%_65%/55%_45%_65%_35%] blur-[30px] opacity-70"
          style={{ background: `radial-gradient(circle at 60% 60%, ${d2}, transparent 70%)`, animation: "sensoria-drift-vertical 20s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute w-[36%] h-[36%] left-[20%] top-[52%] rounded-full blur-[18px] opacity-90"
          style={{ background: `radial-gradient(circle, ${d3}, transparent 75%)`, animation: "sensoria-drift-vertical 12s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-0 rounded-[40%] mix-blend-overlay opacity-30"
          style={{ background: "radial-gradient(circle at 25% 15%, rgba(255,255,255,0.7), transparent 50%)" }}
        />
      </div>
    );
  }

  if (family === "selfSupport") {
    // SELF-SUPPORT — two curved forms leaning into each other, an
    // "embrace" composition rather than a single mass (per Sasha's
    // explicit spec: "warm soft embracing forms"). Kept inside the
    // brand's own blue/lavender/cyan family (no true warm hues), the
    // warmth comes from the COMPOSITION — two shapes meeting in the
    // middle — not from the hue itself.
    return (
      <div className="relative w-full max-w-[440px] aspect-square mx-auto">
        <div
          className="absolute w-[62%] h-[62%] left-[2%] top-[18%] rounded-[65%_35%_55%_45%/60%_45%_55%_40%] blur-[38px] opacity-80"
          style={{ background: `radial-gradient(circle at 65% 45%, ${pc1}, transparent 72%)`, animation: "sensoria-breathe-a 13s ease-in-out infinite" }}
        />
        <div
          className="absolute w-[62%] h-[62%] right-[2%] top-[18%] rounded-[35%_65%_45%_55%/45%_60%_40%_55%] blur-[38px] opacity-80"
          style={{ background: `radial-gradient(circle at 35% 45%, ${pc3}, transparent 72%)`, animation: "sensoria-breathe-b 15s ease-in-out infinite" }}
        />
        <div
          className="absolute w-[30%] h-[30%] left-[35%] top-[38%] rounded-full blur-[20px] opacity-75"
          style={{ background: `radial-gradient(circle, ${pc2}, transparent 75%)`, animation: "sensoria-breathe-a 8s ease-in-out infinite reverse" }}
        />
        <div className="absolute inset-[36%] rounded-full border border-white/55" />
        <div
          className="absolute inset-0 rounded-full mix-blend-overlay opacity-40"
          style={{ background: "radial-gradient(circle at 40% 25%, rgba(255,255,255,0.9), transparent 55%)" }}
        />
      </div>
    );
  }

  if (family === "focus") {
    // FOCUS — a centered luminous point, deliberately contained rather
    // than sprawling (per Sasha's explicit spec: "centered luminous
    // point"). One small bright core with thin concentric rings —
    // almost no organic spread — pulsing gently in place instead of
    // drifting, since the felt sense here is concentration, not flow.
    return (
      <div className="relative w-full max-w-[440px] aspect-square mx-auto flex items-center justify-center">
        <div className="absolute w-[55%] h-[55%] rounded-full border border-white/40" />
        <div className="absolute w-[38%] h-[38%] rounded-full border border-white/55" />
        <div
          className="absolute w-[46%] h-[46%] rounded-full blur-[30px] opacity-70"
          style={{ background: `radial-gradient(circle, ${pc1}, transparent 70%)`, animation: "sensoria-pulse-core 7s ease-in-out infinite" }}
        />
        <div
          className="relative w-[18%] h-[18%] rounded-full"
          style={{ background: `radial-gradient(circle at 40% 35%, #fff, ${pc3} 55%, ${pc2} 100%)`, boxShadow: `0 0 40px 8px ${pc1}55`, animation: "sensoria-pulse-core 7s ease-in-out infinite" }}
        />
      </div>
    );
  }

  if (family === "calm") {
    // CALM — fluid, layered, visibly moving rather than just breathing
    // in place (per Sasha's explicit spec: "fluid layered movement").
    // A slow shared rotation on top of the usual per-layer breathing is
    // what reads as "flowing" rather than "pulsing".
    return (
      <div className="relative w-full max-w-[440px] aspect-square mx-auto" style={{ animation: "sensoria-rotate-slow 40s linear infinite" }}>
        <div
          className="absolute inset-[8%] rounded-[55%_45%_65%_35%/45%_55%_35%_65%] blur-[40px] opacity-80"
          style={{ background: `radial-gradient(circle at 30% 35%, ${pc1}, transparent 72%)`, animation: "sensoria-breathe-a 11s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-[18%] rounded-[45%_55%_35%_65%/55%_45%_65%_35%] blur-[30px] opacity-70"
          style={{ background: `radial-gradient(circle at 68% 65%, ${pc2}, transparent 70%)`, animation: "sensoria-breathe-b 14s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-[30%] rounded-[50%_50%_60%_40%/40%_60%_50%_50%] blur-[22px] opacity-65"
          style={{ background: `radial-gradient(circle at 50% 40%, ${pc3}, transparent 75%)`, animation: "sensoria-breathe-a 9s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute inset-0 rounded-full mix-blend-overlay opacity-35"
          style={{ background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.85), transparent 55%)" }}
        />
      </div>
    );
  }

  // GROUNDING (default) — a large, anchored, low-sitting mass rather
  // than something centered/floating (per Sasha's explicit spec:
  // "stable layered organic mass... light concentrated around a stable
  // center"). Weight sits toward the bottom of the frame, motion is
  // minimal (scale only, no drift), and a small thin ring anchors right
  // where the mass is heaviest — a quiet built-in "Sensoria symbol"
  // marking the stable center the spec asks for.
  //
  // 2026-09-29 refinement, per Sasha's explicit call to keep this exact
  // abstract composition but make it feel more alive: the center ring
  // used to be a perfectly static outline sitting on top of an already-
  // moving mass, which read as flat next to it — now it has its own
  // slow pulse (sensoria-pulse-ring) plus a second, larger, fainter
  // echo ring a beat behind it, like a single slow heartbeat radiating
  // outward from the stable point rather than a fixed marker. A handful
  // of tiny drifting light motes (sensoria-mote-drift/-twinkle) settle
  // around the base of the mass for texture at a glance — never drawing
  // attention on their own, staggered durations/delays so they never
  // move in unison. Nothing about the mass/palette/layout itself
  // changed, only these additions.
  return (
    <div className="relative w-full max-w-[440px] aspect-square mx-auto">
      <div
        className="absolute w-[78%] h-[68%] left-[11%] bottom-[6%] rounded-[55%_45%_40%_60%/60%_55%_45%_40%] blur-[40px] opacity-[0.85]"
        style={{ background: `radial-gradient(circle at 45% 55%, ${pc1}, transparent 74%)`, animation: "sensoria-breathe-anchor 13s ease-in-out infinite" }}
      />
      <div
        className="absolute w-[52%] h-[46%] left-[26%] bottom-[10%] rounded-[45%_55%_50%_50%/50%_45%_55%_50%] blur-[28px] opacity-75"
        style={{ background: `radial-gradient(circle at 55% 45%, ${pc3}, transparent 70%)`, animation: "sensoria-breathe-anchor 17s ease-in-out infinite reverse" }}
      />
      <div
        className="absolute w-[30%] h-[26%] left-[36%] bottom-[16%] rounded-[50%_50%_45%_55%/55%_50%_50%_45%] blur-[18px] opacity-70"
        style={{ background: `radial-gradient(circle at 50% 40%, ${pc2}, transparent 75%)` }}
      />
      {/* Tiny settling light motes — purely decorative texture near the
          anchor, each on its own drift + twinkle timing so the cluster
          never reads as a single repeating loop. */}
      <div
        className="absolute w-[3%] h-[3%] left-[33%] bottom-[30%] rounded-full bg-white/80"
        style={{ animation: "sensoria-mote-drift 9s ease-in-out infinite, sensoria-twinkle 4.5s ease-in-out infinite" }}
      />
      <div
        className="absolute w-[2%] h-[2%] left-[60%] bottom-[35%] rounded-full bg-white/70"
        style={{ animation: "sensoria-mote-drift 11s ease-in-out infinite reverse, sensoria-twinkle 6s ease-in-out infinite 1.2s" }}
      />
      <div
        className="absolute w-[2.4%] h-[2.4%] left-[47%] bottom-[46%] rounded-full bg-white/75"
        style={{ animation: "sensoria-mote-drift 7.5s ease-in-out infinite, sensoria-twinkle 5s ease-in-out infinite 2.4s" }}
      />
      {/* The stable-center marker — anchored low, where the mass is
          heaviest, not floating in the middle of the frame. Now a slow
          single-beat pulse (ring + a fainter, larger echo a touch behind
          it) instead of a fixed static outline. */}
      <div
        className="absolute w-[19%] h-[19%] left-[40.5%] bottom-[21%] rounded-full border border-white/25"
        style={{ animation: "sensoria-pulse-ring 6s ease-in-out infinite" }}
      />
      <div
        className="absolute w-[13%] h-[13%] left-[43.5%] bottom-[24%] rounded-full border border-white/60"
        style={{ animation: "sensoria-pulse-ring 6s ease-in-out infinite 0.4s" }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay opacity-40"
        style={{ background: "radial-gradient(circle at 35% 20%, rgba(255,255,255,0.9), transparent 55%)" }}
      />
    </div>
  );
}

