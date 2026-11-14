// «Досвід учасників» on a material's page: participants' posts about this material that its author asked to show
// and the participant agreed to (supabase/feeds.sql: post_features). First name + initial only.
import { useEffect, useState } from "react";
import Avatar from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { getInitials } from "../../lib/auth";
import { fetchMaterialStories, type MaterialStory } from "../../lib/feed";
import { MENTION_RE } from "../../utils/authorPosts";
import { formatPostDate } from "../../utils/authorProfileView";

export default function MaterialStories({ contentId, slug }: { contentId: string; slug?: string | null }) {
  const [stories, setStories] = useState<MaterialStory[]>([]);
  useEffect(() => { fetchMaterialStories(contentId, slug).then(setStories).catch(() => setStories([])); }, [contentId, slug]);
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="stories-title" className="mb-8">
      <h3 id="stories-title" className="flex items-center gap-2 text-[18px] font-bold text-[#12172b]"><span className="text-emerald-700"><Icon name="leaf" size={18} /></span> Досвід учасників</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {stories.slice(0, 4).map((s) => (
          <figure key={s.id} className="rounded-2xl bg-gradient-to-br from-emerald-50/70 to-white p-4 ring-1 ring-emerald-100">
            <blockquote className="line-clamp-6 whitespace-pre-line text-[14px] leading-relaxed text-[#2d2a5c]">{s.body.replace(MENTION_RE, "@$1")}</blockquote>
            <figcaption className="mt-3 flex items-center gap-2.5 text-[13px] text-black/55">
              <Avatar avatarUrl={s.avatarUrl} initials={getInitials(s.name)} className="h-8 w-8 text-[11px] text-white" />
              <span className="font-semibold text-[#12172b]">{s.name}</span> · {formatPostDate(s.createdAt)}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
