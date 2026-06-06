import { useMemo, useState } from "react";
import CourseCard from "./CourseCard";
import Footer from "./Footer";
import { getActiveTags,} from "../store/recommendationStore";

type Program = {
  title: string;
  author: string;
  meta: string;
  price: string;
  category: string;
  rating: number;

  tags: string[];
};

type Props = {
  programs: Program[];
  onOpen: (program: Program) => void;
};

const categories = [
  {
    id: "all",
    label: "Всі",
  },

  {
    id: "stress",
    label: "Стрес",
  },

  {
    id: "anxiety",
    label: "Тривожність",
  },

  {
    id: "burnout",
    label: "Вигорання",
  },

  {
    id: "relationships",
    label: "Стосунки",
  },

  {
    id: "motivation",
    label: "Мотивація",
  },

  {
    id: "selfEsteem",
    label: "Самооцінка",
  },

  {
    id: "emotionalBalance",
    label: "Емоційний баланс",
  },

  {
    id: "other",
    label: "Інше",
  },
];

export default function ProgramsCatalogPage({
  programs,
  onOpen,
}: Props) {

  const [selectedCategory, setSelectedCategory] =
    useState("all");

  const [search, setSearch] =
  useState("");

  const [priceFilter, setPriceFilter] =
  useState("all");

  const [sort, setSort] =
    useState("popular");

  const [visibleCount, setVisibleCount] =
    useState(6);

  const recommendationTags = getActiveTags();

  const filteredPrograms = useMemo(() => {

    let filtered = [...programs];

    if (
  recommendationTags.length > 0 &&
  selectedCategory === "all"
) {

  filtered.sort((a, b) => {

    const aMatches =
      a.tags?.filter(tag =>
        recommendationTags.includes(tag)
      ).length || 0;

    const bMatches =
      b.tags?.filter(tag =>
        recommendationTags.includes(tag)
      ).length || 0;

    return bMatches - aMatches;
  });
}

    // CATEGORY
    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (p) =>
          p.category === selectedCategory
      );
    }

    // SEARCH
filtered = filtered.filter((p) =>
  p.title
    .toLowerCase()
    .includes(search.toLowerCase())
);

// PRICE

if (priceFilter === "free") {
  filtered = filtered.filter(
    (p) => Number(p.price) === 0
  );
}

if (priceFilter === "low") {
  filtered = filtered.filter(
    (p) =>
      Number(p.price) > 0 &&
      Number(p.price) <= 1000
  );
}

if (priceFilter === "medium") {
  filtered = filtered.filter(
    (p) =>
      Number(p.price) >= 1000 &&
      Number(p.price) <= 2000
  );
}

if (priceFilter === "high") {
  filtered = filtered.filter(
    (p) => Number(p.price) > 2000
  );
}

    // SORT
    if (sort === "rating") {
      filtered.sort(
        (a, b) => b.rating - a.rating
      );
    }

    if (sort === "cheap") {
      filtered.sort(
        (a, b) =>
          Number(a.price) -
          Number(b.price)
      );
    }

    if (sort === "expensive") {
      filtered.sort(
        (a, b) =>
          Number(b.price) -
          Number(a.price)
      );
    }

    return filtered;

  }, [programs, selectedCategory, sort, search, priceFilter]);

  return (
    <>
      <div className="
        min-h-screen
        text-white
        pt-[160px]
      ">

        <div className="max-w-7xl mx-auto px-6">

          {/* HEADER */}
          <div className="mb-14">

            <h1 className="text-5xl font-bold mb-4">
              Каталог програм
            </h1>

            <p className="text-white/70 text-lg">
              Оберіть напрямок підтримки для себе
            </p>

          </div>

          {/* LAYOUT */}
          <div className="
            grid
            lg:grid-cols-[320px_1fr]
            gap-10
            items-start
          ">

            {/* SIDEBAR */}
            <div className="

              rounded-3xl
              p-6

              bg-white/10
              backdrop-blur-2xl

              border border-white/15
            ">

              {/* SEARCH */}
              <div className="mb-8">

                <div className="
                  text-[14px]
                  text-white/60
                  tracking-wide uppercase
                  mb-3
                ">
                  Пошук
                </div>

                <input
                  type="text"
                  placeholder="Пошук програм"
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
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

                <div className="
                  text-[14px]
                  text-white/60
                  tracking-wide uppercase
                  mb-3
                ">
                  Сортування
                </div>

                <div className="flex flex-col gap-2">

                  {[
                    {
                      id: "popular",
                      label: "Популярні",
                    },

                    {
                      id: "rating",
                      label: "Рейтинг",
                    },

                    {
                      id: "cheap",
                      label: "Дешеві",
                    },

                    {
                      id: "expensive",
                      label: "Дорогі",
                    },

                  ].map((item) => {

                    const active =
                      sort === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() =>
                          setSort(item.id)
                        }
                        className={`
                          px-4 py-3 rounded-2xl
                          text-left
                          transition

                          text-[14px]
                         font-medium

                          ${
                            active
                              ? "bg-white text-black"
                              : "bg-white/5 hover:bg-white/10"
                          }
                        `}
                      >
                        {item.label}
                      </button>
                    );
                  })}

                </div>

              </div>

