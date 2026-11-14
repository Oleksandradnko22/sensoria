// Saved posts from «Спільнота» inside «Збережене» (participant cabinet): the same posts as «Спільнота → Збережені».
import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { openAuthorProfile } from "../../context/AuthorProfileContext";
import { Icon } from "../ui/Icon";
import FeedCard from "./FeedCard";
import { fetchFeed, type FeedPost } from "../../lib/authorPosts";
import { demoSaved } from "../../data/demoFeed";

export default function SavedPosts() {
  const session = useSession();
  const viewer = session?.profile ?? null;
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [open, setOpen] = useState(false);
  // real saved posts; while the feed is still a demo — the demo posts saved in this tab
  const load = () => {
    fetchFeed("saved", null, "new")
      .then((p) => setPosts(p.posts.length ? p.posts : [...demoSaved.values()]))
      .catch(() => setPosts([...demoSaved.values()]));
  };
  useEffect(() => {
    load();
    // a post saved in «Спільнота» shows up here when the person comes back to this tab
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  if (!posts || posts.length === 0) return null;
  const shown = posts.filter((p) => p.saved !== false);
  return (
    <section className="rounded-[24px] bg-white p-4 ring-1 ring-[#ece8fb] sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name="bookmark" size={18} filled /></span>
        <span className="flex-1">
          <span className="block text-[16px] font-semibold text-[#12172b]">Збережені публікації · {shown.length}</span>
          <span className="block text-[13px] text-black/55">Дописи зі «Спільноти», до яких ви хотіли повернутися</span>
        </span>
        <Icon name="chevron" size={18} className={`text-black/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((p) => (
            <FeedCard
              key={p.id}
              post={p}
              viewer={viewer}
              onOpenAuthor={p.authorIsAuthor ? () => openAuthorProfile(p.authorId) : undefined}
              onOpenContent={() => openAuthorProfile(p.authorId)}
              onChange={(next) => setPosts((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
