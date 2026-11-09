// THE font-size rule for the public author profile (header, tabs, feed,
// post page, materials, about, reviews, discussions). Five sizes, nothing
// in between — if a new element needs a size, it picks one of these:
//
//   24  profile name                     (PT.display)
//   20  post title, section title        (PT.title)
//   16  all reading text: bio, post body, about, reviews, comments, inputs (PT.body)
//   14  everything interactive or secondary: tabs, buttons, metadata,
//       counts, actions, chips, material title/meta                   (PT.ui)
//   12  captions and uppercase labels    (PT.caption)
//
// Weights: 700 name · 600 titles/author names · 500 links & buttons · 400 text.
// Do not write text-[13px] / text-[13.5px] / text-[15px] … in these files.
export const PT = {
  display: "text-[24px] font-bold tracking-tight leading-tight",
  title: "text-[20px] font-semibold leading-[1.3] tracking-tight",
  body: "text-[16px] leading-[1.55]",
  ui: "text-[14px] leading-tight",
  caption: "text-[12px] leading-tight",
} as const;

// Maps any legacy pixel size onto the scale (used by the unit test).
export function snapFontSize(px: number): 12 | 14 | 16 | 20 | 24 {
  if (px <= 12.9) return 12;
  if (px <= 14.9) return 14;
  if (px <= 17.9) return 16;
  if (px <= 21.9) return 20;
  return 24;
}
