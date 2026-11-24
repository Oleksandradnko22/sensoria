import logo from "../assets/logo.png";

// Before the platform opens (src/data/launch.ts) the author pages show only the logo: no search, catalog, sign-in or cart
// — the first authors come in through the application, and those links lead nowhere yet.
export default function PrelaunchHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="page-container flex items-center justify-between gap-3 py-4 sm:py-5">
        <span className="inline-flex items-center gap-2 text-white">
          <img src={logo} alt="" className="h-8 w-8 object-contain brightness-0 invert" />
          <span className="text-[17px] font-semibold tracking-wide">SENSORIA</span>
        </span>
      </div>
    </header>
  );
}
