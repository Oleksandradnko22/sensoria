import StateSelectionPage from "./pages/StateSelectionPage";
import TestPage from "./components/test/TestPage";
import { useEffect, useState } from "react";
import Header from "./components/Header";
import TestimonialCard from "./components/TestimonialCard";
import AboutSection from "./components/AboutSection";
import ProgramsSection from "./components/ProgramsSection";
import TestPopup from "./components/TestPopup";
import Footer from "./components/Footer";
import ProgramPreviewModal from "./components/ProgramPreviewModal";
import ProgramsCatalogPage from "./components/ProgramsCatalogPage";
import FAQSection from "./components/FAQSection";
import GuidesCatalogPage from "./components/GuidesCatalogPage";

// тип программы
export type Program = {
  tag: import("react/jsx-runtime").JSX.Element;
  title: string;
  author: string;
  meta: string;
  description: string;
  price: string;

  recommended?: boolean;
};

const testimonials = [
  {
    text: "Я навчився керувати своїм станом і перестав вигорати.",
    name: "Ігор",
    age: "34 роки",
  },
  {
    text: "Раніше я постійно жила в стресі. Зараз я вперше відчула спокій.",
    name: "Анна",
    age: "29 років",
  },
  {
    text: "Це було саме те, що мені потрібно. Я почала краще розуміти себе.",
    name: "Марія",
    age: "27 років",
  },
  {
    text: "Після курсу я вперше за довгий час відчув внутрішній баланс.",
    name: "Олександр",
    age: "31 рік",
  },
];

const allPrograms = [
  {
    title: "Зниження тривожності",
    author: "Олена Мельник",
    meta: "6 модулів • 18 уроків",
    price: "1200",
    category: "anxiety",
    rating: 4.9,
    tag: "Рекомендована",
    recommended: true,
  },

  {
    title: "Робота зі стресом",
    author: "Андрій Коваленко",
    meta: "5 модулів • 16 уроків",
    price: "1500",
    category: "stress",
    rating: 4.8,
    createdAt: "2026-05-01",
  },

  {
    title: "Здорова самооцінка",
    author: "Марія Шевченко",
    meta: "6 модулів • 22 уроки",
    price: "0",
    category: "selfEsteem",
    rating: 4.7,
    tag: "Безкоштовна",
  },

  {
    title: "Здорова самооцінка",
    author: "Марія Шевченко",
    meta: "6 модулів • 22 уроки",
    price: "0",
    category: "selfEsteem",
    rating: 4.7,
    tag: "Безкоштовна",
  },

  {
    title: "Здорова самооцінка",
    author: "Марія Шевченко",
    meta: "6 модулів • 22 уроки",
    price: "0",
    category: "selfEsteem",
    rating: 4.7,
    tag: "Безкоштовна",
  },

  {
    title: "Усвідомленість у житті",
    author: "Ігор Петренко",
    meta: "4 модулі • 14 уроків",
    price: "900",
    category: "emotionalBalance",
    rating: 4.8,
    tag: "Рекомендована",
    recommended: true,
  },

  {
    title: "Контроль емоцій",
    author: "Світлана Бондар",
    meta: "5 модулів • 20 уроків",
    price: "1100",
    category: "stress",
    rating: 4.9,
    tag: "Рекомендована",
    recommended: true,
  },

  {
    title: "Здорові стосунки",
    author: "Анна Кравчук",
    meta: "7 модулів • 25 уроків",
    price: "1800",
    category: "relationships",
    rating: 4.9,
    tag: "Нова",
  },

  {
    title: "Контроль емоцій",
    author: "Світлана Бондар",
    meta: "5 модулів • 20 уроків",
    price: "1100",
    category: "stress",
    rating: 4.9,
    tag: "Рекомендована",
    recommended: true,
  },
];

export default function App() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [showArrow, setShowArrow] = useState(true);
  const [offset, setOffset] = useState(0);

 const [page, setPage] = useState<
  | "home"
  | "state-selection"
  | "test"
  | "catalog"
  | "guides"