{/* PRICE */}

<div className="mb-8">

  <div className="
    text-[14px]
    text-white/60
    tracking-wide uppercase
    mb-3
  ">
    Ціна
  </div>

  <div className="flex flex-col gap-2">

    {[
      {
        id: "all",
        label: "Усі ціни",
      },

      {
        id: "free",
        label: "Безкоштовно",
      },

      {
        id: "low",
        label: "До 1000₴",
      },

      {
        id: "medium",
        label: "1000–2000₴",
      },

      {
        id: "high",
        label: "2000₴+",
      },

    ].map((item) => {

      const active =
        priceFilter === item.id;

      return (
        <button
          key={item.id}
          onClick={() =>
            setPriceFilter(item.id)
          }
          className={`
            px-4 py-3 rounded-2xl
            text-left
            transition
            text-[14px]
                    font-medium

            ${
              active
                ? "bg-white text-black"
                : "bg-white/5 hover:bg-white/10"
            }
          `}
        >
          {item.label}
        </button>
      );
    })}

  </div>

</div>

              {/* CATEGORIES */}
              <div>

                <div className="
                  text-[14px]
                  text-white/60
                  tracking-wide uppercase
                  mb-3
                ">
                  Категорії
                </div>

                <div className="flex flex-wrap gap-2">

                  {categories.map((category) => {

                    const active =
                      selectedCategory === category.id;

                    return (
                      <button
                        key={category.id}
                        onClick={() =>
                          setSelectedCategory(
                            category.id
                          )
                        }
                        className={`
                          px-4 py-2 rounded-xl
                          text-[14px] transition
                    font-medium

                          ${
                            active
                              ? "bg-white text-black"
                              : "bg-white/5 hover:bg-white/10"
                          }
                        `}
                      >
                        {category.label}
                      </button>
                    );
                  })}

                </div>

              </div>

            </div>

            {/* CONTENT */}
            <div>

              {/* GRID */}
              <div className="
                grid
                grid-cols-1
                md:grid-cols-2
                xl:grid-cols-3
                gap-6
                justify-items-center
              ">

                {filteredPrograms
                  .slice(0, visibleCount)
                  .map((program, i) => (

                  <CourseCard
                    key={i}
                    program={program}
                    onClick={() => onOpen(program)}
                  />

                ))}

              </div>

              {/* LOAD MORE */}
              {visibleCount <
                filteredPrograms.length && (

                <div className="
                  flex justify-center
                  mt-14
                ">

                  <button
                    onClick={() =>
                      setVisibleCount(
                        (prev) => prev + 6
                      )
                    }
                    className="
                      px-8 py-4 rounded-2xl

                      bg-white/10
                      border border-white/15

                      backdrop-blur-xl

                      hover:bg-white/15
                      transition
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

      <Footer />
    </>
  );
}