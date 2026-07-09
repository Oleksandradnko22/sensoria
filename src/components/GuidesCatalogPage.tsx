import { useMemo, useState } from "react";
import GuidePreviewModal from "./GuidesPreviewModal";

export default function GuidesCatalogPage() {
  const [search, setSearch] = useState("");

  const [selectedSort, setSelectedSort] =
    useState("Усі");

    const [visibleCount, setVisibleCount] =
  useState(6);
 
  const [selectedGuide, setSelectedGuide] = useState<any>(null);

  const [selectedPrice, setSelectedPrice] =
    useState("Усі ціни");

  const [selectedCategory, setSelectedCategory] =
    useState("Усі");

  const guides = [
    {
      title: "7 технік швидкого заспокоєння",
      author: "Олена Мельник",
      type: "PDF-гайд",
      pages: 24,
      price: "0",
      tag: "Безкоштовно",
      category: "PDF-гайди",
    },

    {
      title: "SOS при панічних атаках",
      author: "Андрій Коваленко",
      type: "Checklist",
      pages: 12,
      price: "290",
      tag: "Популярний",
      category: "Чек-листи",
    },

    {
      title: "Як зупинити overthinking",
      author: "Марія Шевченко",
      type: "Mini guide",
      pages: 18,
      price: "350",
      tag: "Новий",
      category: "Міні-гайди",
    },

    {
      title: "Антистрес чек-лист",
      author: "Ігор Петренко",
      type: "Checklist",
      pages: 10,
      price: "0",
      tag: "Безкоштовно",
      category: "Чек-листи",
    },

    {
      title: "Healthy boundaries",
      author: "Анна Кравчук",
      type: "Workbook",
      pages: 32,
      price: "490",
      category: "Воркбуки",
    },

    {
      title: "Digital detox",
      author: "Світлана Бондар",
      type: "PDF-гайд",
      pages: 20,
      price: "390",
      tag: "Популярний",
      category: "PDF-гайди",
    },

    {
  title: "Глибоке дихання",
  author: "Ірина Савчук",
  type: "PDF-гайд",
  pages: 16,
  price: "250",
  tag: "Новий",
  category: "PDF-гайди",
},

{
  title: "Mind reset",
  author: "Дарина Коваль",
  type: "Workbook",
  pages: 40,
  price: "590",
  category: "Воркбуки",
},

{
  title: "Швидка стабілізація",
  author: "Олександр Бойко",
  type: "Checklist",
  pages: 14,
  price: "0",
  tag: "Безкоштовно",
  category: "Чек-листи",
},

{
  title: "Focus system",
  author: "Марина Литвин",
  type: "Mini guide",
  pages: 22,
  price: "430",
  tag: "Популярний",
  category: "Міні-гайди",
},
  ];

  const filteredGuides = useMemo(() => {
    let filtered = [...guides];

    // SEARCH
    filtered = filtered.filter((guide) =>
      guide.title
        .toLowerCase()
        .includes(search.toLowerCase())
    );

    // PRICE
    if (selectedPrice === "Безкоштовно") {
      filtered = filtered.filter(
        (guide) => Number(guide.price) === 0
      );
    }

    if (selectedPrice === "До 1000₴") {
      filtered = filtered.filter(
        (guide) =>
          Number(guide.price) > 0 &&
          Number(guide.price) <= 1000
      );
    }

    if (selectedPrice === "1000–2000₴") {
      filtered = filtered.filter(
        (guide) =>
          Number(guide.price) >= 1000 &&
          Number(guide.price) <= 2000
      );
    }

    if (selectedPrice === "2000₴+") {
      filtered = filtered.filter(
        (guide) => Number(guide.price) > 2000
      );
    }

    // CATEGORY

    if (selectedSort === "Популярні") {
  filtered.sort((a, b) => {
    const aPopular =
      a.tag === "Популярний" ? 1 : 0;

    const bPopular =
      b.tag === "Популярний" ? 1 : 0;

    return bPopular - aPopular;
  });
}

    if (selectedCategory !== "Усі") {
      filtered = filtered.filter(
        (guide) =>
          guide.category === selectedCategory
      );
    }

    // SORT
    if (selectedSort === "Дешеві") {
      filtered.sort(
        (a, b) =>
          Number(a.price) - Number(b.price)
      );
    }

    if (selectedSort === "Дорогі") {
      filtered.sort(
        (a, b) =>
          Number(b.price) - Number(a.price)
      );
    }

    return filtered;
  }, [
    search,
    selectedSort,
    selectedPrice,
    selectedCategory,
  ]);

  return (
    <section
      className="
        relative
        min-h-screen
        overflow-hidden

        bg-gradient-to-b
        from-[#007a74]
        via-[#00a38d]
        to-[#38d6b5]

        text-white
        pt-[160px]
        pb-24
      "
    >
      {/* GLOW */}
      <div
        className="
          absolute
          top-[-200px]
          left-[-100px]

          w-[500px]
          h-[500px]

          rounded-full

          bg-[#00ffd0]/20
          blur-[120px]

          pointer-events-none
        "
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* HEADER */}
        <div className="mb-14">
          <h1 className="text-5xl font-bold mb-4">
            Каталог гайдів
          </h1>

          <p className="text-white/95 text-lg max-w-[700px]">
            Практичні PDF-матеріали, чеклисти та короткі
            інструкції для підтримки вашого ментального
            стану.
          </p>
        </div>

        {/* LAYOUT */}
        <div
          className="
            grid
            lg:grid-cols-[320px_1fr]
            gap-10
            items-start
          "
        >
          {/* SIDEBAR */}
          <div
            className="
              rounded-3xl
              p-6

              bg-white/10
              backdrop-blur-2xl

              border border-white/15
            "
          >
            {/* SEARCH */}
            <div className="mb-8">
              <div
                className="
                  text-[14px]
                  text-white/85
                  tracking-wide
                  uppercase
                  mb-3
                "
              >
                Пошук
              </div>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                type="text"
                placeholder="Пошук гайдів"
                className="
                  w-full
                  px-4 py-3
                  rounded-2xl

                  bg-white/10
                  border border-white/10

                  placeholder-white/40

                  focus:outline-none

                  text-[14px]
                  font-medium
                "
              />
            </div>

            {/* SORT */}
            <div className="mb-8">
              <div
                className="
                  text-[14px]
                  text-white/85
                  tracking-wide
                  uppercase
                  mb-3
                "
              >
                Сортування
              </div>

              <div className="flex flex-col gap-2">
                {[
                  "Усі",
                  "Популярні",
                  "Дешеві",
                  "Дорогі",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setSelectedSort(item)
                    }
                    className={`
                      w-full
                      text-left
                      px-4 py-3
                      rounded-2xl
                      text-[14px]
                      font-medium
                      transition-all
                      duration-200

                      ${
                        selectedSort === item
                          ? "bg-white text-black"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }
                    `}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* PRICE */}
            <div className="mt-8">
              <div
                className="
                  text-[14px]
                  text-white/85
                  tracking-wide
                  uppercase
                  mb-3
                "
              >
                Ціна
              </div>

              <div className="flex flex-col gap-2">
                {[
                  "Усі ціни",
                  "Безкоштовно",
                  "До 1000₴",
                  "1000–2000₴",
                  "2000₴+",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setSelectedPrice(item)
                    }
                    className={`
                      w-full
                      text-left
                      px-4 py-3
                      rounded-2xl
                      text-[14px]
                      font-medium
                      transition-all
                      duration-200

                      ${
                        selectedPrice === item
                          ? "bg-white text-black"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }
                    `}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* CATEGORIES */}
            <div className="mt-8">
              <div
              className="
                  text-[14px]
                  text-white
                  tracking-wide
                  uppercase
                  mb-3
                "
              >
                Категорії
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "Усі",
                  "Чек-листи",
                  "PDF-гайди",
                  "Воркбуки",
                  "Міні-гайди",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setSelectedCategory(item)
                    }
                    className={`
                      px-4 py-3
                      rounded-2xl
                      text-[14px]
                      font-medium
                      transition-all
                      duration-200

                      ${
                        selectedCategory === item
                          ? "bg-white text-black"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }
                    `}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CONTENT */}
          <div>
            {/* GRID */}
            <div
              className="
                grid
                grid-cols-1
                md:grid-cols-2
                xl:grid-cols-3
                gap-6
                justify-items-center
              "
            >
              {filteredGuides
              .slice(0, visibleCount)
              .map((guide) => {
                const isNew = 
                  guide.tag === "Новий";

                const isPopular =
                  guide.tag === "Популярний";

                const isFree =
                  Number(guide.price) === 0;

                return (
                  <div
                    key={guide.title}
                    onClick={() => setSelectedGuide(guide)}
                    className="
                      group
                      relative
                      overflow-hidden
                      cursor-pointer

                      rounded-[20px]

                      bg-white

                      shadow-[0_10px_40px_rgba(0,0,0,0.08)]

                      hover:-translate-y-1
                      transition-all
                      duration-200

                      min-h-[520px]

                      flex
                      flex-col
                      justify-between
                    "
                  >

                    {/* TOP */}
                    <div
                      className="
                        h-[140px]

                        bg-gradient-to-br
                        from-[#dffcf4]
                        to-[#b6ffe8]

                        border-b
                        border-black/5
                      "
                    />

                    {/* TAGS */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {isPopular && (
                        <div
                          className="
                            px-3 py-1
                            rounded-full

                            bg-purple-500

                            text-white
                            text-[11px]
                            font-medium
                          "
                        >
                          Популярний
                        </div>
                      )}

                      {isNew && (
                        <div
                          className="
                            px-3 py-1
                            rounded-full

                            bg-blue-500

                            text-white
                            text-[11px]
                            font-medium
                          "
                        >
                          Новий
                        </div>
                      )}

                      {isFree && (
                        <div
                          className="
                            px-3 py-1
                            rounded-full

                            bg-green-500

                            text-white
                            text-[11px]
                            font-medium
                          "
                        >
                          Безкоштовно
                        </div>
                      )}
                    </div>

                    {/* CONTENT */}
                    <div className="p-7 text-black">
                      {/* TITLE */}
                      <div className="min-h-[48px] flex items-start">
                        <h3
                          className="
                            text-[18px]
                            font-semibold
                            leading-[1.3]
                            text-black
                          "
                        >
                          {guide.title}
                        </h3>
                      </div>

                      {/* AUTHOR */}
                      <div className="mt-3 text-[14px] text-black/55">
                        {guide.author}
                      </div>

                      {/* META */}
                      <div className="mt-2 text-[13px] text-black/40">
                        {guide.type} • {guide.pages} стор.
                      </div>

                      {/* DESCRIPTION */}
                      <p
                        className="
                          mt-5
                          text-[14px]
                          leading-relaxed
                          text-black/70
                          min-h-[90px]
                        "
                      >
                        Практичний матеріал з техніками,
                        вправами та короткими інструкціями
                        для щоденного використання.
                      </p>

                      {/* PRICE */}
                      <div className="mt-6 text-[16px] font-semibold text-black">
                        {Number(guide.price) === 0
                          ? "Безкоштовно"
                          : `${guide.price}₴`}
                      </div>

                      {/* BUTTON */}
                      <button
                        className="
                          mt-6

                          w-full
                          py-3.5

                          rounded-[16px]

                          bg-gradient-to-r
                          from-[#00b894]
                          to-[#00d2a0]

                          text-white
                          text-[14px]
                          font-medium

                          hover:opacity-90

                          transition
                          duration-200
                        "
                      >
                        Відкрити гайд →
                      </button>
                    </div>
                  </div>
                );
              })}

              {visibleCount < filteredGuides.length && (
  <div className="col-span-full flex justify-center mt-12">

    <button
      onClick={() =>
        setVisibleCount((prev) => prev + 6)
      }
      className="
        px-8 py-4
        rounded-2xl

        bg-white/15
        hover:bg-white/25

        border border-white/15
        backdrop-blur-xl

        text-white
        font-medium

        transition-all
        duration-200
      "
    >
      Показати більше
    </button>

  </div>
)}
            </div>
          </div>
        </div>
      </div>

{selectedGuide && (
  <GuidePreviewModal
    guide={selectedGuide}
    onClose={() => setSelectedGuide(null)}
  />
)}
    </section>
  );
}