>("home");

  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  // авто переключение карточек
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);

      setTimeout(() => {
        setIndex((prev) => (prev + 1) % testimonials.length);
        setVisible(true);
      }, 350);
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  // скролл
  useEffect(() => {
    const handleScroll = () => {
      setShowArrow(window.scrollY <= 100);
      setOffset(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const next = () => {
    setVisible(false);
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % testimonials.length);
      setVisible(true);
    }, 250);
  };

  // открыть программу

  // назад
  const goBack = () => {
    setPage("home");
    window.scrollTo(0, 0);
  };

  const openTest = () => {
  setPage("state-selection");
  window.scrollTo(0, 0);
};

  const openCatalog = () => {
  setPage("catalog");
  window.scrollTo(0, 0);
  }

  const openGuides = () => {
    setPage("guides");
    window.scrollTo(0, 0);
  };


if (page === "catalog") {
  return (
    <>
      <div
        className="
          min-h-screen
          bg-gradient-to-br
          from-[#1e3a8a]
          via-[#2563eb]
          to-[#8b5cf6]
        "
      >
        <Header 
        onOpenTest={openTest}
        onOpenCatalog={openCatalog}
        onOpenGuides={openGuides}
        />

        <ProgramsCatalogPage
          programs={allPrograms}
          onOpen={(program: any) => {
            setSelectedProgram(program);
          }}
        />
      </div>

      {selectedProgram && (
        <ProgramPreviewModal
          program={selectedProgram}
          onClose={() => setSelectedProgram(null)}
        />
      )}
    </>
  );
}

if (page === "guides") {
  return (
    <> 
      <div
        className="
          min-h-screen
          bg-gradient-to-br
          from-[#0f172a]
          via-[#172554]
          to-[#312e81]
          text-white
        "
      >
        <Header
  onOpenTest={openTest}
  onOpenCatalog={openCatalog}
  onOpenGuides={openGuides}
/>
        <GuidesCatalogPage />
      </div>
    </>
  );
}

if (page === "state-selection") {
  return (
    <div className="
      min-h-screen
      bg-gradient-to-br
      from-[#1e3a8a]
      via-[#2563eb]
      to-[#8b5cf6]
    ">
     <StateSelectionPage
        onContinue={() => {
          setPage("test");
        }}
      />
    </div>
  );
}

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white overflow-hidden">

      {/* BACKGROUND GLOW */}
      <div
        style={{ transform: `translateY(${offset * 0.2}px)` }}
        className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] bg-blue-400/30 rounded-full blur-[120px]"
      />

      <div
        style={{ transform: `translateY(${offset * -0.2}px)` }}
        className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] bg-purple-400/30 rounded-full blur-[120px]"
      />

      {/* HERO */}
      <section
        className="
        relative
        max-w-7xl mx-auto
        px-6
        pt-16 md:pt-20
        min-h-screen
        flex items-center
      "
      >
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-12 items-start w-full -mt-10">

          {/* LEFT */}
          <div className="flex flex-col justify-center gap-10">
            <h1 className="text-[49px] md:text-[58px] font-bold leading-[1.15] max-w-[600px]">
              Простір для розвитку, підтримки та глибоких змін
            </h1>

            <p className="text-lg text-white/80 max-w-[520px]">
              Проходьте психологічні програми від експертів, відкривайте нові
              інструменти для життя та рухайтесь до внутрішнього балансу у власному темпі.
            </p>

            <div className="flex gap-5">
              <button 
              onClick={openCatalog}
              className="px-7 py-3.5 bg-white text-black rounded-xl font-semibold hover:bg-gray-100 transition">
                Знайти програму
                </button>

              <button className="px-7 py-3.5 rounded-xl border border-white/40 hover:bg-white/10 transition">
                Стати автором
              </button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col items-center md:items-end gap-6 mt-10 md:mt-0">
            <div
              className={`transition-all duration-500 ${
                visible
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-6 scale-95"
              }`}
            >
              <TestimonialCard
                {...testimonials[index]}
                onNext={next}
              />
            </div>

            <div className="flex gap-2 justify-center w-full">
              {testimonials.map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition ${
                    i === index ? "bg-white" : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>

        </div>

        {/* SCROLL ARROW */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-6 transition-opacity duration-300 ${
            showArrow ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div
            onClick={() =>
              document.querySelector("#about")?.scrollIntoView({
                behavior: "smooth",
              })
            }
            className="cursor-pointer"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white/70 hover:text-white transition"
            >
              <path
                d="M6 9L12 15L18 9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

      </section>

      {/* ABOUT */}
      <div id="about">
        <AboutSection />
      </div>

      {/* PROGRAMS */}
      <ProgramsSection 
      onOpen={(program: Program) => {
        setSelectedProgram(program);
      }} 
    />

       <Header onOpenTest={openTest} 
       onOpenCatalog={openCatalog}
       onOpenGuides={openGuides} />

      {/* TEST POPUP */}
      <TestPopup onOpenTest={openTest} />

        {/* FAQ */}
      <FAQSection onOpenTest={openTest} />

      {selectedProgram && (
        <ProgramPreviewModal
          program={selectedProgram}
          onClose={() => setSelectedProgram(null)}
        />
      )}

      {/* FOOTER */}
      <Footer onOpenTest={openTest} />
    </div>
  );
}

